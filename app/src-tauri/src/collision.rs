//! Agent collision guard + worktree isolation (issues #38–#41).
//!
//! Surface:
//!
//! - [`ActiveRun`] / [`RunRegistry`] — the in-memory "who is working where"
//!   map: conversation id → its live run { effective cwd, brain, generation }.
//!   Runs die with the app, so nothing here is persisted.
//! - [`paths_collide`] / [`find_collision`] — component-boundary path math:
//!   a folder and its subfolder collide, sibling look-alikes (`proj` vs
//!   `proj2`) do not.
//! - Git helpers — every git operation shells out to the system `git`
//!   through the async process mechanism (precedent: the `/bin/sh` tool),
//!   as a direct arg vector (no shell — this must work on Windows too).
//!   No git crate dependency; the worktree/branch naming convention IS the
//!   persistence.
//!
//! Layout decisions (plans/collision-guard.md):
//! - worktree = sibling copy `../<dir>-klepai-<conversation-id>`
//! - branch   = `klepai/agent-<conversation-id>`

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;

use serde::Serialize;

use crate::store::AgentKind;

/// One agent run currently streaming in this app instance: where it works
/// (the *effective* cwd — a worktree run stores the copy's path, so it never
/// falsely collides with a raw run on the original project) and who runs it.
#[derive(Debug, Clone)]
pub struct ActiveRun {
    pub cwd: PathBuf,
    pub agent_kind: Option<AgentKind>,
    pub generation_id: u64,
}

/// Conversation id → its live run. Wrapped in a mutex in `AppState`.
pub type RunRegistry = HashMap<i64, ActiveRun>;

/// Conversation id → the sibling worktree its agent runs execute in
/// (issue #39). In-memory: an app restart loses only the override — the
/// worktree stays on disk with its commits (naming convention makes it
/// findable) and the conversation re-points at the original folder.
pub type WorktreeOverrides = HashMap<i64, PathBuf>;

/// The conversation blocking a send: who and where, named for the dialog.
#[derive(Debug, Clone, Serialize)]
pub struct CollisionBlocker {
    pub conversation_id: i64,
    pub title: String,
    pub path: String,
}

/// The frontend's pre-send ask: nobody blocking (and whether this folder is
/// a git repository, which decides if the worktree choice is offered).
#[derive(Debug, Clone, Serialize)]
pub struct CollisionCheck {
    pub blocker: Option<CollisionBlocker>,
    pub has_git: bool,
}

/// Component-boundary containment: equal paths collide, and so does a folder
/// inside the other — but `proj` vs `proj2` is a false friend and does NOT
/// collide. `strip_prefix` compares whole components, which is exactly the
/// boundary rule. Both paths must be canonicalized by the caller.
pub fn paths_collide(a: &Path, b: &Path) -> bool {
    a.strip_prefix(b).is_ok() || b.strip_prefix(a).is_ok()
}

/// The run (if any) whose folder equals or contains `cwd` — or that works
/// inside `cwd` itself. The asking conversation is excluded from its own
/// check.
pub fn find_collision(registry: &RunRegistry, self_id: i64, cwd: &Path) -> Option<(i64, PathBuf)> {
    registry
        .iter()
        .filter(|(id, _)| **id != self_id)
        .find(|(_, run)| paths_collide(&run.cwd, cwd))
        .map(|(id, run)| (*id, run.cwd.clone()))
}

/// Sibling copy path for a conversation: `../<dir>-klepai-<id>` next to the
/// project folder. The convention is the persistence — a leftover worktree
/// stays recoverable on disk after a restart.
pub fn worktree_dir_for(project: &Path, conversation_id: i64) -> Result<PathBuf, String> {
    let name = project
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .ok_or("project folder has no name")?;
    let parent = project
        .parent()
        .ok_or("cannot place a worktree next to the project root")?;
    Ok(parent.join(format!("{name}-klepai-{conversation_id}")))
}

/// Branch a conversation's worktree runs on.
pub fn branch_for(conversation_id: i64) -> String {
    format!("klepai/agent-{conversation_id}")
}

// ---- System git ----------------------------------------------------------

/// git-for-Windows rejects extended-length paths (`\\?\C:\…` — it mangles
/// them into `//?/C:/…` and fails). Rust's canonicalize produces exactly
/// that form, and the app stores canonicalized project paths — so every
/// path handed to git goes through here first. These folders are far below
/// the 260-char limit, so the plain form is always safe.
pub fn plain(path: &Path) -> PathBuf {
    let text = path.as_os_str().to_string_lossy();
    if let Some(rest) = text.strip_prefix(r"\\?\UNC\") {
        return PathBuf::from(format!(r"\\{rest}"));
    }
    if let Some(rest) = text.strip_prefix(r"\\?\") {
        return PathBuf::from(rest);
    }
    path.to_path_buf()
}

/// Runs `git <args>` (optionally in `dir`) and returns the raw output.
/// Direct arg vector, no shell — Windows has no `/bin/sh`, and git never
/// needs one.
async fn git(dir: Option<&Path>, args: &[&str]) -> Result<std::process::Output, String> {
    let mut command = tokio::process::Command::new("git");
    command
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Some(dir) = dir {
        command.current_dir(plain(dir));
    }
    command.output().await.map_err(|error| {
        format!(
            "cannot run git{}: {error}",
            dir.map(|d| format!(" in {}", d.display()))
                .unwrap_or_default()
        )
    })
}

/// Trimmed stdout (falling back to stderr — git writes progress and errors
/// there).
fn text_of(output: &std::process::Output) -> String {
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if stdout.is_empty() {
        String::from_utf8_lossy(&output.stderr).trim().to_string()
    } else {
        stdout
    }
}

