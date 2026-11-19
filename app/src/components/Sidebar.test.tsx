//! Sidebar conversation-card statuses (issues #21, #23 and v0.1.1 #56).
//!
//! Assumptions these tests encode:
//! - A conversation with a pending permission ask shows the blue needs-input
//!   status (v0.1.1, issue #56) — including when ANOTHER conversation is the
//!   one open in the thread: the status rides the global lifecycle events,
//!   not the open thread.
//! - Rank on the card: error mark > needs input > working dot.
//! - A conversation that merely finished leaves no trace: idle looks idle.
//! - The needs-input status is pure UI: the component takes no settings
//!   input and consults no toggle, so it renders with notifications off
//!   (the toggle lives entirely in the delivery layer, issue #50).

import { beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import type { Conversation } from "@/types";
import { Sidebar } from "./Sidebar";

const conversation = (id: number): Conversation => ({
  id,
  title: `Conversation ${id}`,
  server_id: null,
  model_id: null,
  mode: "chat",
  agent_kind: null,
  project_path: null,
  system_prompt: null,
  temperature: null,
  context_len: null,
  thinking: false,
  created_at: 0,
  updated_at: 0,
});

const ids = (...members: number[]) => new Set(members);

const renderSidebar = (props: {
  selectedId?: number;
  streamingIds?: Set<number>;
  errorIds?: Set<number>;
  needsInputIds?: Set<number>;
}) =>
  render(
    <Sidebar
      conversations={[conversation(1), conversation(2)]}
      selectedId={props.selectedId ?? null}
      streamingIds={props.streamingIds ?? new Set()}
      errorIds={props.errorIds ?? new Set()}
      needsInputIds={props.needsInputIds ?? new Set()}
      open
      onSelect={() => {}}
      onCreate={() => {}}
      onRename={() => {}}
      onDelete={() => {}}
      onClose={() => {}}
      onOpenSettings={() => {}}
      onJumpTo={() => {}}
    />,
  );

beforeEach(() => {
  cleanup();
});

describe("the needs-input card status (issue #56)", () => {
  it("marks a conversation waiting on a permission ask in blue", () => {
    renderSidebar({ needsInputIds: ids(1) });
    expect(screen.getByText("Needs input")).toBeInTheDocument();
    expect(screen.getByTitle("Waiting for your decision")).toHaveClass("text-blue-500");
  });

  it("shows the status even when another conversation is open", () => {
    renderSidebar({ selectedId: 2, needsInputIds: ids(1) });
    expect(screen.getByText("Needs input")).toBeInTheDocument();
  });

  it("outranks the working dot", () => {
    renderSidebar({ streamingIds: ids(1), needsInputIds: ids(1) });
    expect(screen.getByText("Needs input")).toBeInTheDocument();
    expect(screen.queryByText("Working…")).not.toBeInTheDocument();
  });

  it("yields to the error mark", () => {
    renderSidebar({ errorIds: ids(1), needsInputIds: ids(1) });
    expect(screen.getByText("Error")).toBeInTheDocument();
    expect(screen.queryByText("Needs input")).not.toBeInTheDocument();
  });

  it("clears once the permission is resolved", () => {
    const view = renderSidebar({ needsInputIds: ids(1) });
    expect(screen.getByText("Needs input")).toBeInTheDocument();
    view.rerender(
      <Sidebar
        conversations={[conversation(1), conversation(2)]}
        selectedId={null}
        streamingIds={new Set()}
        errorIds={new Set()}
        needsInputIds={new Set()}
        open
        onSelect={() => {}}
        onCreate={() => {}}
        onRename={() => {}}
        onDelete={() => {}}
        onClose={() => {}}
        onOpenSettings={() => {}}
        onJumpTo={() => {}}
      />,
    );
    expect(screen.queryByText("Needs input")).not.toBeInTheDocument();
  });
});

describe("the other card statuses stay as they were", () => {
  it("a finished (idle) conversation changes nothing on the card", () => {
    renderSidebar({});
    expect(screen.queryByText("Needs input")).not.toBeInTheDocument();
    expect(screen.queryByText("Working…")).not.toBeInTheDocument();
    expect(screen.queryByText("Error")).not.toBeInTheDocument();
  });

  it("a running conversation keeps the working dot", () => {
    renderSidebar({ streamingIds: ids(2) });
    expect(screen.getByText("Working…")).toBeInTheDocument();
    expect(screen.queryByText("Needs input")).not.toBeInTheDocument();
  });

  it("a failed conversation keeps the error mark", () => {
    renderSidebar({ errorIds: ids(2) });
    expect(screen.getByText("Error")).toBeInTheDocument();
    expect(screen.queryByText("Needs input")).not.toBeInTheDocument();
  });
});
