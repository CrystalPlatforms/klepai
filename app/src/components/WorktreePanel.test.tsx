//! WorktreePanel behavior (issues #40/#41).
//!
//! Assumptions these tests encode:
//! - `changes` → the merge notice with [Keep branch] / [Merge into
//!   project]. The notice exists only for worktree runs — the backend
//!   emits it exclusively for those, so the panel renders exactly what
//!   the run ended with (issue #40's AC).
//! - `clean` → an informational notice only: no merge buttons, nothing
//!   that resolves (issue #41's zero-change AC).
//! - The decision travels out through onResolve(true/false); dismissing
//!   the info is not a resolution.

import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { WorktreePanel, type WorktreeInfo } from "./WorktreePanel";

const changes: WorktreeInfo = {
  status: "changes",
  branch: "klepai/agent-3",
  path: "/home/dev/proj-klepai-3",
  summary: "Fix the parser\n\n src/main.rs | 4 ++--",
};

describe("WorktreePanel", () => {
  it("shows both merge choices for committed changes", () => {
    const onResolve = vi.fn();
    render(
      <WorktreePanel
        info={changes}
        onResolve={onResolve}
        onDismiss={() => {}}
      />,
    );
    expect(screen.getByText(/klepai\/agent-3/)).toBeInTheDocument();
    expect(screen.getByText(/src\/main.rs/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Merge into project" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Keep branch" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Merge into project" }));
    expect(onResolve).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByRole("button", { name: "Keep branch" }));
    expect(onResolve).toHaveBeenCalledWith(false);
  });

  it("shows only the informational notice when the agent made no changes", () => {
    const onResolve = vi.fn();
    const onDismiss = vi.fn();
    render(
      <WorktreePanel
        info={{ status: "clean", branch: "klepai/agent-4", path: "/p", summary: "" }}
        onResolve={onResolve}
        onDismiss={onDismiss}
      />,
    );
    expect(screen.getByText("Nothing to merge")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Merge into project" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Keep branch" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    // Dismissing the info is not a resolution.
    expect(onResolve).not.toHaveBeenCalled();
    expect(onDismiss).toHaveBeenCalled();
  });
});
