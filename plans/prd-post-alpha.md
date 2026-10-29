# PRD — Klepai Post-Alpha (master roadmap, v0.1.x → 1.0.0)

**Status:** active master document for everything after Alpha v0.0.1 (decided 2026-10-26 in a discovery session with the owner).
**Source of truth:** on any conflict with per-version PRDs, this master wins — the umux rule. `PRD.md` remains the Alpha PRD; it is historical scope, not current roadmap.
**Per-version PRDs:** each release gets its own `/ask` discovery and its own `plans/v<version>.md` written when work on that version starts. This master carries the themes, boundaries, and master stories only.
**Already shipped post-Alpha (do not re-plan):** **Klepai Skills** (issues #16–#20; see `plans/skills.md` — historical plan, shipped design uses a light skill index + on-demand `read_skill` tool), **Composer attachments** (issue #26 — one paperclip picker for every file type), **Thinking-loader phases** (issue #23), **Check for updates** in About (signature-verified GitHub Releases updater), **CounterAPI anonymous launch counter** (issue #31 — the app's only telemetry, it stays).

---

## Problem Statement

Alpha proved the product: Klepai chats with self-hosted models, renders richly, and runs coding agents — but daily use keeps rubbing against rough edges. A weak answer can only be overwritten, not kept beside its retry. An agent working in the background is invisible: nothing says it finished or that it is stuck waiting for permission, so the user polls the window. Every action asks for a click the user does not always want to give. The app is locked to one color scheme. And a new user landing on `klepai.pages.dev` can read about Klepai but cannot download it or see what changed between versions.

## Solution

A beta line **v0.1.0 → v0.1.9** that removes exactly those frictions, one version per theme: keep regenerations as **variant navigation**, surface agent status through **notifications + loader states**, allow going **Unrestricted** (no permission dialogs), add a **Brainstorm** mode, connect **custom MCP servers** whose tools work in every mode, apply any **tweakcn theme from a link, pasted CSS or a file** — with a **light/dark toggle** — and rebuild the landing into a real **download + changelog** page. The line ends at **1.0.0** — defined as stability: Klepai as the daily driver without frustration, hand-validated on Windows and Linux. Features may still ship after 1.0.

## Release Roadmap

| Version | Theme |
|---|---|
| **v0.0.2** *(Alpha patch)* | Agent collision guard — collision warning + optional git-worktree isolation (`plans/v0.0.2.md`, stories 53–55) |
| **v0.1.0** | Variant navigation (`<` `>` on the last answer) + update-available banner (`plans/v0.1.0.md`) |
| **v0.1.1** | Agent status notifications (idle / needs input; nothing while Running) + blue needs-input loader state |
| **v0.1.2** | Unrestricted — a third mode beside Natural/Agent; no permission dialogs, auto-accept everything (`plans/v0.1.2.md`) |
| **v0.1.3** | Brainstorm mode — a bundled planning pipeline in one conversation: Ask → Blueprint → Carve → Dispatch → TDD → Ship proposal (`plans/v0.1.3.md`) |
| **v0.1.4** | MCP client — Settings "MCPs" view, custom servers only, built-in-model tool-calling in every mode (`plans/v0.1.4.md`) |
| **v0.1.5** | Theme from a tweakcn link, pasted CSS or a `.css` file + light/dark toggle + reset to CRS-Theme (`plans/v0.1.5.md`) |
| **v0.1.6** | Landing: Download section + changelog (modeled on `umux.pages.dev`) |
| **v0.1.7 – v0.1.9** | Stabilization, hand-validation on Windows/Linux, polish → **1.0.0** |

Versioning rules: betas stay inside `0.1.x`; after v0.1.9 the next release is 1.0.0. The **v0.0.2 Alpha patch** ships before the beta line — it is an Alpha-series guard release tracked in its own PRD (`plans/v0.0.2.md`); its stories (53–55) live there, not in this master. A big theme never opens a new minor during the beta line. There are no deadlines — a version ships when it is done. Issues are created per version at that version's planning time, not from this master.

## User Stories

*(master numbering continues the Alpha PRD at 40; per-version PRDs reference these numbers)*

- **40.** *(v0.1.0)* As the user, when I regenerate the last assistant response, I want the previous answer kept as a variant with `<` `>` navigation and a position readout (e.g. "2/3"), so that I can compare retries instead of losing them. Variants apply to the **last** assistant answer only; the rest of the thread is untouched.
- **41.** *(v0.1.0)* As the user, when the updater detects a new version, I want a banner in the app window ("new version available") — like umux — instead of having to open Settings → About, so that updates announce themselves. The existing **Check for updates** button stays.
- **42.** *(v0.1.1)* As the user, I want a notification when an agent **finishes its work (idle)** or **needs something from me (needs input)** — and **nothing while it is Running** — so that I only get pulled in when my attention is actually required.
- **43.** *(v0.1.1)* As the user, I want clicking a status notification to focus Klepai **and switch to that exact conversation**, so that one click puts me where the action is.
- **44.** *(v0.1.1)* As the user, I want the agent loader to show a needs-input state — **all squares pulsing blue** — so that "waiting for you" is visible in the thread itself, consistent with the `/loaders` gallery patterns. *(Color revised from orange in the v0.1.1 discovery, 2026-10-29.)*
- **45.** *(v0.1.2)* As the user, I want an **Unrestricted** mode — a third mode beside Natural and Agent — under which the built-in agent and spawned CLI agents perform all actions **without any allow dialog** — edits, commands, everything auto-accepted — so that trusted tasks run hands-free.
- **46.** *(v0.1.2)* As the user, I want a warning when switching into Unrestricted (it lets the agent do anything without asking), shown on every entry until I check **"don't show again"**, so that the power is conscious but not nagging.
- **47.** *(v0.1.3)* As the user, I want a **Brainstorm** mode — an extension of Agent mode — in which the agent runs the bundled planning pipeline on my idea, phase by phase with my confirmation: discovery interview → PRD → implementation plan → issues → tests-first TDD → Ship proposal, so that an idea becomes dev-ready work inside one conversation. *(Details in `plans/v0.1.3.md`.)*
- **48.** *(v0.1.4)* As the user, I want a **MCPs** view in Settings where I can add, edit and delete **custom MCP servers** (name + command or URL) — with **no library of presets** — so that I connect exactly the tools I choose. *(Pinned in `plans/v0.1.4.md` — built-in model only, tools only.)*
- **49.** *(v0.1.4)* As the user, I want MCP server tools exposed to the AI **via tool-calling in every mode of the built-in model** — Natural chat and agent conversations alike — so that connected tools work wherever I am talking. CLI agents keep their own MCP configuration. *(Refined in the v0.1.4 discovery, 2026-10-29.)*
- **50.** *(v0.1.5)* As the user, I want to hand Klepai a **tweakcn theme** — a share link or raw CSS pasted into one input, or a `.css` file — and have an **Apply** button put it on: **everything that maps** onto Klepai's CSS variables is applied (unknown tokens skipped, `--spacing` protected), the theme persists across restarts, and a **reset** returns to CRS-Theme after a confirmation dialog, so that re-skinning the app takes one paste. The **KLEPAI wordmark** and the **semantic state colors** (needs-input blue, Unrestricted red, MCP error red) stay fixed — a theme cannot touch them. *(Amended in the v0.1.5 discovery, 2026-10-29: input + Apply instead of "applied live", three input forms, protective rules, confirming reset; details in `plans/v0.1.5.md`.)*
- **51.** *(v0.1.6)* As the user, I want a **Download** section on `klepai.pages.dev` — per-OS buttons plus an "All releases" link to GitHub Releases — so that I can install Klepai from the landing page.
- **52.** *(v0.1.6)* As the user, I want a **changelog** section listing each version with a short feature summary (umux.pages.dev style), so that I can see what changed between releases.
- **56.** *(v0.1.2)* As the user, I can tell at a glance that a conversation is Unrestricted — the composer mode button and the Details mode pill show it **in red** where Agent would be yellow — so that the no-questions state is never mistaken for ordinary Agent.
- **57.** *(v0.1.3)* As the user, I can see the Brainstorm phase at a glance — the composer mode button and the Details pill read **"Brainstorm: Ask / Blueprint / Carve / Dispatch / TDD / Ship"** as the pipeline advances (plain **"Brainstorm"** before it starts), **in blue** where Agent would be yellow.
- **58.** *(v0.1.3)* As the user, I get the whole planning pipeline **bundled with Klepai** — its skills ship with the app and are always available in Brainstorm mode, on every machine and brain, regardless of my skill settings.
- **59.** *(v0.1.3)* As the user, I get issues where my project lives: **GitHub issues via `gh`** when the project has git + gh, **local files under `plans/issues/`** when it does not.
- **60.** *(v0.1.3)* As the user, I get a TDD phase that implements the issues **one by one with tests written before the code** and **never commits or pushes on its own**.
- **61.** *(v0.1.3)* As the user, I get a **Ship proposal** once, after all issues are implemented; on acceptance the agent runs lint + type-check + commit + push and **closes the gh issue** — no tag, no release. *(53–55 live in `plans/v0.0.2.md`.)*
- **62.** *(v0.1.4)* As the user, I want every MCP tool call in Natural or Agent mode to ask my permission — the composer swaps to Allow/Deny exactly as built-in agent asks do — unless a Standing Allowed rule matches the tool name (`server__tool`) or the conversation is Unrestricted, so that external tools are guarded like built-in ones. *(Added in the v0.1.4 discovery, 2026-10-29.)*
- **63.** *(v0.1.4)* As the user, I want Klepai to connect to my enabled MCP servers at startup — a "Starting MCPs…" composer placeholder until it finishes, nothing blocked meanwhile — and a red dot on the Settings icon and the MCPs tab label while any enabled server has a connection error, so that breakage is visible at a glance. *(Added in the v0.1.4 discovery, 2026-10-29.)*
- **64.** *(v0.1.5)* As the user, I want a **light/dark toggle** in Settings → Theme that always works — switching CRS-Theme's own light and dark halves even with no import, and an imported theme's two halves after one — with the choice persisted across restarts (a fresh install starts dark), so that the app's look follows my preference instead of a hardcoded dark. *(Added in the v0.1.5 discovery, 2026-10-29; details in `plans/v0.1.5.md`.)*

## Implementation Decisions

- **Variants (40)** — regeneration keeps the old answer as a variant of the last assistant message; `<`/`>` cycles variants; only the last assistant answer carries variants (no mid-thread variant trees — that would be a conversation-tree engine, rejected as overkill). Storage: variants on the message row, one marked visible.
- **Update banner (41)** — driven by the existing updater state machine (`app/src/lib/updater.ts`); the banner is an in-window element, not an OS toast. GitHub Releases remains the distribution channel; bundles stay signature-verified.
- **Agent status + notifications (42–44)** — statuses: `running` (silent), `needs input`, `idle`. Detection mechanics (allow-dialog pending, CLI asking a question, process exit) are a v0.1.1 decision. The dot-matrix loader gains a needs-input pattern (all squares pulsing **blue** — revised from orange in the v0.1.1 discovery, 2026-10-29; no orange anywhere for needs input) alongside the existing phase loaders from issue #23. **Windows delivery follows umux's proven pattern (umux #118):** an app-owned clickable banner — borderless, always-on-top, bottom-right of the work area, auto-dismiss ~5 s, never steals focus, native toast only as fallback (native Windows toast activation is dead on some Windows 11 builds). macOS uses the native notification center; clicking navigates to the conversation on all platforms (43).
- **Unrestricted (45–46, 56)** — a **third conversation mode** beside natural and agent, stored on the conversation like the existing modes (restart-safe; new conversations still start natural — confirmed 2026-10-29, details in `plans/v0.1.2.md`). The composer mode button cycles the three states; the Details pill row gains an Unrestricted pill, red where Agent is yellow. The built-in agent auto-approves before the composer sees anything; CLI agents spawn in their full-bypass flags (Codex incl. sandbox bypass — zero asks, zero sandbox). A warning shows on **every** entry until "don't show again" (persisted in settings); a switch applies from the next message. Covers **both** the built-in server-model agent and spawned CLI agents; it only removes Klepai-side and CLI-side confirmation prompts and adds no new capabilities.
- **Brainstorm (47, 57–61)** — a **fourth conversation mode** extending Agent: the agent runs the bundled pipeline **Ask → Blueprint → Carve → Dispatch → TDD → Ship-proposal** with a confirmation stop after every phase; the mode button/pill label shows the current phase (**"Brainstorm: Ask"** … **"Brainstorm: Ship"**; plain "Brainstorm" before start) in **blue** (Agent stays yellow, Unrestricted red). Pipeline skills ship with Klepai (always on inside the mode, English). Artifacts: PRD at `plans/prd-<name>.md`, plan at `plans/<name>.md`; discovery stays in chat. Dispatch is conditional — **gh issues** with git+gh, **files under `plans/issues/`** without; a missing repo is offered to be created first. TDD: issue-by-issue, tests before code, no commit/push. Ship: proposed once after all issues; accepted → lint + type-check + commit + push + close the gh issue (no tag/release); without git the agent says so and skips. Mode + phase persist on the conversation; after Ship the label returns to plain "Brainstorm" and a new idea starts a fresh pipeline. Same permission gates as Agent; all brains (details in `plans/v0.1.3.md`).
- **MCP (48–49, 62–63)** — custom servers only (Settings → MCPs: add/edit/delete, enable toggle, no preset library). Transports: local stdio (command line + optional env vars) and remote streamable HTTP (URL + API-key/Bearer field or an OAuth "Sign in" button); a warning dialog shows on every add, worded by server type. Tools from enabled servers are advertised to the **built-in model** through tool-calling in **every** mode — Natural and agent alike; CLI agents keep their own MCP config. Every tool call in Natural/Agent asks through the existing agent permission flow (composer swaps to Allow/Deny); Standing Allowed rules match tool names (`server__tool`); Unrestricted auto-accepts. Klepai connects to enabled servers at startup — "Starting MCPs…" placeholder that always returns, nothing blocked meanwhile; failures show a red dot on the Settings icon and the MCPs tab label plus per-server error status. Tools only — resources and prompts are future scope. Details in `plans/v0.1.4.md` (discovery 2026-10-29).
- **Themes (50)** — a Settings → **Theme** tab (new): one input accepting a tweakcn share link or pasted CSS (auto-detected), a `.css` file picker beside it, one shared **Apply** button; nothing happens until Apply, which applies and persists the theme. Mapping stays best-effort by design ("apply everything it can") — every token matching Klepai's CSS variable names applies, unknown tokens are silently skipped, and **`--spacing` is never imported** (it rescales the whole layout). Fonts follow the theme; missing families are fetched from Google Fonts, cached locally, silent fallback on failure. Success is silent; problems (unreachable link, unparseable content, CSS mapping zero tokens) show an **inline error** and leave the current look untouched. One custom theme is active globally — the next Apply overwrites it. The **KLEPAI wordmark** (Audiowide; sidebar, start screen, About) is pinned — font and color — and the **semantic state colors** (needs-input blue v0.1.1, Unrestricted red v0.1.2, MCP error red v0.1.4) stay app constants outside the import map. **Reset** returns to CRS-Theme after a confirmation dialog. The native window background follows the applied theme. Details in `plans/v0.1.5.md` (discovery 2026-10-29).
- **Light/dark toggle (64)** — lives only in the Theme tab; always functional: CRS-Theme's dormant light half (`:root` in `index.css`) becomes reachable, and an imported theme's halves switch too. Theme and mode persist as last left (fresh install: dark + CRS-Theme); the native window background follows the mode as well.
- **Landing (51–52)** — modeled on `umux.pages.dev`: per-OS download buttons + "All releases" (GitHub Releases), and a version-list changelog with short feature blurbs. Still a static site on Cloudflare Pages.
- **Versioning** — betas confined to `0.1.x`; 1.0.0 = stability (daily-driver quality + hand-validated Windows/Linux), reached at v0.1.9 at the latest. Feature work may continue after 1.0.

## Post-1.0 Backlog (named, not planned)

- **Docs site** — product documentation, postponed ("docs later"; owner decision 2026-10-26).
- **Remote access** — Cloudflare Tunnel so home-LAN models work away from home.
- **Marketplace** — a public gallery for sharing Klepai content (skills, presets). Renamed from "agent marketplace" (2026-10-26).

## Rejected / Closed

- **Klepai-as-brain proxy** (OpenAI/Anthropic-compatible endpoint so terminal agent CLIs run on OSS models) — **dropped entirely** (2026-10-26): unnecessary and complicating; server models already work in agent mode, so the harness is complete without it.
- **Plugin system** — not now; the tweakcn theme import covers the immediate extensibility want. May be revisited only when a real third-party developer community exists.
- **Voice input** — dropped.
- **LLM-generated conversation titles** — dropped (first-message truncation stays).
- **Gemini CLI adapter** — closed; the Gemini CLI track was superseded by Antigravity.
- **RAG / document chat** — closed as a separate feature: the composer paperclip (issue #26) accepts every file type and agents read project files natively.

## Assumptions

- Unrestricted is a third conversation mode, per-conversation only (confirmed 2026-10-29 in the v0.1.2 discovery, `plans/v0.1.2.md`).
- Needs-input detection is achievable for both brains (built-in agent dialogs; CLI question patterns) — riskiest unknown in v0.1.1, resolved in its own discovery: the built-in agent and Claude Code ship with needs-input; Codex has no approval parsing today and ships idle/error only, detection deferred (`plans/v0.1.1.md`).
- tweakcn share links stay parseable (CSS-variable export), as CRS-Theme already proves; tweakcn itself is free, OSS and login-free, and Klepai's import stays fully local except optional Google Fonts fetches for imported font families.
- umux's shipped patterns (update banner, Windows notification banner, landing layout) are accepted as reference implementations, not things to reinvent.
- CounterAPI remains the only counter; no crash reporting in the beta line (Sentry is noted in `CLAUDE.md` as a future candidate).
- v0.1.4 (discovered 2026-10-29, `plans/v0.1.4.md`): MCP is built-in-model only, tools only, stdio + streamable HTTP (no SSE); startup connect with a "Starting MCPs…" placeholder; red-dot error indicators on Settings.
- v0.1.5 (discovered 2026-10-29, `plans/v0.1.5.md`): themes apply via input + Apply (not live), with `--spacing` protected and the wordmark and semantic state colors pinned; the light/dark toggle lives in the Theme tab and always works, including on CRS-Theme; a fresh install starts dark + CRS-Theme.
- No deadlines; each version's scope is finalized in its own `/ask` before implementation.
- Brainstorm's pipeline ships **bundled** (owner decision 2026-10-29, `plans/v0.1.3.md`): its phase skills are adapted from the owner's brainstormer + ship/tdd workflows, always on inside the mode; the old "multiple directions" reading of story 47 is void.

## Validation Strategy

High-level here — each per-version PRD carries its own test/HITL plan.

- **Variants (40):** regenerate three times → `<`/`>` cycles "1/3 → 2/3 → 3/3"; thread content otherwise unchanged; survives restart.
- **Update banner (41):** with a `latest.json` publishing a newer version, the banner appears without opening Settings; actions complete the update.
- **Notifications (42–44):** agent finishing in a background conversation fires a notification; clicking lands in that conversation; an allow-pending agent pulses blue in the loader; Running stays silent; Windows shows the app-owned banner (clickable, non-focus-stealing), macOS a native notification.
- **Unrestricted (45–46, 56):** with the mode on, an edit + a command run with zero dialogs; with it off, the allow dialogs return; the warning shows on every entry until "don't show again"; the composer button and Details pill render the state in red; the mode survives a restart.
- **Brainstorm (47, 57–61):** a Brainstorm conversation runs discovery → PRD → plan → issues → TDD → Ship proposal with the phase label following each phase; with git+gh it opens real GitHub issues, without git it writes `plans/issues/` files; TDD never commits; Ship commits, pushes and closes the issue; a restart mid-pipeline resumes the same phase.
- **MCP (48–49, 62–63):** a custom stdio server and a free hosted HTTP server (e.g. Neon MCP) added in Settings → MCPs; a restart shows the "Starting MCPs…" placeholder, which then returns; the model calls a tool in a Natural conversation (Allow/Deny ask → activity item) and again inside an agent conversation; a Standing Allowed rule on the tool name silences the ask; Unrestricted runs it with zero asks; a broken server shows red dots on Settings and the MCPs tab label and never blocks startup.
- **Themes (50):** applying a tweakcn link (input + Apply) restyles the app; unknown tokens are skipped without errors; CSS mapping nothing errors inline; restart keeps the theme and mode; Reset (after its confirmation) restores CRS-Theme exactly; the wordmark and the state colors never change.
- **Light/dark toggle (64):** toggling switches CRS-Theme's and an imported theme's light/dark halves; the choice survives a restart; the native window background follows.
- **Landing (51–52):** per-OS download buttons resolve to real GitHub Releases assets; changelog lists every shipped version; page stays static and fast.
- **1.0.0 gate:** full regression pass over stories 1–52, plus hand-validated installs on Windows and Linux.

## Out of Scope (entire beta line)

- Everything listed under Post-1.0 Backlog and Rejected/Closed above.
- Multi-user features of any kind (accounts, login, sharing, sync) — still a single-user, private, local-first app.
- Telemetry beyond the CounterAPI launch counter; crash reporting; auto-update beyond the existing GitHub Releases flow.
- Variant navigation beyond the last answer; conversation trees.
- MCP preset/curated library; MCP marketplace integration (the post-1.0 Marketplace, if built, decides its own relationship to MCP). MCP for CLI agents (pass-through); MCP resources and prompts; SSE transport.

## Further Notes

- **Free-tier infra in play:** GitHub Releases (distribution + update feed), Cloudflare Pages (landing), CounterAPI (launch counter) — all free. Sentry free tier parked as a future crash-reporting candidate in `CLAUDE.md`.
- **Language policy:** app UI and this PRD are in English; conversation with the developer is in Polish.
- **Provenance:** every decision in this document was made in the discovery session of **2026-10-26** with the owner (MrCrystal2). Where umux already solved a problem, Klepai follows its shipped pattern and says so explicitly.
