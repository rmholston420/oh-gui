# 07. Visual Design System (Phase 4)

## 7.1 Core visual language

- Base: deep lapis/monastery-night palette, #040814 to #0B132B, luminance-stepped panels.
- Accent: saffron/amber (#F59E0B or #FBBF24) reserved exclusively for "agent active" states.
- Typography: geometric sans/monospace pairing for code/diffs/metrics (tabular numerals); Vibe Mode headers may use a warmer display face - never for code, diffs, or contrast-gated surfaces.
- Green/red reserved strictly for diff and pass/fail status.

## 7.2 Material language

- Glassmorphism first-class material via vendored source (see 7.2.1). Caps: <=12px blur, semi-opaque tint under text, fallback for unsupported browsers, never animate blur under reduced-motion, honor reduce-transparency.
- Neobrutalist weight-tiering preserved: Accept All never the visually heaviest button on any review screen - a Hard Constraints Checklist item.
- Parallel-agent color exception budget: accent equals user attention; each parallel run gets a desaturated identity hue.
- High-contrast diff palette: verified at 7:1 contrast for all diff token types, part of the CI-enforced token set.

## 7.2.1 Motion/visual dependency correction (v4.0)

- framer-motion was renamed to motion in 2025; import path is motion/react. The old framer-motion package still works but is unmaintained - use motion/react for all new code.
- Aceternity UI and Magic UI are copy-paste component libraries, not installable dependencies. Copy source into components/ui/ and treat as owned project code, subject to the same CI contrast gates as everything else.

## 7.3 Accessibility - CI-enforced (not late polish)

- Every theme token ships with a measured contrast ratio, checked automatically in CI.
- Minimum interactive-border alpha meeting 3:1 non-text contrast.
- Non-color redundancy for all diff/status indicators.
- Full keyboard navigation, logical focus order, visible focus states.
- prefers-reduced-motion and reduce-transparency honored everywhere.
- Light theme, high-contrast theme, density modes alongside dark-first.
- Conformance labeling, corrected: Target Size Minimum is Level AA (24x24 CSS px or spaced equivalent). Focus Appearance is Level AAA, not AA - enforced as a blocking CI gate but labeled accurately as "AA conformance, plus Focus Appearance (AAA) enforced as project requirement."
- Screen-reader mode extended to plan tree (flat list) and diff view (semantic descriptions).
- High-contrast diff palette verified at 7:1, in the CI token-check set.

## 7.4 Keyboard model

Command palette, zone/mode navigation, hunk-level review shortcuts, pause shortcut, next-intervention shortcut, focus-mode toggle. Destructive shortcuts require confirmation or route through a reversible staging step.

## 7.4.1 Vim-modal tier (Pro Mode only)

Toggleable Vim-modal mode for the diff/review workbench, a leader-key namespace for agent actions backed by ask_agent(), macro recording. Entirely absent from Vibe Mode by design.

Phase 4 exit criterion: all shipped tokens pass automated WCAG 2.2 AA contrast checks in CI, plus Focus Appearance enforced and accurately labeled; screen-reader mode functional across all five surfaces; Vim-modal tier does not regress the base keyboard model.
