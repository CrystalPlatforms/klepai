//! Agent collision guard + worktree integration tests (issues #38–#41).
//!
//! Assumptions these tests encode:
//! - Every agent send resolves its working folder through
//!   `resolve_send_cwd` (commands.rs) — the same function the Tauri send
//!   command calls — so driving it directly drives the real chokepoint.
//!   The command adds registry insert/remove around it, which the registry
//!   lifecycle test drives the same way.
//! - Collision = equal canonical paths or one folder inside the other
//!   (component boundary): `proj2` is NOT inside `proj`, `proj/sub` is.
//! - Paths behave like production: the registry stores canonicalized
//!   paths (the app canonicalizes on set and on every check), and stored
//!   project folders are canonicalized strings — so tests seed canonical
//!   strings too. `collision::plain` is what lets git accept those
//!   extended-length (`\\?\`) Windows paths.
//! - A `~/x` stored path resolves through the (injectable) home — tests
//!   seed a fake home instead of touching the real one (precedent:
//!   `cli_models_in_home`).
//! - Natural mode (ReadOnly) runs in the home directory and never
//!   consults the registry — no worktree, no refusal, no override.
//! - "Run anyway" proceeds on the raw folder; "worktree" creates the
//!   sibling copy `../<dir>-klepai-<id>` on branch `klepai/agent-<id>`,
//!   registers the override, and re-choosing reuses the copy (naming
//!   convention is the persistence).
//! - Registry stores the EFFECTIVE cwd: a worktree run does not collide
//!   with a raw run on the same project; two raw runs still collide.
//! - Worktree runs close the loop at run end: changes → auto-commit on
//!   the branch (conversation referenced in the message); zero changes →
//!   no commit (the command layer maps that to the informational state).
//! - Merge-back: "merge" lands the changes and removes branch+worktree;
//!   "keep branch" removes the worktree only; a conflict aborts with the
//!   main checkout exactly as it was and both branch+worktree intact, and
//!   the listed manual merge (after the user resolves) succeeds.
//! - Tests need a system `git` on PATH; each test works only inside its
//!   own scratch folder under the temp dir.

use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use klepai_lib::agent::AgentAccess;
use klepai_lib::collision::{self, MergeOutcome, RunRegistry, WorktreeOverrides};
use klepai_lib::commands::resolve_send_cwd;
use klepai_lib::store::AgentKind;

static NEXT_ID: AtomicU64 = AtomicU64::new(1);

/// Serializes repo seeding: under parallel tests Windows can briefly lock
/// fresh .git dirs (antivirus/index.lock), which flakes the first commit.
static SEED_LOCK: Mutex<()> = Mutex::new(());

/// A unique scratch folder per test — parallel tests never share one, and
/// any leftover from a previous run of this binary is wiped first (the
/// counter restarts at 1 each run, so names repeat across runs).
fn scratch(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "klepai-collision-{}-{}",
        name,
        NEXT_ID.fetch_add(1, Ordering::SeqCst)
    ));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("scratch dir should be created");
    dir
}

/// The canonical form — what production stores in the DB and the registry.
fn canon(dir: &Path) -> PathBuf {
    dir.canonicalize().expect("scratch dir should resolve")
}

/// Runs git synchronously and panics on failure — tests seed and assert,
/// they don't handle git errors.
/// Runs git and panics on failure — tests seed and assert, they don't
/// handle git errors. The seed burst spawns git rapidly, and Windows
/// (Defender/index.lock) occasionally holds a fresh .git dir for a beat —
/// retry a few times before giving up, and dump the FULL state on defeat:
/// silent non-zero exits need the exit code and both streams to diagnose.
fn git(dir: &Path, args: &[&str]) -> String {
    let mut attempts = Vec::new();
    for attempt in 0..5 {
        let output = git_raw(dir, args);
        if output.status.success() {
            return String::from_utf8_lossy(&output.stdout).trim().to_string();
        }
        attempts.push(format!(
            "attempt {}: code={:?} stdout={:?} stderr={:?}",
            attempt,
            output.status.code(),
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr),
        ));
        std::thread::sleep(Duration::from_millis(100 * (attempt + 1)));
    }
    let state = git_raw(dir, &["status"]).status;
    panic!(
        "git {args:?} failed 5 times in {}:\n{}\nstatus probe: {:?}",
        dir.display(),
        attempts.join("\n"),
        state,
    );
}

