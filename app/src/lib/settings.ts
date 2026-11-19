// The notifications preference (issue #50): one app-wide on/off switch for
// every v0.1.1 notification. Off silences the delivery layer only — the
// in-thread blue loader and the sidebar needs-input status are UI and keep
// rendering (plan F1).
//
// Persistence lives in the webview's localStorage: the backend Settings row
// holds generation defaults (server/model/system prompt), and this is a
// presentation-only preference. localStorage survives app restarts with the
// webview profile, reads synchronously (the delivery layer checks it on the
// hot event path), and degrades gracefully when storage is unavailable.

const STORAGE_KEY = "klepai.notificationsEnabled";

/** Reads the toggle — `true` (on) is the default and the fallback whenever
 * the stored value is missing, malformed or the storage is unreadable. */
export function notificationsEnabled(): boolean {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === null ? true : raw === "true";
  } catch {
    return true;
  }
}

/** Persists the toggle. A storage failure keeps the in-memory value of the
 * session working; persistence silently degrades until storage returns. */
export function setNotificationsEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? "true" : "false");
  } catch {
    // Unreadable storage (cleared/blocked site data) — nothing to do.
  }
}
