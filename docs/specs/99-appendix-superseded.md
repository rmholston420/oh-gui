# 99. Appendix - Superseded Ideas (Reference Only, Do Not Resurrect)

This file exists so future sessions never accidentally re-propose an idea that was already
considered and rejected across the v2.0-v4.0 revision history.

- The three-layout Vibe/Standard/Pro exploration - rejected. Two modes only, see 01-principles.md Principle 9 and 03-layout.md.
- The Phase-2 promotion of Compare mode - reversed. Compare mode is Phase 6, low-priority, deferrable indefinitely. See 03-layout.md section 3.6.
- "Archival status uncertain" for OpenHands/agent-canvas - resolved and closed. See 00-ground-truth.md. Caution: a stale crawl artifact can misreport an active-looking state; always verify against issues/releases/CI pages, not just the homepage.
- Subclassing ConfirmationPolicyBase for path-scoping logic - architecturally impossible; the policy layer receives only a SecurityRisk enum, never file paths. Use a custom SecurityAnalyzerBase instead. See 04-authorization.md section 4.1.
- Overloading the Co-authored-by git trailer for agent-authorship metadata - rejected due to collision with established GitHub tooling semantics. Use the X-Agent-* namespace. See 06-change-review.md section 6.7.
- Treating trust-class display alone as sufficient prompt-injection defense - insufficient. See 04a-prompt-injection.md's structural quarantine requirement (v4.0 addition).
- Treating framer-motion as the current package name - stale as of v4.0. The package was renamed to motion; import from motion/react. See 07-visual-design.md section 7.2.1.
- Treating Aceternity UI / Magic UI as npm-installable dependencies - incorrect; they are copy-paste component libraries. See 12-portable-components.md.
- Bundling WCAG 2.5.8 (Target Size Minimum, Level AA) and 2.4.13 (Focus Appearance, Level AAA) under a single "AA" conformance claim - inaccurate; label them separately. See 07-visual-design.md section 7.3.
- Assuming a single-operator household - superseded by 15-household-profiles.md (v4.0 addition) once a multi-user deployment was identified.
