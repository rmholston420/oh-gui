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
/** Maximums declared by the same requirements. */
const RAIL_MAX_PX = 360;
const CONVERSATION_MAX_PX = 440;
/** Stage floor declared by REQ-03-008. */
const STAGE_MIN_FRACTION = 0.6;
/** Preferred side tracks, as fractions of the viewport. */
const RAIL_VW = 0.17;
const CONVERSATION_VW = 0.23;
/** The widest viewport this workstation can present (Colossus ultrawide). */
const MAX_VIEWPORT = 3440;

/**
 * Smallest viewport where a 60%-floor stage and both side minimums coexist.
 *
 * The stage floor scales with the viewport, so this is a fixed point rather
 * than a sum: sides must fit the (1 - fraction) remainder.
 */
function smallestFittingViewport(): number {
  return (RAIL_MIN_PX + CONVERSATION_MIN_PX) / (1 - STAGE_MIN_FRACTION);
}

/** Resolved width of a clamped side track at a given viewport. */
function clampPx(vw: number, min: number, max: number, viewport: number): number {
  return Math.min(Math.max(vw * viewport, min), max);
}

/** Total width the two side tracks actually claim at a given viewport. */
function sidesAt(viewport: number): number {
  return (
    clampPx(RAIL_VW, RAIL_MIN_PX, RAIL_MAX_PX, viewport) +
    clampPx(CONVERSATION_VW, CONVERSATION_MIN_PX, CONVERSATION_MAX_PX, viewport)
  );
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
  it("derives 1650px as the floor implied by the side minimums alone", () => {
    // Necessary but NOT sufficient: the minimums are only one of two constraints.
    expect(smallestFittingViewport()).toBe(1650);
  });

  it("keeps the preferred side tracks inside the stage's 40% budget", () => {
    // The original defect: 18vw + 24vw = 42vw against a 40% budget, so the
    // layout overflowed by 2% of the viewport regardless of the minimums.
    expect(RAIL_VW + CONVERSATION_VW).toBeCloseTo(1 - STAGE_MIN_FRACTION, 10);
  });

  it("never overflows at any width from the breakpoint to the widest display", () => {
    const bp = fourRegionBreakpoint();
    const offenders: number[] = [];
    for (let w = bp; w <= MAX_VIEWPORT; w += 1) {
      if (sidesAt(w) > (1 - STAGE_MIN_FRACTION) * w + 1e-9) offenders.push(w);
    }
    expect(offenders).toEqual([]);
  });

  it("would have caught the 1650px breakpoint that shipped overflow", () => {
    // At 1650-1652 the 23vw conversation track is still below its 380px floor,
    // so the floor wins and the sides exceed 40%. This is why 1700 is correct.
    const offenders = [1650, 1651, 1652].filter(
      (w) => sidesAt(w) > (1 - STAGE_MIN_FRACTION) * w + 1e-9,
    );
    expect(offenders).toEqual([1650, 1651, 1652]);
    expect(fourRegionBreakpoint()).toBeGreaterThan(1652);
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
    // 1650 satisfied the minimums but not the preferred-track budget.
    expect(fourRegionBreakpoint()).not.toBe(1650);
  });

  it("leaves no gap between the two-pane tier and the four-region tier", () => {
    expect(twoPaneUpperBound() + 1).toBe(fourRegionBreakpoint());
  });

  it("no longer masks a misfit with horizontal overflow", () => {
    const fourRegionBlock = CSS.slice(CSS.indexOf(`@media (min-width: ${fourRegionBreakpoint()}px)`));
    expect(fourRegionBlock).not.toContain("overflow-x: auto");
  });

  it("keeps the side minimums the derivation depends on", () => {
    expect(CSS).toContain("clamp(280px, 17vw, 360px)");
    expect(CSS).toContain("clamp(380px, 23vw, 440px)");
    expect(CSS).toContain("minmax(60%, 1fr)");
  });
});
