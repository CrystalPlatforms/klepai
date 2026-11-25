//! AgentLoader rendering (the needs-input type, v0.1.1 story 44).
//!
//! Assumptions these tests encode:
//! - The "needs-input" type is a full nine-square grid (not the braille
//!   eight) that takes its color from CSS: every square is plain
//!   `bg-current`, so a blue text class at the call site paints the whole
//!   grid blue and NO orange anywhere for needs input.
//! - The error X pattern (red cells) stays exclusive to the "error" type —
//!   a needs-input grid renders no red at all.
//! - The dotClassName pass-through still applies per square.
//! - The in-sync pulsing itself (opacity oscillation with identical timing
//!   on all nine squares) is a motion-keyframe property the jsdom DOM can't
//!   expose — verified visually at HITL.

import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { AgentLoader } from "./AgentLoader";

const dots = (container: HTMLElement) =>
  container.querySelectorAll(".bg-current");

describe("the needs-input loader type", () => {
  it("renders the full nine-square grid", () => {
    const { container } = render(<AgentLoader type="needs-input" />);
    expect(dots(container)).toHaveLength(9);
  });

  it("colors every square from CSS — plain bg-current, no baked-in hue", () => {
    const { container } = render(<AgentLoader type="needs-input" />);
    for (const dot of dots(container)) {
      expect(dot).toHaveClass("bg-current");
      expect(dot.className).not.toMatch(/#[0-9a-f]{6}|text-/);
    }
    // The wrapper stays neutral so the call site's text class decides the
    // color — blue for needs input, never orange.
    expect(container.firstChild).not.toHaveClass("text-orange-500");
  });

  it("shows no error X pattern", () => {
    const { container } = render(<AgentLoader type="needs-input" />);
    expect(container.innerHTML).not.toContain("#f04444");
    expect(container.innerHTML).not.toContain("shadow-[");
  });

  it("still honors the dotClassName pass-through", () => {
    const { container } = render(
      <AgentLoader type="needs-input" dotClassName="h-2 w-2" />,
    );
    expect(dots(container)[0]).toHaveClass("h-2", "w-2");
  });
});
