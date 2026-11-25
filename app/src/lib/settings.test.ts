//! The notifications preference (issue #50).
//!
//! Assumptions these tests encode:
//! - ON is the default: no stored value (fresh profile, first run) means
//!   notifications enabled.
//! - The toggle persists — a stored value survives a "restart" (a fresh
//!   read from the same storage, i.e. how the next app session sees it).
//! - Any stored value other than the exact "true" reads as off — storage is
//!   written only by this toggle, so anything else is a flipped-off state.
//! - Unreadable storage never breaks the app: reads fall back to ON.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { notificationsEnabled, setNotificationsEnabled } from "./settings";

describe("the notifications toggle", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("defaults to on when nothing is stored yet", () => {
    expect(notificationsEnabled()).toBe(true);
  });

  it("persists the off state across a restart", () => {
    setNotificationsEnabled(false);
    // A fresh read — what the next app session's first call sees.
    expect(notificationsEnabled()).toBe(false);
  });

  it("persists the on state after being turned back on", () => {
    setNotificationsEnabled(false);
    setNotificationsEnabled(true);
    expect(notificationsEnabled()).toBe(true);
  });

  it("reads any stored non-true value as off", () => {
    window.localStorage.setItem("klepai.notificationsEnabled", "false");
    expect(notificationsEnabled()).toBe(false);
  });

  it("falls back to on when storage is unreadable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    expect(notificationsEnabled()).toBe(true);
  });
});