/// Non-panicking git for the paths a test deliberately drives to failure.
fn git_raw(dir: &Path, args: &[&str]) -> std::process::Output {
    Command::new("git")
        .args(args)
        .current_dir(dir)
        .env("GIT_AUTHOR_NAME", "Klepai Tests")
        .env("GIT_AUTHOR_EMAIL", "tests@klepai.local")
        .env("GIT_COMMITTER_NAME", "Klepai Tests")
        .env("GIT_COMMITTER_EMAIL", "tests@klepai.local")
        .output()
        .expect("git should be runnable")
}

fn git_ok(dir: &Path, args: &[&str]) -> bool {
    git_raw(dir, args).status.success()
}

/// Seeds the least a worktree needs: a one-commit repo on `main`.
/// `core.autocrlf=false` keeps content byte-exact on Windows checkouts.
fn seed_repo(dir: &Path) {
    // A poisoned lock (one panicking seeder) must not cascade into every
    // other test's seed — the data itself stays consistent.
    let _guard = SEED_LOCK.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    git(dir, &["init", "-b", "main"]);
    git(dir, &["config", "core.autocrlf", "false"]);
    std::fs::write(dir.join("README.md"), "seed\n").expect("seed file");
    git(dir, &["add", "-A"]);
    git(dir, &["commit", "-m", "seed"]);
}

/// A registry entry — canonical cwd, per the production contract.
fn run_in(cwd: &Path) -> collision::ActiveRun {
    collision::ActiveRun {
        cwd: canon(cwd),
        agent_kind: Some(AgentKind::ClaudeCode),
        generation_id: 1,
    }
}

/// Removes a stale worktree sibling from an earlier run of this binary:
/// scratch() cleans the repo folder, but the sibling sits BESIDE it — and
/// the naming convention is the persistence, so a broken leftover would be
/// found again by create.
fn clear_stale_worktree(canonical: &Path, id: i64) {
    if let Ok(sibling) = collision::worktree_dir_for(canonical, id) {
        let _ = std::fs::remove_dir_all(sibling);
    }
}

fn no_title(_: i64) -> Option<String> {
    None
}

fn titled(name: &'static str) -> impl Fn(i64) -> Option<String> + Send + Sync {
    move |_| Some(name.to_string())
}

/// Drives the chokepoint the way the send command does (agent access).
/// `project` is the stored (canonical) path string, like production.
async fn resolve_agent(
    home: Option<PathBuf>,
    project: Option<&str>,
    id: i64,
    runs: &RunRegistry,
    worktrees: &tokio::sync::Mutex<WorktreeOverrides>,
    title: &(dyn Fn(i64) -> Option<String> + Send + Sync),
    choice: Option<&str>,
) -> Result<(PathBuf, bool), String> {
    resolve_send_cwd(home, AgentAccess::Full, project, id, runs, worktrees, title, choice).await
}

// ---- Issue #38: detection ----------------------------------------------------

#[tokio::test]
async fn registry_collides_on_equal_canonical_paths_and_excludes_self() {
    let dir = scratch("equal");
    let canonical = canon(&dir);
    let mut registry = RunRegistry::new();
    registry.insert(1, run_in(&dir));
    // A second conversation on the same folder collides with #1…
    assert_eq!(
        collision::find_collision(&registry, 2, &canonical).map(|(id, _)| id),
        Some(1)
    );
    // …while the asking conversation never collides with itself.
    assert!(collision::find_collision(&registry, 1, &canonical).is_none());
    std::fs::remove_dir_all(&dir).ok();
}

