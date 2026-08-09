/**
 * ADR-031. The four-region breakpoint is a derived quantity, not a chosen one.
 *
 * This suite pins the derivation rather than the number, so that changing the
 * rail minimum, the conversation minimum, or the stage percentage without
 * moving the breakpoint fails here instead of silently reintroducing the
 * horizontal overflow that ADR-031 removed.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(join(HERE, "Shell.css"), "utf8");

/** Minimums declared by REQ-03-007 and REQ-03-009. */
const RAIL_MIN_PX = 280;
const CONVERSATION_MIN_PX = 380;
/** Stage floor declared by REQ-03-008. */
const STAGE_MIN_FRACTION = 0.6;

/**
 * Smallest viewport where a 60%-floor stage and both side minimums coexist.
 *
 * The stage floor scales with the viewport, so this is a fixed point rather
 * than a sum: sides must fit the (1 - fraction) remainder.
 */
function smallestFittingViewport(): number {
  return (RAIL_MIN_PX + CONVERSATION_MIN_PX) / (1 - STAGE_MIN_FRACTION);
}

function fourRegionBreakpoint(): number {
  const match = CSS.match(/@media \(min-width: (\d+)px\) \{\s*\.oh-shell--pro/);
  if (!match) throw new Error("four-region media query not found in Shell.css");
  return Number(match[1]);
}

function twoPaneUpperBound(): number {
  const match = CSS.match(/@media \(min-width: 1200px\) and \(max-width: (\d+)px\)/);
  if (!match) throw new Error("two-pane media query not found in Shell.css");
  return Number(match[1]);
}

describe("four-region breakpoint arithmetic (ADR-031)", () => {
  it("derives 1650px as the exact infimum", () => {
    expect(smallestFittingViewport()).toBe(1650);
  });

  it("uses a breakpoint at or above the derived minimum", () => {
    expect(fourRegionBreakpoint()).toBeGreaterThanOrEqual(smallestFittingViewport());
  });

  it("rejects the two values that were previously wrong", () => {
    // 1600 was the shipped value; 1620 was the erroneous correction that
    // treated the 960px stage floor as fixed while the viewport moved.
    for (const wrong of [1600, 1620]) {
      const remainder = wrong * (1 - STAGE_MIN_FRACTION);
      expect(remainder).toBeLessThan(RAIL_MIN_PX + CONVERSATION_MIN_PX);
      expect(fourRegionBreakpoint()).not.toBe(wrong);
    }
  });

  it("leaves no gap between the two-pane tier and the four-region tier", () => {
    expect(twoPaneUpperBound() + 1).toBe(fourRegionBreakpoint());
  });

  it("no longer masks a misfit with horizontal overflow", () => {
    const fourRegionBlock = CSS.slice(CSS.indexOf(`@media (min-width: ${fourRegionBreakpoint()}px)`));
    expect(fourRegionBlock).not.toContain("overflow-x: auto");
  });

  it("keeps the side minimums the derivation depends on", () => {
    expect(CSS).toContain("clamp(280px, 18vw, 360px)");
    expect(CSS).toContain("clamp(380px, 24vw, 440px)");
    expect(CSS).toContain("minmax(60%, 1fr)");
  });
});
