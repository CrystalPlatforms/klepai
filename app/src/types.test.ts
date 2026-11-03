//! The mode-visibility rule shared by both Natural/Agent affordances (the
//! composer toolbar and the Details panel). Issue #42: Natural is a
//! server-brain mode — a CLI brain has computer access even read-only, so
//! the Natural option never appears for one.

import { describe, expect, it } from "vitest";
import { naturalModeAvailable } from "./types";

describe("naturalModeAvailable", () => {
  it("offers Natural for a server-model brain", () => {
    expect(naturalModeAvailable(null)).toBe(true);
  });

  it("never offers Natural for the Claude Code brain", () => {
    expect(naturalModeAvailable("claude_code")).toBe(false);
  });

  it("never offers Natural for the Codex brain", () => {
    expect(naturalModeAvailable("codex")).toBe(false);
  });
});