#[tokio::test]
async fn subfolder_collides_but_same_named_sibling_does_not() {
    let parent = scratch("boundary");
    let proj = parent.join("proj");
    let proj2 = parent.join("proj2");
    let sub = proj.join("sub");
    std::fs::create_dir_all(&sub).expect("proj/sub");
    std::fs::create_dir_all(&proj2).expect("proj2");
    let mut registry = RunRegistry::new();
    registry.insert(1, run_in(&proj));
    // Inside the run's folder — collides…
    assert_eq!(
        collision::find_collision(&registry, 2, &canon(&sub)).map(|(id, _)| id),
        Some(1)
    );
    // …and the inverse direction: the run lives inside the asker's folder.
    let mut inverse = RunRegistry::new();
    inverse.insert(2, run_in(&sub));
    assert_eq!(
        collision::find_collision(&inverse, 1, &canon(&proj)).map(|(id, _)| id),
        Some(2)
    );
    // `proj` vs `proj2`: component boundary keeps the false friend apart.
    assert!(collision::find_collision(&registry, 2, &canon(&proj2)).is_none());
    std::fs::remove_dir_all(&parent).ok();
}

#[tokio::test]
async fn home_relative_path_collides_with_its_expanded_absolute_form() {
    let home = scratch("fake-home");
    let proj = home.join("proj");
    std::fs::create_dir_all(&proj).expect("fake home proj");
    let mut registry = RunRegistry::new();
    registry.insert(7, run_in(&proj));
    let worktrees = tokio::sync::Mutex::new(WorktreeOverrides::new());
    // The stored `~/proj` form expands into the fake home and collides with
    // the same folder stored absolute.
    let error = resolve_agent(
        Some(home.clone()),
        Some("~/proj"),
        8,
        &registry,
        &worktrees,
        &titled("Bugfix run"),
        None,
    )
    .await
    .expect_err("a send under collision without a choice must be refused");
    // The refusal is structured and names the blocker.
    assert!(error.starts_with("collision:"), "got: {error}");
    assert!(error.contains("Bugfix run"), "got: {error}");
    std::fs::remove_dir_all(&home).ok();
}

#[tokio::test]
async fn run_anyway_proceeds_and_the_registry_lifecycle_closes() {
    let dir = scratch("proceed");
    let canonical = canon(&dir);
    let mut registry = RunRegistry::new();
    registry.insert(1, run_in(&dir));
    let worktrees = tokio::sync::Mutex::new(WorktreeOverrides::new());
    // Explicit "Run anyway": the run starts on the raw folder…
    let (cwd, in_worktree) = resolve_agent(
        None,
        Some(canonical.to_str().unwrap()),
        2,
        &registry,
        &worktrees,
        &no_title,
        Some("proceed"),
    )
    .await
    .expect("Run anyway must start the run");
    assert!(!in_worktree);
    assert_eq!(cwd, canonical);
    // …and the registry lifecycle: insert → collide → remove each → clear.
    registry.insert(2, run_in(&cwd));
    assert!(collision::find_collision(&registry, 3, &cwd).is_some());
    registry.remove(&2);
    // Run #1 still lives in the registry — the collision persists…
    assert!(collision::find_collision(&registry, 3, &cwd).is_some());
    // …until every run is gone.
    registry.remove(&1);
    assert!(collision::find_collision(&registry, 3, &cwd).is_none());
    assert!(registry.is_empty());
    std::fs::remove_dir_all(&dir).ok();
}

#[tokio::test]
async fn natural_mode_runs_in_home_and_never_checks_the_registry() {
    let proj = scratch("natural-proj");
    let home = scratch("natural-home");
    let mut registry = RunRegistry::new();
    registry.insert(1, run_in(&proj));
    let worktrees = tokio::sync::Mutex::new(WorktreeOverrides::new());
    // Read-only access: no refusal, no folder work, home as cwd.
    let (cwd, in_worktree) = resolve_send_cwd(
        Some(home.clone()),
        AgentAccess::ReadOnly,
        Some(canon(&proj).to_str().unwrap()),
        2,
        &registry,
        &worktrees,
        &no_title,
        None,
    )
    .await
    .expect("natural mode never runs the collision check");
    assert!(!in_worktree);
    assert_eq!(cwd, home);
    // No worktree override was created for the natural conversation.
    assert!(worktrees.lock().await.is_empty());
    std::fs::remove_dir_all(&proj).ok();
    std::fs::remove_dir_all(&home).ok();
}

