//! MessageView variant navigation (issues #43/#45).
//!
//! Assumptions these tests encode:
//! - The variant row renders on an assistant bubble only when the message
//!   keeps variants: position readout "n/total" plus `<` `>` when there is
//!   something to step, the shown variant's model label, and the "aborted"
//!   marker on stopped attempts. A single variant shows its label and
//!   "1/1" readout without the step buttons.
//! - Stepping is parent-driven: the buttons report the direction and the
//!   ends hold (clamped by ordinal), while the readout re-renders from the
//!   `variants` prop the parent refreshes after the store flips the marker.
//! - A bubble without variants renders no variant affordances at all.

import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { MessageView } from "./MessageView";
import type { Message, MessageVariant } from "@/types";

const baseMessage: Message = {
  id: 7,
  conversation_id: 1,
  role: "assistant",
  content: "kept answer",
  thinking: null,
  images: [],
  skill_name: null,
  created_at: 1_700_000_000,
};

/** A ring of three: variant `visible` (1-based) is the shown one. */
function ringOf(
  visible: number,
  aborted = false,
): MessageVariant[] {
  const contents = ["answer one", "answer two", "answer three"];
  return contents.map((content, index) => ({
    id: 100 + index,
    message_id: 7,
    content,
    thinking: null,
    model_id: index === 0 ? "llama3:8b" : "qwen2.5:7b",
    aborted: aborted && index === visible - 1,
    ordinal: index + 1,
    visible: index === visible - 1,
  }));
}

describe("MessageView variant navigation", () => {
  it("renders no variant affordances without variants", () => {
    render(<MessageView message={baseMessage} />);
    expect(screen.queryByTestId("variant-nav")).not.toBeInTheDocument();
    expect(screen.getByText("kept answer")).toBeInTheDocument();
  });

  it("renders the n/total readout and the shown variant's model label", () => {
    render(
      <MessageView message={baseMessage} variants={ringOf(2)} onStepVariant={vi.fn()} />,
    );
    expect(screen.getByTestId("variant-readout")).toHaveTextContent("2/3");
    expect(screen.getByTestId("variant-model")).toHaveTextContent("qwen2.5:7b");
  });

  it("steps back and forward through the ring, clamped at the ends", () => {
    const onStepVariant = vi.fn();
    const { rerender } = render(
      <MessageView message={baseMessage} variants={ringOf(1)} onStepVariant={onStepVariant} />,
    );
    const back = screen.getByRole("button", { name: "Previous variant" });
    const forward = screen.getByRole("button", { name: "Next variant" });
    expect(back).toBeDisabled();
    expect(forward).toBeEnabled();

    fireEvent.click(forward);
    expect(onStepVariant).toHaveBeenCalledWith(1);

    // The parent flips the marker and reloads: the readout follows the prop.
    rerender(
      <MessageView message={baseMessage} variants={ringOf(3)} onStepVariant={onStepVariant} />,
    );
    expect(screen.getByTestId("variant-readout")).toHaveTextContent("3/3");
    expect(screen.getByRole("button", { name: "Next variant" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Previous variant" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Previous variant" }));
    expect(onStepVariant).toHaveBeenCalledWith(-1);
  });

  it("shows a single variant's label and readout without step buttons", () => {
    const single: MessageVariant[] = [
      {
        id: 100,
        message_id: 7,
        content: "answer one",
        thinking: null,
        model_id: "llama3:8b",
        aborted: false,
        ordinal: 1,
        visible: true,
      },
    ];
    render(
      <MessageView message={baseMessage} variants={single} onStepVariant={vi.fn()} />,
    );
    expect(screen.getByTestId("variant-readout")).toHaveTextContent("1/1");
    expect(screen.getByTestId("variant-model")).toHaveTextContent("llama3:8b");
    expect(
      screen.queryByRole("button", { name: "Previous variant" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Next variant" }),
    ).not.toBeInTheDocument();
  });

  it("marks an aborted variant beside its model label, absent on complete ones", () => {
    const { rerender } = render(
      <MessageView
        message={baseMessage}
        variants={ringOf(2, true)}
        onStepVariant={vi.fn()}
      />,
    );
    expect(screen.getByTestId("variant-aborted")).toHaveTextContent("aborted");

    // The same ring, complete variant shown: no marker anywhere.
    rerender(
      <MessageView message={baseMessage} variants={ringOf(2)} onStepVariant={vi.fn()} />,
    );
    expect(screen.queryByTestId("variant-aborted")).not.toBeInTheDocument();
  });

  it("never renders the variant row on user messages", () => {
    const userMessage: Message = { ...baseMessage, role: "user", content: "hello" };
    render(
      <MessageView message={userMessage} variants={ringOf(2)} onStepVariant={vi.fn()} />,
    );
    expect(screen.queryByTestId("variant-nav")).not.toBeInTheDocument();
  });
});
