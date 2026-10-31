//! CollisionPanel behavior (issues #38/#39).
//!
//! Assumptions these tests encode:
//! - The panel names the blocking conversation and its folder, and always
//!   leaves "Run anyway" — it never hard-blocks.
//! - Without git (hasGit=false) the choices are exactly Cancel / Run
//!   anyway: no worktree escape hatch (issue #38's AC).
//! - With git (hasGit=true) "Run in worktree" appears (issue #39's AC).
//! - The decision travels out through onChoose; Cancel sends null.

import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { CollisionPanel } from "./CollisionPanel";
import type { CollisionBlocker } from "@/types";

const blocker: CollisionBlocker = {
  conversation_id: 2,
  title: "Refactor auth",
  path: "/home/dev/proj",
};

describe("CollisionPanel", () => {
  it("names the running conversation and offers only Run anyway / Cancel without git", () => {
    const onChoose = vi.fn();
    render(<CollisionPanel blocker={blocker} hasGit={false} onChoose={onChoose} />);
    expect(screen.getByText(/Refactor auth/)).toBeInTheDocument();
    expect(screen.getByText(/\/home\/dev\/proj/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run anyway" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    // Issue #38's AC: this phase has no third choice.
    expect(
      screen.queryByRole("button", { name: "Run in worktree" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Run anyway" }));
    expect(onChoose).toHaveBeenCalledWith("proceed");
  });

  it("offers the worktree choice only when the folder is a git repository", () => {
    const onChoose = vi.fn();
    render(<CollisionPanel blocker={blocker} hasGit onChoose={onChoose} />);
    fireEvent.click(screen.getByRole("button", { name: "Run in worktree" }));
    expect(onChoose).toHaveBeenCalledWith("worktree");
  });

  it("sends nothing on Cancel", () => {
    const onChoose = vi.fn();
    render(<CollisionPanel blocker={blocker} hasGit onChoose={onChoose} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onChoose).toHaveBeenCalledWith(null);
  });
});
