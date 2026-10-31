# CLAUDE.md — Klepai (notes for AI agents)

## Current state (keep this in mind — do not claim otherwise)

- Klepai Alpha v0.0.1 is **released and public**. Klepai is a public OSS app (same model as umux); releases go to GitHub Releases.
- **Klepai Skills are ALREADY IMPLEMENTED** (shipped post-Alpha; Rust tests in `app/src-tauri/tests/skills_injection.rs`). `plans/skills.md` is a historical plan, NOT a backlog — the shipped design drifted from it: instead of injecting full skill content into the system prompt with a 32 KiB cap, the model receives a light index of enabled skills and pulls full text on demand via the `read_skill` tool (no size budget). Never say skills are "planned" or "not implemented".
- Updater already exists: **Check for updates** in About (signature-verified GitHub Releases flow, `app/src/lib/updater.ts`). Until a signed release ships a `latest.json` asset, it reports "up to date" — expected pre-release state, not a bug.
- The only "telemetry" is the **CounterAPI** anonymous launch counter (issue #31, `app/src/lib/analytics.ts`) — it stays as is.
- Landing download buttons (`index.html`) point at **stable asset names** via `releases/latest/download/…`: `klepai-macos.dmg`, `klepai-windows.zip`, `klepai-linux.zip`. Every release must attach the macOS DMG also under the stable name `klepai-macos.dmg` (the Tauri-built name carries the version, e.g. `Klepai_0.0.1_aarch64.dmg`) — otherwise the landing macOS button breaks.

## Deferred decisions

- **Sentry (free tier)** — candidate for crash reporting in future public versions (consider opt-in). Noted here 2026-10-26 at the owner's request; not decided yet.
- Product docs site — postponed (owner: "docs later"); landing `klepai.pages.dev` will be expanded instead.
