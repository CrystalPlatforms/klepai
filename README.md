# Klepai by CrystalPlatforms

Klepai is a private, self-hosted LLM manager: a desktop chat app for macOS, Windows and Linux that connects to your own model servers over the LAN.

- **Ollama first-class** + any OpenAI-compatible endpoint
- Rich chat: streaming, markdown, code blocks, thinking blocks
- **Agent mode**: your server models code in a project folder through built-in tools, with Claude Code and Codex CLI as ready-made extra brains
- Everything local: SQLite, no accounts, no telemetry

**Status:** Klepai Beta v0.1.0 (released) · see [PRD.md](PRD.md)

## Install — ActivatePresto

Klepai ships unsigned (free & open source), so your system blocks the first
launch once. Skip the click-through — run one command and Klepai starts:

- **macOS** — open `klepai-macos.dmg`, drag Klepai to Applications, then:

  ```sh
  xattr -cr /Applications/Klepai.app && open /Applications/Klepai.app
  ```

- **Windows** — in PowerShell (not the old cmd):

  ```powershell
  Expand-Archive "$env:USERPROFILE\Downloads\klepai-windows.zip" "$env:USERPROFILE\Downloads\klepai-windows" -Force; Get-ChildItem "$env:USERPROFILE\Downloads\klepai-windows" -Recurse | Unblock-File; Start-Process (Get-ChildItem "$env:USERPROFILE\Downloads\klepai-windows" -Recurse -Filter "*-setup.exe").FullName
  ```

- **Linux** (Ubuntu/Debian):

  ```sh
  cd ~/Downloads && unzip -o klepai-linux.zip && sudo apt install ./klepai-linux/deb/*.deb
  ```

  Fedora: `sudo dnf install ~/Downloads/klepai-linux/rpm/*.rpm` · no install
  at all: `chmod +x ~/Downloads/klepai-linux/appimage/*.AppImage`

The manual way still works: macOS right-click → **Open** (or System Settings →
Privacy & Security → **Open Anyway**); Windows SmartScreen → **More info →
Run anyway**.

## Updates

Update bundles are signature-verified against GitHub Releases: the app ships
with the **public** key in `app/src-tauri/tauri.conf.json`
(`plugins.updater.pubkey`), and release artifacts are signed with the matching
**private** key at build time.

Maintainer setup (done once, 2026-10-24):

1. Keypair generated with `npx tauri signer generate -w ~/.tauri/klepai.key`
   (no password). The private key lives OUTSIDE the repository, so never
   commit it.
2. If CI ever builds releases, store the contents of `~/.tauri/klepai.key` as
   the repository secrets `TAURI_SIGNING_PRIVATE_KEY` and
   `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (empty).
3. Local release builds need no setup: the `tauri` npm script in `app/`
   wires the key automatically:

   ```sh
   npm run tauri build
   ```

Losing the private key means published installs can never update in place; a
new key needs a fresh install. Until a signed release ships a `latest.json`
asset, **Check for updates** in About simply reports Klepai as up to date.
That is the expected pre-release state, not a bug.

© CrystalPlatforms, MIT License