/// `Ok(text)` only when git succeeded — the text is the error otherwise.
fn require(output: std::process::Output) -> Result<String, String> {
    if output.status.success() {
        Ok(text_of(&output))
    } else {
        Err(format!(
            "git exited with {}: {}",
            output
                .status
                .code()
                .map(|code| code.to_string())
                .unwrap_or_else(|| "a signal".into()),
            text_of(&output)
        ))
    }
}

/// "Is this folder inside a git work tree?" — decides whether the worktree
/// choice is offered at all.
pub async fn is_git_work_tree(dir: &Path) -> bool {
    matches!(
        git(Some(dir), &["rev-parse", "--is-inside-work-tree"]).await,
        Ok(output)
            if output.status.success()
                && String::from_utf8_lossy(&output.stdout).trim() == "true"
    )
}

/// Creates the sibling worktree on its branch. Idempotent: an existing,
/// real git worktree is reused (the naming convention survives restarts);
/// a branch left behind by a previous cycle is checked out instead of
/// re-created. The main repo needs at least one commit for a worktree.
pub async fn create_worktree(main: &Path, worktree: &Path, branch: &str) -> Result<(), String> {
    if worktree.exists() {
        return if is_git_work_tree(worktree).await {
            Ok(())
        } else {
            Err(format!(
                "a folder named {} already exists there and is not a worktree — remove or rename it first",
                worktree.display()
            ))
        };
    }
    let branch_exists = git(
        Some(main),
        &["rev-parse", "-q", "--verify", &format!("refs/heads/{branch}")],
    )
    .await?
    .status
    .success();
    let path = plain(worktree).display().to_string();
    let output = if branch_exists {
        git(Some(main), &["worktree", "add", path.as_str(), branch]).await?
    } else {
        git(Some(main), &["worktree", "add", "-b", branch, path.as_str()]).await?
    };
    require(output).map(|_| ())
}

/// Stages everything in the worktree (adds, edits, deletions).
pub async fn stage_all(worktree: &Path) -> Result<(), String> {
    require(git(Some(worktree), &["add", "-A"]).await?).map(|_| ())
}

/// Whether anything is staged — the "zero changes" answer, taken AFTER
/// staging so ignored files never count.
pub async fn has_changes(worktree: &Path) -> Result<bool, String> {
    let output = git(Some(worktree), &["status", "--porcelain"]).await?;
    require(output).map(|text| !text.is_empty())
}

/// Commits the staged work; the summary (subject + per-file diffstat) is
/// what the UI reports as "what landed".
async fn commit(worktree: &Path, message: &str) -> Result<String, String> {
    require(
        git(
            Some(worktree),
            &[
                "-c",
                "user.name=Klepai",
                "-c",
                "user.email=klepai@localhost",
                "commit",
                "-m",
                message,
            ],
        )
        .await?,
    )?;
    require(git(Some(worktree), &["show", "--stat", "--format=%s", "HEAD"]).await?)
}

/// Stage + commit everything in the worktree. `None` = zero changes, no
/// commit (issue #41's informational path); `Some` = the landed summary.
pub async fn commit_worktree(worktree: &Path, message: &str) -> Result<Option<String>, String> {
    stage_all(worktree).await?;
    if !has_changes(worktree).await? {
        return Ok(None);
    }
    Ok(Some(commit(worktree, message).await?))
}

/// The two endings of a merge into the main checkout.
#[derive(Debug)]
pub enum MergeOutcome {
    /// Fast-forward or merge commit made; `summary` is git's own output.
    Merged { summary: String },
    /// Conflicts (or an un-mergeable state). The main checkout is left
    /// exactly as it was — a started merge is aborted — and both the branch
    /// and the worktree stay for a manual merge.
    Conflicted { output: String },
}

/// Merges the worktree branch into the main checkout. On conflict the merge
/// is aborted immediately (`git merge --abort`), leaving no partial state
/// behind (issue #41).
pub async fn merge_branch(main: &Path, branch: &str) -> Result<MergeOutcome, String> {
    let output = git(Some(main), &["merge", branch, "--no-edit"]).await?;
    if output.status.success() {
        return Ok(MergeOutcome::Merged {
            summary: text_of(&output),
        });
    }
    // A conflict starts a merge in progress (MERGE_HEAD) — abort it so the
    // main checkout stays clean. Any other failure never started one.
    let started = git(Some(main), &["rev-parse", "-q", "--verify", "MERGE_HEAD"])
        .await?
        .status
        .success();
    if started {
        let _ = git(Some(main), &["merge", "--abort"]).await?;
    }
    Ok(MergeOutcome::Conflicted {
        output: text_of(&output),
    })
}

/// Undoes an in-progress merge in the main checkout.
pub async fn abort_merge(main: &Path) -> Result<(), String> {
    require(git(Some(main), &["merge", "--abort"]).await?).map(|_| ())
}

/// Removes the worktree directory (git's own bookkeeping included). Plain
/// first; after the auto-commit the only leftovers are ignored files
/// (build caches and the like) — force is safe for those.
pub async fn remove_worktree(main: &Path, worktree: &Path) -> Result<(), String> {
    let path = plain(worktree).display().to_string();
    let plain = git(Some(main), &["worktree", "remove", path.as_str()]).await?;
    if plain.status.success() {
        return Ok(());
    }
    require(git(Some(main), &["worktree", "remove", "--force", path.as_str()]).await?).map(|_| ())
}

/// Deletes the worktree branch in the main repo (`-D` — a kept branch may
/// be un-merged).
pub async fn delete_branch(main: &Path, branch: &str) -> Result<(), String> {
    require(git(Some(main), &["branch", "-D", branch]).await?).map(|_| ())
}
