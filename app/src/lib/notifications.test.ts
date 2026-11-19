//! The v0.1.1 notification decision layer (issue #52).
//!
//! Assumptions these tests encode:
//! - Notify ONLY for a background conversation: a different one is on
//!   screen, or the Klepai window is unfocused/minimized. The conversation
//!   currently open never notifies while the window is visible.
//! - `needs_input_cleared` is bookkeeping — it never notifies, whatever the
//!   context.
//! - The Settings toggle (issue #50) off silences all three kinds.
//! - One notification per event, no aggregation: the layer is stateless, so
//!   two near-simultaneous events produce two separate notifications.
//! - Content: title "Klepai"; the type line is exactly "Finished" / "Needs
//!   input" / "Error"; the body is the conversation name truncated to ~40
//!   characters with "…".

import { describe, expect, it } from "vitest";

import {
  buildNotification,
  shouldNotify,
  truncateName,
  type LifecyclePayload,
} from "./notifications";

const event = (
  overrides: Partial<LifecyclePayload> = {},
): LifecyclePayload => ({
  conversation_id: 7,
  conversation_name: "Refactor the loader",
  kind: "finished",
  ...overrides,
});

/** The context of a user staring at conversation 7 in a focused window. */
const watching = {
  selectedId: 7,
  windowVisible: true,
  enabled: true,
};

describe("shouldNotify — the background filter", () => {
  it("notifies for a conversation the user is NOT viewing", () => {
    expect(
      shouldNotify(event({ conversation_id: 3 }), {
        selectedId: 7,
        windowVisible: true,
        enabled: true,
      }),
    ).toBe(true);
  });

  it("never notifies for the conversation currently on screen", () => {
    expect(shouldNotify(event(), watching)).toBe(false);
  });

  it("still notifies for the selected conversation when the window is minimized or unfocused", () => {
    expect(
      shouldNotify(event(), { ...watching, windowVisible: false }),
    ).toBe(true);
  });

  it("notifies every kind while the conversation is in the background", () => {
    const ctx = { selectedId: 7, windowVisible: true, enabled: true };
    expect(shouldNotify(event({ kind: "needs_input", conversation_id: 3 }), ctx)).toBe(true);
    expect(shouldNotify(event({ kind: "error", conversation_id: 3 }), ctx)).toBe(true);
    expect(shouldNotify(event({ kind: "finished", conversation_id: 3 }), ctx)).toBe(true);
  });
});

describe("shouldNotify — never-notify rules", () => {
  it("drops needs_input_cleared even when everything else says notify", () => {
    expect(
      shouldNotify(event({ kind: "needs_input_cleared", conversation_id: 3 }), {
        selectedId: 7,
        windowVisible: false,
        enabled: true,
      }),
    ).toBe(false);
  });

  it("silences ALL kinds when the Settings toggle is off", () => {
    const ctx = { selectedId: 7, windowVisible: true, enabled: false };
    expect(shouldNotify(event({ conversation_id: 3 }), ctx)).toBe(false);
    expect(shouldNotify(event({ conversation_id: 3, kind: "needs_input" }), ctx)).toBe(false);
    expect(shouldNotify(event({ conversation_id: 3, kind: "error" }), ctx)).toBe(false);
    // Even the invisible-window path stays silent.
    expect(
      shouldNotify(event({ conversation_id: 3 }), { ...ctx, windowVisible: false }),
    ).toBe(false);
  });
});

describe("buildNotification — the content", () => {
  it("titles every notification Klepai", () => {
    expect(buildNotification(event())?.title).toBe("Klepai");
  });

  it("uses the exact type line per kind", () => {
    expect(buildNotification(event({ kind: "finished" }))?.typeLine).toBe("Finished");
    expect(buildNotification(event({ kind: "needs_input" }))?.typeLine).toBe("Needs input");
    expect(buildNotification(event({ kind: "error" }))?.typeLine).toBe("Error");
  });

  it("carries the conversation id for the click-to-navigate path", () => {
    expect(buildNotification(event({ conversation_id: 42 }))?.conversationId).toBe(42);
  });

  it("builds nothing for needs_input_cleared", () => {
    expect(buildNotification(event({ kind: "needs_input_cleared" }))).toBeNull();
  });

  it("keeps one event = one notification (no aggregation, no state)", () => {
    const first = buildNotification(event({ conversation_id: 3 }));
    const second = buildNotification(event({ conversation_id: 4 }));
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first).not.toBe(second);
    expect(first?.conversationId).toBe(3);
    expect(second?.conversationId).toBe(4);
  });
});

describe("truncateName — the ~40-character body", () => {
  it("leaves a short name untouched", () => {
    expect(truncateName("Refactor the loader")).toBe("Refactor the loader");
  });

  it("accepts a name of exactly 40 characters unchanged", () => {
    const name = "a".repeat(40);
    expect(truncateName(name)).toBe(name);
  });

  it("cuts a longer name to ~40 characters and closes with an ellipsis", () => {
    const name = "b".repeat(60);
    const cut = truncateName(name);
    expect(cut).toHaveLength(40);
    expect(cut.endsWith("…")).toBe(true);
    expect(cut.startsWith("b".repeat(39))).toBe(true);
    expect(cut).not.toContain("b".repeat(41));
  });

  it("never lets the ellipsis orphan trailing whitespace", () => {
    const name = `${"c".repeat(39)}  `;
    const cut = truncateName(name);
    expect(cut.endsWith("c…")).toBe(true);
  });
});
