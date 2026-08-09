# ADR-031 — The four-region breakpoint is 1700px, because 1600px cannot satisfy its own requirements

> **REVISION 2 (2026-08-09 05:08 EDT) — the original decision was wrong and was caught by its own
> browser test.** Revision 1 concluded 1650px by reasoning about the side *minimums* (280 + 380 =
> 660 against a 40% budget). The Playwright suite then measured 33px of real overflow at 1650px,
> 18px at 1920px. A DOM probe showed the resolved tracks at 1650px were `297px 990px 396px` — the
> rail and conversation were nowhere near their 280/380 minimums.
>
> **The binding constraint was never the minimums; it was the clamp preferred values.** The sides
> were `clamp(280px, 18vw, 360px)` and `clamp(380px, 24vw, 440px)`: `18vw + 24vw = 42vw` against a
> 40% budget left by the 60% stage floor. The layout overflowed by 2% of the viewport at every
> width in the tier, shrinking only where a clamp hit its cap (hence 18px rather than 33px at
> 1920px, where the conversation track is capped at 440px).
>
> Minimum-fit is **necessary but not sufficient**. Three conditions must hold together: the
> minimums must fit the 40% budget, the preferred percentages must sum to <=40%, and the maximums
> must not exceed it either.
>
> **Revised decision: sides become `17vw` and `23vw` (40% exactly) and the breakpoint becomes
> 1700px.** 1700px is the smallest width where the 23vw conversation track clears its own 380px
> floor; below 1653px the floor wins and the sides exceed 40% again. Verified by exhaustive
> search over every integer width from the breakpoint to 3440px (Colossus's ultrawide), and in a
> real browser at 1600/1620/1650/1699/1700/1800/1920/2560/3440.
>
> The lesson worth keeping: revision 1's arithmetic was self-consistent and completely wrong,
> because it modelled a constraint the CSS was not actually exercising. The unit test agreed with
> it, since it was written from the same mistaken model. Only the browser measurement caught it.
> A test derived from the same assumption as the implementation cannot falsify that assumption.

**Status:** Ratified · revised 2026-08-09 (revision 2)
**Lock-in phase:** Phase 1 · shell layout
**Supersedes:** — (corrects REQ-03-014 in `docs/specs/03-layout.md`)

## Context

Three layout requirements in `docs/specs/03-layout.md` are jointly unsatisfiable at the breakpoint
the same document declares:

- **REQ-03-007** left rail: `clamp(280px, 18vw, 360px)` — minimum **280px**
- **REQ-03-008** center stage: fluid, **>=60%** width
- **REQ-03-009** right conversation column: **380–440px**, always present — minimum **380px**
- **REQ-03-014** the four-region layout activates at **>=1600px**

At exactly 1600px the stage floor is 960px, leaving 640px for two sides whose minimums sum to
660px. The layout is 20px short of its own contract on the first pixel it is meant to apply.

`Shell.css` did not fail silently — it carried `overflow-x: auto` and a comment stating the
overflow was "preferable to silently shrinking the center stage." That was the correct call
between two bad options, but it left the primary desktop layout horizontally scrolling in a
50px-wide window, and it left the spec asserting something untrue.

### The arithmetic was previously done wrong, including by me

An earlier working note recorded the requirement as ">=1620px", from `280 + 960 + 380 = 1620`.
**That is wrong**, and adopting it would have shipped the same defect with a smaller window. The
error is treating the 960px stage floor as fixed while the viewport moves. It is not — it is 60%
*of the viewport*, so widening the viewport also raises the floor.

The constraint is a fixed point, not a sum. Let \(W\) be the viewport and \(S = 280 + 380 = 660\)
the side minimums. The stage claims \(0.6W\); the sides must fit in the remainder:

\[
0.6W + S \le W \;\Longrightarrow\; S \le 0.4W \;\Longrightarrow\; W \ge \frac{660}{0.4} = 1650
\]

At \(W = 1620\): stage floor 972px, remainder 648px, still 12px short. At \(W = 1650\): stage 990px,
remainder exactly 660px. **1650px is the exact infimum**, not a padded estimate.

## Decision

**REQ-03-014's four-region breakpoint moves from 1600px to 1650px.** The `1200–1599px` tier becomes
`1200–1649px`. `Shell.css` follows, and `overflow-x: auto` is removed from the four-region grid
because the arrangement now provably fits.

The three constituent minimums — 280px rail, 60% stage, 380px conversation — are **unchanged**.

## Rationale

**Why move the breakpoint rather than shrink a region.** The alternatives each weaken a stated
requirement to preserve a number that was never derived. The 1600px figure is a conventional
round breakpoint; 280px, 380px, and 60% are substantive claims about usable width for a file
rail, a conversation column, and a work surface. When a round number contradicts three derived
constraints, the round number is the one that is wrong.

**Why not keep `overflow-x: auto`.** Horizontal scrolling in the primary desktop layout is a
defect, not a graceful degradation, and it appears precisely at the common 1600px width. Retaining
it would also preserve the spec's false claim, which is the more expensive problem: a spec that
asserts an unsatisfiable arrangement will keep generating implementations that quietly violate it.

**Consequence accepted.** Viewports of 1600–1649px now receive the two-pane tier with collapsible
sides instead of four regions. This is the honest outcome: at those widths four regions never fit
at the declared minimums, so the previous behaviour was showing four regions that did not comply.

**Alternatives rejected:**

- **Conversation minimum 380 -> 360px.** Makes 1600px work arithmetically (280 + 960 + 360 = 1600)
  but silently narrows a range REQ-03-009 states explicitly, and 1600px is then an exact-fit
  boundary with zero tolerance for a scrollbar or border.
- **Stage floor 60% -> 58%.** Weakens the requirement most central to ADR-030 ("workspace, not
  chat") in order to preserve a round number.
- **Adopt 1620px.** The arithmetic error described above; still overflows by 12px.
- **Keep the overflow.** Leaves both the defect and the false spec claim in place.

## Consequences

- `docs/specs/03-layout.md` REQ-03-014 amended; tier boundary becomes 1200–1649px.
- `apps/gui/src/shell/Shell.css`: media query 1600px -> 1650px, upper tier bound 1599px -> 1649px,
  `overflow-x: auto` removed from the four-region grid, header comment corrected.
- A regression test pins the arithmetic itself, so any future change to the rail minimum, the
  conversation minimum, or the stage percentage that breaks the inequality fails loudly rather
  than reintroducing silent overflow.
- The <900px read-only authorization gate (REQ-03-015) is untouched.

## References

- `docs/specs/03-layout.md` REQ-03-007, REQ-03-008, REQ-03-009, REQ-03-014
- `docs/specs/07-visual-design.md` §7.2
- `adrs/ADR-030-workspace-not-chat.md`
- `apps/gui/src/shell/Shell.css`
