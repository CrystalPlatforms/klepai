# CLAUDE.md — Klepai (notes for AI agents)

## Current state (keep this in mind — do not claim otherwise)

- Klepai Alpha v0.0.1 **i v0.0.2 oraz v0.1.0 (pierwsza beta, 2026-11-15) są wydane i publiczne**. Klepai is a public OSS app (same model as umux); releases go to GitHub Releases.
- **Klepai Skills are ALREADY IMPLEMENTED** (shipped post-Alpha; Rust tests in `app/src-tauri/tests/skills_injection.rs`). `plans/skills.md` is a historical plan, NOT a backlog — the shipped design drifted from it: instead of injecting full skill content into the system prompt with a 32 KiB cap, the model receives a light index of enabled skills and pulls full text on demand via the `read_skill` tool (no size budget). Never say skills are "planned" or "not implemented".
- Updater already exists: **Check for updates** in About (signature-verified GitHub Releases flow, `app/src/lib/updater.ts`). The feed (`latest.json`, darwin-aarch64) is live since v0.1.1 (2026-11-25) — installed 0.1.0+ apps detect newer releases.
- The only "telemetry" is the **CounterAPI** anonymous launch counter (issue #31, `app/src/lib/analytics.ts`) — it stays as is.
- Release assets (umux model, 2026-11-25): `.github/workflows/release.yml` fires on every release publish and attaches installers for all three platforms, each under a permanent version-less alias the landing links through `releases/latest/download/…`: `klepai-macos.dmg` (macOS), `klepai_x64-setup.exe` (Windows NSIS; .msi deliberately skipped), `klepai_amd64.AppImage`, `klepai_amd64.deb`, `klepai_x86_64.rpm` (Linux). No zips — `klepai-windows.zip`/`klepai-linux.zip` are legacy (v0.1.1 only). The same workflow publishes the signed macOS updater feed (`Klepai.app.tar.gz` + `.sig` + `latest.json`, darwin-aarch64) when the signing secrets exist; the updater stays macOS-only per issue #14. Manual workflow_dispatch accepts a `tag` input to re-feed an existing release (v0.1.1's feed was re-fed locally after a GitHub API outage).
- **Landing changelog (v0.1.6, `plans/v0.1.6.md`):** each release drafts its changelog entry + "Latest: vX" chip bump in the /release-product form; they ride the version-bump commit (static HTML in `index.html`, no GitHub API, no new JS). Deploy is manual — after every release remind about `wrangler pages deploy`. The changelog sits above the Roadmap on the landing; the roadmap keeps only future versions.

## Deferred decisions

- **Sentry (free tier)** — candidate for crash reporting in future public versions (consider opt-in). Noted here 2026-10-26 at the owner's request; not decided yet.
- Product docs site — postponed (owner: "docs later"); landing `klepai.pages.dev` will be expanded instead.

## Katalog treści WRITES (klepai)

Content (content-update/content-launch) dla klepai zapisuje do `writes-content/` wewnątrz repo (gitignored; poprzednie ścieżki `~/Documents/klepai/CrystalPlatforms-klepai/` i `~/Documents/writes-content/` są nieaktualne — katalog nie istnieje, stan na 2026-11-15). Każdy post w osobnym katalogu `writes-content/<YYYY-MM-DD-launch|update>/`; kanały: `x.md`, `bsky.md`, `substack.md`, `devto.md` (nigdy linkedin/facebook). Kanały i konwencje głosu prowadzi ledger `story.md` w tym katalogu.

### Format postów (X i Bluesky — oba tak samo, ustalone 2026-11-15)

- Numer postu sam w osobnej linii (`1/`), po nim pusta linia, potem treść — bez etykiet typu "Post A (…):", bez treści w tej samej linii co numer. Bluesky ma tyle samo pod-postów co X (5–7), nie mniej.
- Posty rozdzielone `---` (konwencja pliku).

### Linki w postach (twarda reguła)

- **Nigdy nie dawaj landinga (`klepai.pages.dev`) ani żadnych innych URL-i — tylko link do repo: `github.com/CrystalPlatforms/klepai`.**

