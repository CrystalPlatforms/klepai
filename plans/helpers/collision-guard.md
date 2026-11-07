# Plan: Agent collision guard (Alpha v0.0.2)

> Source PRD: `plans/v0.0.2.md` (stories 53–55). Discovery: 2026-10-27. Ships before the v0.1.0 beta line.

## Architectural decisions

Durable decisions that apply across all phases:

- **Detection chokepoint** — every agent run (built-in server-model tool loop and spawned CLI agents alike) starts through the same backend send command, in its cwd-resolution step. The collision check and the worktree decision hook in there, before any process spawns or any tool executes.
- **Running-agent registry** — new in-memory map in the Tauri app state: `conversation id → active run { canonicalized working dir, agent kind, generation id }`. Inserted when a run starts, removed when it ends (finish, abort, error). In-memory only: runs die with the app, so there is nothing to persist. The existing per-generation abort map stays untouched; this registry is keyed by conversation and answers "who is working where".
- **Detection scope** — agent-mode (full-access) runs only. Natural-mode conversations run read-only in the home directory and never participate in collisions.
- **Path comparison** — expand `~`, canonicalize both paths, then collision = equal or one path is inside the other (component-boundary prefix check, so `~/proj2` does **not** collide with `~/proj`, but `~/proj/sub` does).
- **Check-then-send flow** — the frontend asks a new `check_agent_collision` command before sending an agent message; on collision it shows the decision dialog and re-sends with an explicit `collision_choice` (`proceed` | `worktree`). The backend re-checks on send and refuses an unprotected send. The tiny TOCTOU window between check and send is accepted (self-inflicted, milliseconds).
- **Worktree layout** — sibling copy `../<dir>-klepai-<conversation-id>` on branch `klepai/agent-<conversation-id>`. The naming convention *is* the persistence: nothing about worktrees is written to the DB, and a leftover worktree after an app restart stays recoverable on disk with its commits.
- **Worktree cwd override** — once a conversation chooses a worktree, its subsequent agent runs execute in the worktree path (in-memory per-conversation override). The conversation's stored `project_path` column keeps pointing at the original folder; the UI keeps showing the original name.
- **Git via system binary** — all git operations (`rev-parse` detection, `worktree add`, `add`/`commit`, `merge`, `worktree remove`, `branch -D`) shell out to the system `git` through the existing async process mechanism (precedent: the `/bin/sh` tool). No git crate dependency.
- **No schema changes** — `conversations.project_path` already exists and remains the single source of the conversation's folder.
- **Auto-commit policy (owner requirement)** — at a worktree run's end, Klepai itself commits all changes on the worktree branch. Commits are authored in the copy; the main history and branches are never touched. This must be stated in user-facing docs.

---

## Phase 1: Collision detection + warning dialog

**User stories**: 53; first half of 54 (dialog exists, worktree button not yet).

### What to build

An end-to-end guard: while a conversation runs an agent in folder F (or a subfolder of F), sending an agent message from a second conversation pointed at F shows a warning dialog naming the running conversation. The dialog offers **Run anyway** and **Cancel**. "Run anyway" passes an explicit choice through the send command; Cancel aborts the send before anything spawns. Runs register themselves on start and unregister on finish/abort/error. Natural-mode sends never trigger the check. Subfolder paths collide; similarly-named sibling folders do not.

### Assumptions carried in

- `conversations.project_path` exists (it does; added by an earlier migration).
- The existing per-generation abort map and stream plumbing stay as they are.
- The frontend has a single chokepoint where agent messages are sent.

### Out of scope for this phase

- No worktree button, no git operations of any kind.
- No in-run indicator while two agents share a folder (PRD decision).
- No detection of agents launched outside Klepai.

### Acceptance criteria

- [ ] Second conversation on the same folder triggers the dialog naming the running one — [observable: dialog appears in the app; test: Rust — registry reports collision for equal canonical paths]
- [ ] Subfolder collides; `proj` vs `proj2` does not — [test: Rust integration, prefix-boundary cases]
- [ ] `~/x` form collides with its expanded absolute form — [test: Rust, seeded fake home]
- [ ] "Run anyway" starts the run; finishing or aborting either run removes its registry entry — [test: Rust registry lifecycle]
- [ ] A send under collision without an explicit choice is refused with a structured error naming the blocker — [test: Rust command-level]
- [ ] Natural-mode send never runs the check — [test: Rust]
- [ ] Dialog in this phase offers only Run anyway / Cancel — [test: vitest component]

---

## Phase 2: Worktree isolation

**User stories**: 54 (remaining half).

### What to build