// ---- Issue #39: worktree isolation -------------------------------------------

#[tokio::test]
async fn git_detection_tells_a_repo_from_a_plain_folder() {
    let repo = scratch("git-repo");
    let plain_dir = scratch("git-plain");
    seed_repo(&repo);
    assert!(collision::is_git_work_tree(&repo).await);
    assert!(!collision::is_git_work_tree(&plain_dir).await);
    std::fs::remove_dir_all(&repo).ok();
    std::fs::remove_dir_all(&plain_dir).ok();
}

#[tokio::test]
async fn worktree_choice_creates_the_sibling_copy_branch_and_override() {
    let repo = scratch("worktree-src");
    seed_repo(&repo);
    let mut registry = RunRegistry::new();
    registry.insert(1, run_in(&repo)); // raw agent A on the project
    clear_stale_worktree(&canon(&repo), 2); // resolve creates the sibling
    let worktrees = tokio::sync::Mutex::new(WorktreeOverrides::new());
    // Agent B chooses the worktree: the sibling copy and branch appear,
    // and B's runs execute there.
    let (cwd, in_worktree) = resolve_agent(
        None,
        Some(canon(&repo).to_str().unwrap()),
        2,
        &registry,
        &worktrees,
        &no_title,
        Some("worktree"),
    )
    .await
    .expect("worktree choice must create the copy");
    assert!(in_worktree);
    assert!(cwd.is_dir());
    assert_eq!(collision::branch_for(2), "klepai/agent-2");
    assert_eq!(
        git(&cwd, &["rev-parse", "--abbrev-ref", "HEAD"]),
        "klepai/agent-2"
    );
    // The override is registered for the conversation…
    assert_eq!(worktrees.lock().await.get(&2).cloned(), Some(cwd.clone()));
    // …and re-choosing reuses the existing copy (naming = persistence).
    let (again, _) = resolve_agent(
        None,
        Some(canon(&repo).to_str().unwrap()),
        2,
        &registry,
        &worktrees,
        &no_title,
        Some("worktree"),
    )
    .await
    .expect("re-choice must reuse the copy");
    assert_eq!(again, cwd);
    // Effective-cwd semantics: B's worktree run does NOT collide with a
    // raw run C on the same project. Run A legitimately collides with C,
    // so it steps out of the registry for this check…
    registry.remove(&1);
    registry.insert(2, run_in(&cwd));
    assert!(collision::find_collision(&registry, 3, &canon(&repo)).is_none());
    // …while two raw runs on the project still do.
    registry.remove(&2);
    registry.insert(1, run_in(&repo));
    assert!(collision::find_collision(&registry, 3, &canon(&repo)).is_some());
    git(
        &repo,
        &["worktree", "remove", "--force", collision::plain(&cwd).to_str().unwrap()],
    );
    std::fs::remove_dir_all(&repo).ok();
}

// ---- Issue #40: merge-back, clean path ---------------------------------------

