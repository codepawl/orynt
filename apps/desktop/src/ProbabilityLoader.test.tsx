import { render } from "@testing-library/react";
import { describe, expect, it } from "bun:test";

import {
  PROBABILITY_LOADER_FRAMES,
  ProbabilityLoader,
} from "./ProbabilityLoader";

describe("ProbabilityLoader", () => {
  it("renders the supplied probability symbols in deterministic order", () => {
    const { container } = render(<ProbabilityLoader className="test-loader" />);
    const loader = container.querySelector(".probability-loader");
    const frames = Array.from(
      container.querySelectorAll<HTMLElement>(".probability-loader-frame"),
    );

    expect(loader).toHaveClass("test-loader");
    expect(loader).toHaveAttribute("aria-hidden", "true");
    expect(frames.map((frame) => frame.textContent)).toEqual([
      "♚",
      "♛",
      "♜",
      "♝",
      "♞",
      "♟",
      "♠",
      "♣",
      "♥",
      "♦",
    ]);
    expect(frames).toHaveLength(PROBABILITY_LOADER_FRAMES.length);
    expect(frames.map((frame) => frame.style.animationDelay)).toEqual(
      PROBABILITY_LOADER_FRAMES.map((_, index) => `${index * 100}ms`),
    );
  });
});
