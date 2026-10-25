//! Human-readable sizes for the Settings → Skills list. Pure presentation
//! math — per-skill display only; skills have no total-size budget (issue
//! #34): the assistant reads a skill's full text on demand, so nothing
//! accumulates in the prompt to cap.

/** Human-readable size: bytes below 1 KiB, KiB with one decimal above. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  return `${(bytes / 1024).toFixed(1)} KiB`;
}
