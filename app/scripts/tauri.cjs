//! Cross-platform wrapper around the Tauri CLI (Windows-friendly).
//!
//! The previous `tauri` script set the updater signing env vars with Unix
//! syntax (`KEY=… tauri`), which Windows cmd cannot run — `npm run tauri
//! dev` failed before the CLI even started. This wrapper sets the same
//! environment in plain Node, on every OS:
//!
//! - `TAURI_SIGNING_PRIVATE_KEY` — the minisign key at ~/.tauri/klepai.key
//!   (only when the file exists; `tauri dev` never needs it, `tauri build`
//!   does and fails with its own clear message otherwise).
//! - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — empty unless already set.
//!
//! Remaining arguments pass through unchanged: `npm run tauri dev`,
//! `npm run tauri build`, … all work as before.

const { spawnSync } = require("node:child_process");
const os = require("node:os");
const path = require("node:path");

if (process.env.TAURI_SIGNING_PRIVATE_KEY === undefined) {
  const keyPath = path.join(os.homedir(), ".tauri", "klepai.key");
  if (require("node:fs").existsSync(keyPath)) {
    process.env.TAURI_SIGNING_PRIVATE_KEY = keyPath;
    if (process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD === undefined) {
      process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "";
    }
  }
}

const [, , ...args] = process.argv;
const cli = require.resolve("@tauri-apps/cli/tauri.js", { paths: [__dirname, ".."] });
const result = spawnSync(process.execPath, [cli, ...args], {
  stdio: "inherit",
  env: process.env,
});
process.exit(result.status ?? 1);