#[tokio::test]
async fn worktree_run_end_commits_the_branch_referencing_the_conversation() {
    let repo = scratch("commit-src");
    seed_repo(&repo);
    let worktree = collision::worktree_dir_for(&canon(&repo), 5).unwrap();
    let branch = collision::branch_for(5);
    clear_stale_worktree(&canon(&repo), 5);
    collision::create_worktree(&canon(&repo), &worktree, &branch)
        .await
        .expect("worktree should be created");
    std::fs::write(worktree.join("feature.txt"), "agent work\n").expect("agent file");
    let summary = collision::commit_worktree(
        &worktree,
        "Klepai agent — conversation “Bugfix” (#5)",
    )
    .await
    .unwrap()
    .expect("changes must be committed");
    // The branch tip carries the commit and references the conversation.
    let subject = git(&worktree, &["log", "-1", "--format=%s"]);
    assert!(subject.contains("conversation"), "subject: {subject}");
    assert!(subject.contains("#5"), "subject: {subject}");
    assert!(summary.contains("feature.txt"), "summary: {summary}");
    // The main history is never touched: clean tree, no new file there.
    assert_eq!(git(&repo, &["status", "--porcelain"]), "");
    assert!(!repo.join("feature.txt").exists());
    git(
        &repo,
        &["worktree", "remove", "--force", collision::plain(&worktree).to_str().unwrap()],
    );
    git(&repo, &["branch", "-D", &branch]);
    std::fs::remove_dir_all(&repo).ok();
}

#[tokio::test]
async fn merge_into_project_lands_the_changes_and_removes_branch_and_worktree() {
    let repo = scratch("merge-src");
    seed_repo(&repo);
    let worktree = collision::worktree_dir_for(&canon(&repo), 6).unwrap();
    let branch = collision::branch_for(6);
    clear_stale_worktree(&canon(&repo), 6);
    collision::create_worktree(&canon(&repo), &worktree, &branch)
        .await
        .expect("worktree should be created");
    std::fs::write(worktree.join("feature.txt"), "landed\n").expect("agent file");
    collision::commit_worktree(&worktree, "agent work (#6)")
        .await
        .unwrap()
        .expect("commit");
    match collision::merge_branch(&canon(&repo), &branch).await.unwrap() {
        MergeOutcome::Merged { summary } => {
            assert!(summary.contains("feature.txt"), "summary: {summary}");
        }
        MergeOutcome::Conflicted { .. } => panic!("a clean merge was expected"),
    }
    // The change landed in the main folder…
    assert_eq!(
        std::fs::read_to_string(repo.join("feature.txt"))
            .unwrap()
            .trim_end(),
        "landed"
    );
    // …and cleanup ran: worktree gone, branch gone (worktree first — git
    // refuses to delete a branch still checked out in one).
    collision::remove_worktree(&canon(&repo), &worktree).await.unwrap();
    collision::delete_branch(&canon(&repo), &branch).await.unwrap();
    assert!(!worktree.exists());
    assert_eq!(git(&repo, &["branch", "--list", &branch]), "");
    std::fs::remove_dir_all(&repo).ok();
}

#[tokio::test]
async fn keep_branch_removes_the_worktree_but_keeps_the_branch_and_main() {
    let repo = scratch("keep-src");
    seed_repo(&repo);
    let worktree = collision::worktree_dir_for(&canon(&repo), 9).unwrap();
    let branch = collision::branch_for(9);
    clear_stale_worktree(&canon(&repo), 9);
    collision::create_worktree(&canon(&repo), &worktree, &branch)
        .await
        .expect("worktree should be created");
    std::fs::write(worktree.join("feature.txt"), "kept on branch\n").expect("agent file");
    collision::commit_worktree(&worktree, "agent work (#9)")
        .await
        .unwrap()
        .expect("commit");
    collision::remove_worktree(&canon(&repo), &worktree).await.unwrap();
    // The worktree folder is gone, the branch survives for a manual merge,
    // and the main checkout is untouched. (`git branch --list` prefixes the
    // line with a marker column — compare by name.)
    assert!(!worktree.exists());
    assert!(
        git(&repo, &["branch", "--list", &branch]).ends_with(&branch),
        "listing: {}",
        git(&repo, &["branch", "--list", &branch])
    );
    assert!(!repo.join("feature.txt").exists());
    assert_eq!(git(&repo, &["status", "--porcelain"]), "");
    git(&repo, &["branch", "-D", &branch]);
    std::fs::remove_dir_all(&repo).ok();
}

// ---- Issue #41: conflicts and rough edges -------------------------------------

