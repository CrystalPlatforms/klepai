# PRD — Klepai Post-Alpha (master roadmap, v0.1.x → 1.0.0)

**Status:** active master document for everything after Alpha v0.0.1 (decided 2026-10-26 in a discovery session with the owner).
**Source of truth:** on any conflict with per-version PRDs, this master wins — the umux rule. `PRD.md` remains the Alpha PRD; it is historical scope, not current roadmap.
**Per-version PRDs:** each release gets its own `/ask` discovery and its own `plans/v<version>.md` written when work on that version starts. This master carries the themes, boundaries, and master stories only.
**Already shipped post-Alpha (do not re-plan):** **Klepai Skills** (issues #16–#20; see `plans/skills.md` — historical plan, shipped design uses a light skill index + on-demand `read_skill` tool), **Composer attachments** (issue #26 — one paperclip picker for every file type), **Thinking-loader phases** (issue #23), **Check for updates** in About (signature-verified GitHub Releases updater), **CounterAPI anonymous launch counter** (issue #31 — the app's only telemetry, it stays).

---

## Problem Statement

Alpha proved the product: Klepai chats with self-hosted models, renders richly, and runs coding agents — but daily use keeps rubbing against rough edges. A weak answer can only be overwritten, not kept beside its retry. An agent working in the background is invisible: nothing says it finished or that it is stuck waiting for permission, so the user polls the window. Every action asks for a click the user does not always want to give. The app is locked to one color scheme. And a new user landing on `klepai.pages.dev` can read about Klepai but cannot download it or see what changed between versions.

## Solution

A beta line **v0.1.0 → v0.1.9** that removes exactly those frictions, one version per theme: keep regenerations as **variant navigation**, surface agent status through **notifications + loader states**, allow going **Unrestricted** (no permission dialogs), add a **Brainstorm** mode, connect **custom MCP servers** whose tools work in every mode, apply any **tweakcn theme from a link**, and rebuild the landing into a real **download + changelog** page. The line ends at **1.0.0** — defined as stability: Klepai as the daily driver without frustration, hand-validated on Windows and Linux. Features may still ship after 1.0.

## Release Roadmap

| Version | Theme |
|---|---|
| **v0.0.2** *(Alpha patch)* | Agent collision guard — collision warning + optional git-worktree isolation (`plans/v0.0.2.md`, stories 53–55) |
| **v0.1.0** | Variant navigation (`<` `>` on the last answer) + update-available banner (`plans/v0.1.0.md`) |
| **v0.1.1** | Agent status notifications (idle / needs input; nothing while Running) + orange needs-input loader state |
| **v0.1.2** | Unrestricted — no permission dialogs, auto-accept everything (built-in agent + CLI agents) |
| **v0.1.3** | Brainstorm mode (detailed in its own `/ask` + `plans/v0.1.3.md`) |
| **v0.1.4** | MCP client — Settings "MCPs" view, custom servers only, tool-calling in every mode |
| **v0.1.5** | Theme from a tweakcn link + reset to CRS-Theme |
| **v0.1.6** | Landing: Download section + changelog (modeled on `umux.pages.dev`) |
| **v0.1.7 – v0.1.9** | Stabilization, hand-validation on Windows/Linux, polish → **1.0.0** |

Versioning rules: betas stay inside `0.1.x`; after v0.1.9 the next release is 1.0.0. The **v0.0.2 Alpha patch** ships before the beta line — it is an Alpha-series guard release tracked in its own PRD (`plans/v0.0.2.md`); its stories (53–55) live there, not in this master. A big theme never opens a new minor during the beta line. There are no deadlines — a version ships when it is done. Issues are created per version at that version's planning time, not from this master.

## User Stories

*(master numbering continues the Alpha PRD at 40; per-version PRDs reference these numbers)*

- **40.** *(v0.1.0)* As the user, when I regenerate the last assistant response, I want the previous answer kept as a variant with `<` `>` navigation and a position readout (e.g. "2/3"), so that I can compare retries instead of losing them. Variants apply to the **last** assistant answer only; the rest of the thread is untouched.
- **41.** *(v0.1.0)* As the user, when the updater detects a new version, I want a banner in the app window ("new version available") — like umux — instead of having to open Settings → About, so that updates announce themselves. The existing **Check for updates** button stays.
- **42.** *(v0.1.1)* As the user, I want a notification when an agent **finishes its work (idle)** or **needs something from me (needs input)** — and **nothing while it is Running** — so that I only get pulled in when my attention is actually required.
- **43.** *(v0.1.1)* As the user, I want clicking a status notification to focus Klepai **and switch to that exact conversation**, so that one click puts me where the action is.
- **44.** *(v0.1.1)* As the user, I want the agent loader to show a needs-input state — **all squares pulsing orange** — so that "waiting for you" is visible in the thread itself, consistent with the `/loaders` gallery patterns.
- **45.** *(v0.1.2)* As the user, I want an **Unrestricted** toggle on a conversation under which the built-in agent and spawned CLI agents perform all actions **without any allow dialog** — edits, commands, everything auto-accepted — so that trusted tasks run hands-free.
- **46.** *(v0.1.2)* As the user, I want a one-time warning when enabling Unrestricted (it lets the agent do anything without asking), with a **"don't show again"** option, so that the power is conscious but not nagging.
- **47.** *(v0.1.3)* As the user, I want a **Brainstorm** mode where the model first proposes multiple directions/variants and I pick the one to develop, so that thinking starts wide before it narrows. *(Detailed design is deferred to v0.1.3's own discovery.)*
- **48.** *(v0.1.4)* As the user, I want a **MCPs** view in Settings where I can add, edit and delete **custom MCP servers** (name + command or URL) — with **no library of presets** — so that I connect exactly the tools I choose.
- **49.** *(v0.1.4)* As the user, I want MCP server tools exposed to the AI **via tool-calling in every mode** — Natural chat and agent conversations alike — so that connected tools work wherever I am talking.
- **50.** *(v0.1.5)* As the user, I want to paste a **tweakcn theme link** and have Klepai apply **everything that maps** onto its CSS variables (unknown tokens are skipped), with the theme persisted across restarts and a **reset button** back to CRS-Theme, so that re-skinning the app takes one paste.
- **51.** *(v0.1.6)* As the user, I want a **Download** section on `klepai.pages.dev` — per-OS buttons plus an "All releases" link to GitHub Releases — so that I can install Klepai from the landing page.
- **52.** *(v0.1.6)* As the user, I want a **changelog** section listing each version with a short feature summary (umux.pages.dev style), so that I can see what changed between releases.

## Implementation Decisions

- **Variants (40)** — regeneration keeps the old answer as a variant of the last assistant message; `<`/`>` cycles variants; only the last assistant answer carries variants (no mid-thread variant trees — that would be a conversation-tree engine, rejected as overkill). Storage: variants on the message row, one marked visible.
- **Update banner (41)** — driven by the existing updater state machine (`app/src/lib/updater.ts`); the banner is an in-window element, not an OS toast. GitHub Releases remains the distribution channel; bundles stay signature-verified.
- **Agent status + notifications (42–44)** — statuses: `running` (silent), `needs input`, `idle`. Detection mechanics (allow-dialog pending, CLI asking a question, process exit) are a v0.1.1 decision. The dot-matrix loader gains a needs-input pattern (all squares pulsing orange) alongside the existing phase loaders from issue #23. **Windows delivery follows umux's proven pattern (umux #118):** an app-owned clickable banner — borderless, always-on-top, bottom-right of the work area, auto-dismiss ~5 s, never steals focus, native toast only as fallback (native Windows toast activation is dead on some Windows 11 builds). macOS uses the native notification center; clicking navigates to the conversation on all platforms (43).
- **Unrestricted (45–46)** — a per-conversation toggle (reconfirm at v0.1.2 discovery), covering **both** the built-in server-model agent and spawned CLI agents (CLIs launched in their own auto-approve mode). Warning dialog on enable with "don't show again" (persisted). Unrestricted only removes Klepai-side and CLI-side confirmation prompts; it adds no new capabilities.
- **MCP (48–49)** — custom servers only, defined by the user in Settings → MCPs; no curated preset library. Tools from enabled servers are advertised to the model through tool-calling in **every** mode. Transport choices (stdio vs HTTP) and tool-permission UX are v0.1.4 decisions.
- **tweakcn themes (50)** — a tweakcn share link is fetched and parsed; every token that maps onto Klepai's CSS variables is applied live, unknown tokens are ignored; the mapping is best-effort by design ("apply everything it can"). Applied theme persists; one click resets to CRS-Theme (the shipped default).
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

- Unrestricted is a per-conversation toggle (implied by the warning-on-enable design; reconfirm at v0.1.2).
- Needs-input detection is achievable for both brains (built-in agent dialogs; CLI question patterns) — riskiest unknown in v0.1.1, resolved in its own discovery.
- tweakcn share links stay parseable (CSS-variable export), as CRS-Theme already proves.
- umux's shipped patterns (update banner, Windows notification banner, landing layout) are accepted as reference implementations, not things to reinvent.
- CounterAPI remains the only counter; no crash reporting in the beta line (Sentry is noted in `CLAUDE.md` as a future candidate).
- No deadlines; each version's scope is finalized in its own `/ask` before implementation.

## Validation Strategy

High-level here — each per-version PRD carries its own test/HITL plan.

- **Variants (40):** regenerate three times → `<`/`>` cycles "1/3 → 2/3 → 3/3"; thread content otherwise unchanged; survives restart.
- **Update banner (41):** with a `latest.json` publishing a newer version, the banner appears without opening Settings; actions complete the update.
- **Notifications (42–44):** agent finishing in a background conversation fires a notification; clicking lands in that conversation; an allow-pending agent pulses orange in the loader; Running stays silent; Windows shows the app-owned banner (clickable, non-focus-stealing), macOS a native notification.
- **Unrestricted (45–46):** with Unrestricted on, an edit + a command run with zero dialogs; with it off, the allow dialogs return; the warning shows once per install when "don't show again" is set.
- **MCP (48–49):** a custom stdio server added in Settings provides a tool the model calls in a Natural conversation and again inside an agent conversation.
- **Themes (50):** pasting a tweakcn link restyles the app live; unknown tokens are skipped without errors; restart keeps the theme; Reset restores CRS-Theme exactly.
- **Landing (51–52):** per-OS download buttons resolve to real GitHub Releases assets; changelog lists every shipped version; page stays static and fast.
- **1.0.0 gate:** full regression pass over stories 1–52, plus hand-validated installs on Windows and Linux.

## Out of Scope (entire beta line)

- Everything listed under Post-1.0 Backlog and Rejected/Closed above.
- Multi-user features of any kind (accounts, login, sharing, sync) — still a single-user, private, local-first app.
- Telemetry beyond the CounterAPI launch counter; crash reporting; auto-update beyond the existing GitHub Releases flow.
- Variant navigation beyond the last answer; conversation trees.
- MCP preset/curated library; MCP marketplace integration (the post-1.0 Marketplace, if built, decides its own relationship to MCP).

## Further Notes

- **Free-tier infra in play:** GitHub Releases (distribution + update feed), Cloudflare Pages (landing), CounterAPI (launch counter) — all free. Sentry free tier parked as a future crash-reporting candidate in `CLAUDE.md`.
- **Language policy:** app UI and this PRD are in English; conversation with the developer is in Polish.
- **Provenance:** every decision in this document was made in the discovery session of **2026-10-26** with the owner (MrCrystal2). Where umux already solved a problem, Klepai follows its shipped pattern and says so explicitly.