The collision check now also answers "is this folder a git work tree?" (`git rev-parse`). When yes, the dialog gains **Run in worktree**: choosing it creates the sibling worktree `../<dir>-klepai-<id>` on branch `klepai/agent-<id>` and points this conversation's agent runs at the worktree path via the in-memory override. Edits and commands of that run land in the copy; the original folder stays untouched while it works. When the folder is not a git repository, the worktree button is hidden and the dialog stays at two choices. Collision comparison uses **effective** cwds, so a worktree run and a raw run on the same project do not falsely collide (the worktree run is isolated by construction), while two "Run anyway" runs still do.

### Assumptions carried in

- Phase 1's registry, dialog, and choice plumbing work.
- A usable `git` binary exists on PATH when the folder is a git repo.

### Out of scope for this phase

- No commit, no merge: the worktree fills with uncommitted changes until Phase 3.
- No cleanup of worktrees (they accumulate until Phase 3 removes them on merge).

### Acceptance criteria

- [ ] Check returns `has_git: true` for a seeded temp git repo, `false` for a plain directory — [test: Rust, temp fixtures]
- [ ] Choosing worktree creates the sibling dir + branch, and the run's effective cwd is the worktree — [test: Rust command-level on a temp repo; observable: edits land in the copy, main folder untouched]
- [ ] Worktree button hidden when `has_git` is false — [test: vitest]
- [ ] Registry stores the effective (worktree) cwd; worktree-run vs raw-run on the same project does not collide, two raw runs still do — [test: Rust]

---

## Phase 3: Merge-back, clean path

**User stories**: 55 (clean path).

### What to build

When an agent finishes a worktree run, Klepai auto-commits all changes on the worktree branch (authored message, e.g. mentioning the conversation). If the commit is non-empty, the UI prompts **[Merge into project] / [Keep branch]**. *Merge into project* runs `git merge <branch>` in the main checkout; on success the branch is deleted and the worktree removed, and the UI reports what landed. *Keep branch* removes the worktree directory but keeps the branch for a manual merge — nothing touches the main checkout. Raw (non-worktree) runs never see this prompt.

### Assumptions carried in

- Phase 2 produces worktree runs with a working finish signal.
- Auto-commit on the branch is an approved owner requirement (documented in the PRD).

### Out of scope for this phase

- Conflict handling (Phase 4).
- Any shutdown-time sweep of unfinished worktrees.

### Acceptance criteria

- [ ] A worktree run's changes are committed on the branch at run end — [test: Rust on a temp repo: branch tip contains the commit]
- [ ] "Merge into project" brings the changes into the main checkout, then branch and worktree are gone — [test: Rust; observable: files changed in the main folder, sibling dir removed]
- [ ] "Keep branch" removes the worktree dir, keeps the branch, leaves the main checkout untouched — [test: Rust]
- [ ] The merge prompt appears only for worktree runs — [test: vitest]

---

## Phase 4: Conflicts and rough edges

**User stories**: 55 (conflict path + edge cases).

### What to build

When the merge hits conflicts, Klepai aborts the merge (`git merge --abort`), leaving the main checkout exactly as it was — no partial state — and keeps both the branch and the worktree. The UI explains what happened and lists the exact commands to merge by hand (`git -C <main-folder> merge klepai/agent-<id>`), matching the PRD's "manual merge, here are the commands". A worktree run that produced **zero changes** creates no commit and shows only an informational "nothing to merge" instead of the prompt. An app restart with a leftover worktree loses only the in-memory override: the conversation re-points at the original folder, the worktree stays on disk with its commits (naming convention makes it findable), and nothing crashes.

### Assumptions carried in

- Phase 3's clean-path merge and cleanup work.
- The restart behaviour is documented as a known limitation, not fixed with tooling in this release.

### Out of scope for this phase

- No built-in conflict-resolution UI (user resolves in their editor/terminal).
- No orphan-worktree sweeper, no settings entry.

### Acceptance criteria

- [ ] With a seeded conflicting commit in the main checkout, the merge aborts: `git status` shows a clean tree (no MERGE_HEAD), branch and worktree intact, and the message lists the manual commands — [test: Rust, seeded conflict; command: the listed manual merge then succeeds]
- [ ] A run with zero changes produces no commit and no prompt, only the informational state — [test: Rust + vitest]
- [ ] After an app restart with a live worktree, sending in that conversation works (goes to the original folder) and no error surfaces — [observable: manual restart test]

---

## Known limitations (accepted, documented)

- Agents launched outside Klepai are invisible — by design (PRD assumption).
- TOCTOU window between the dialog check and the send is accepted.
- App restart orphans a live worktree on disk (recoverable via branch naming; manual).
- The dialog never hard-blocks: "Run anyway" is always available.