#[tokio::test]
async fn merge_conflict_aborts_and_keeps_both_branch_and_worktree() {
    let repo = scratch("conflict-src");
    seed_repo(&repo);
    let canonical = canon(&repo);
    let worktree = collision::worktree_dir_for(&canonical, 7).unwrap();
    let branch = collision::branch_for(7);
    clear_stale_worktree(&canonical, 7);
    collision::create_worktree(&canonical, &worktree, &branch)
        .await
        .expect("worktree should be created");
    // The agent edits line 1 in the copy and commits…
    std::fs::write(worktree.join("README.md"), "agent version\n").expect("agent edit");
    collision::commit_worktree(&worktree, "agent edit (#7)")
        .await
        .unwrap()
        .expect("commit");
    // …while the user edits the same line in the main checkout.
    std::fs::write(repo.join("README.md"), "user version\n").expect("user edit");
    git(&repo, &["commit", "-am", "user edit"]);
    // The merge hits the conflict and aborts — no partial state.
    let output = match collision::merge_branch(&canonical, &branch).await.unwrap() {
        MergeOutcome::Conflicted { output } => output,
        MergeOutcome::Merged { .. } => panic!("a conflict was seeded"),
    };
    assert!(output.contains("CONFLICT"), "output: {output}");
    // The main checkout is exactly as it was: clean tree, no MERGE_HEAD,
    // the user's version still in place.
    assert_eq!(git(&repo, &["status", "--porcelain"]), "");
    assert!(!git_ok(&repo, &["rev-parse", "-q", "--verify", "MERGE_HEAD"]));
    assert_eq!(
        std::fs::read_to_string(repo.join("README.md"))
            .unwrap()
            .trim_end(),
        "user version"
    );
    // Both the branch and the worktree stay for the manual merge. (`+` is
    // git's marker for "checked out in another worktree".)
    assert!(worktree.exists());
    assert!(
        git(&repo, &["branch", "--list", &branch]).ends_with(&branch),
        "listing: {}",
        git(&repo, &["branch", "--list", &branch])
    );
    // The listed manual merge (the command the UI shows) hits the same
    // conflict; the user resolves by hand and the merge completes.
    let manual = git_raw(&repo, &["merge", &branch, "--no-edit"]);
    assert!(!manual.status.success(), "the conflict is still there");
    std::fs::write(repo.join("README.md"), "merged by hand\n").expect("resolution");
    git(&repo, &["add", "README.md"]);
    git(&repo, &["commit", "--no-edit"]);
    assert_eq!(
        std::fs::read_to_string(repo.join("README.md"))
            .unwrap()
            .trim_end(),
        "merged by hand"
    );
    git(
        &repo,
        &["worktree", "remove", "--force", collision::plain(&worktree).to_str().unwrap()],
    );
    git(&repo, &["branch", "-D", &branch]);
    std::fs::remove_dir_all(&repo).ok();
}

#[tokio::test]
async fn zero_change_run_makes_no_commit_and_only_the_informational_state() {
    let repo = scratch("clean-src");
    seed_repo(&repo);
    let worktree = collision::worktree_dir_for(&canon(&repo), 8).unwrap();
    let branch = collision::branch_for(8);
    clear_stale_worktree(&canon(&repo), 8);
    collision::create_worktree(&canon(&repo), &worktree, &branch)
        .await
        .expect("worktree should be created");
    // The agent produced nothing: no commit is made…
    let summary =
        collision::commit_worktree(&worktree, "nothing happened (#8)").await.unwrap();
    assert!(summary.is_none(), "zero changes must not commit");
    // …and the branch still points at the main tip (nothing landed).
    assert_eq!(git(&worktree, &["log", "-1", "--format=%s"]), "seed");
    // The command layer maps None → the informational "nothing to merge"
    // state instead of the prompt (frontend component test covers the UI).
    collision::remove_worktree(&canon(&repo), &worktree).await.unwrap();
    collision::delete_branch(&canon(&repo), &branch).await.unwrap();
    std::fs::remove_dir_all(&repo).ok();
}
