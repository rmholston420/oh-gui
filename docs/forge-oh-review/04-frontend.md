# Forge-OH frontend donor review

**Donor:** `forge-oh`, pinned at `df73ebed2d6d9df9397f7e95dd1eb66bd3dd98b2`  
**Scope:** `/home/user/workspace/forge-oh/src/`  
**Target:** OH-GUI — Vite + React, single-user/local-first, thin Python middleware; **not** a Next.js application.  
**Conclusion:** Do not port the application shell or authorization implementation. Port a small React/CSS/Zod/Query subset and use the donor principally as a UI and interaction-pattern reference. The current approval implementation is an HIL pause/resume control, not an authorization system.

## Reading coverage

### Read fully

| Area | Coverage |
|---|---|
| Application shell | All 53 files under `src/app/**`, including route pages/layouts, error boundaries, and all `app/api/**/route.ts` handlers. |
| Shared code | All 41 files under `src/lib/**`; all four `src/styles/*.css`; `src/middleware.ts`. |
| Reusable primitives | Every implementation, CSS module, and story under `src/components/core/**` (36 files). |
| Directly relevant domain/navigation/settings components | `ApprovalBanner`, `EventCard`, `LiveBashPanel`, `MetricKPI`, `NewRunComposer`, `RunCard`, `RunDetailHeader`, `SpanRow`, `StreamBanner`, `VerifyIterationsWidget`, `VerifyStepCard`, `ForkFromHereButton`, `ForkRunModal`, `RestartFromHereButton`, `RunModelSwitchModal`, `RunSecretsModal`, `RunsCompareModal`, `GpuStrip`, `GpuChipPopover`, and all `components/settings/**` source/CSS. |
| Directly relevant features | All files in `features/security`, `runs`, `run-detail`, `metrics`, `observability`, `settings`, `trace`, `terminal`, and `run-replay`. |
| Tests | Test configuration, shared setup/MSW handlers, complete test inventory, and 41 high-relevance test files: approval/risk, streaming, run detail/control, GPU/metrics/observability, state stores, and settings. |

### Skimmed by category, not line-by-line

I inventory-scanned filenames/imports and categorized the remaining domain/navigation/onboarding components and the remaining feature directories: `agent-presets`, `artifacts`, `browser`, `file-diff`, `inference-backends`, `mcp`, `memory-inspector`, `notifications`, `onboarding`, `plan`, `plugins`, `repograph`, `secrets`, `selfeval`, `skills`, `trajectory-memory`, and `workspaces`. I also inventory-scanned the other 89 tests. I did **not** claim detailed behavior for those skimmed files.

No donor source file was modified and no test suite was run.

---

## 1. Architecture and portability

### Actual framework and routing

The donor is an App Router application. The package currently pins **Next `16.2.10`**, React `19.2.8`, TanStack Query v5, Zustand v5, Socket.IO client, Zod 4, Monaco/xterm, Recharts, Vitest, and Playwright. The user description’s “Next.js 15” is close in architectural terms, but the checked source also uses the Next 16 async-param pattern in dynamic route pages.

Routing is file-system based below `app/(dashboard)`. The root layout supplies Next metadata and the provider tree; the dashboard layout assembles sidebar, top bar, GPU strip, and command palette. Route files are mostly thin feature composition wrappers, but all of these are bound to App Router conventions: `next/link`, `next/navigation`, `redirect`, dynamic route segment params, error-boundary conventions, and server/client boundaries.

Examples:

* `src/app/layout.tsx` is the Next metadata/provider entry point.
* `src/app/(dashboard)/layout.tsx` uses `useRouter` and composes navigation chrome.
* `src/app/(dashboard)/page.tsx` redirects rather than being a reusable page.
* `src/app/(dashboard)/runs/[runId]/page.tsx:24-51` is a client route whose tab layout is useful as a pattern, but whose route mechanics are Next-specific.
* `src/app/api/**/route.ts` handlers are server-side BFF pass-throughs that retain an `x-forge-token`. They are deliberately not browser-portable.
* `src/middleware.ts:4-9` returns `NextResponse.next()` with an empty matcher. It is inert and entirely Next-specific.

**Verdict:** leave the App Router shell, route files, API route handlers, middleware, server rendering assumptions, and `next/*` imports behind. In OH-GUI, choose ordinary Vite entry points plus the existing/router-local navigation approach; make the Python middleware the only holder of upstream credentials and the authorization enforcement point.

### Data fetching and API boundaries

There are two good foundations:

1. `src/lib/api/client.ts:26-109` provides a compact generic JSON fetch wrapper with normalized error handling.
2. `src/lib/api/endpoints.ts:20-49` names lifecycle endpoints, including pause/resume/stop/fork/restart/approve/reject.

TanStack Query is the primary server-state mechanism. `src/lib/query/client.ts:16-20` sets a 30-second stale time and retry-once defaults, while `src/lib/query/keys.ts` centralizes key construction. That split is good and portable.

However, API access is inconsistent:

* feature APIs sometimes use `lib/api/client`;
* some directly `fetch` with `process.env.NEXT_PUBLIC_BFF_URL`;
* `lib/http/bff-client.ts` duplicates a fetch abstraction;
* the run detail feature validates the summary but returns unparsed event JSON in `src/features/run-detail/api.ts:12-25`;
* trace access uses conflicting notions of trace/run identifier (`features/trace/api.ts:20-42` vs. observability calls);
* `features/run-replay/useRunReplay.ts:7-11` requests `.../runs/:id/events` without `/api`, unlike the rest of the client.

**OH-GUI recommendation:** retain the *shape*, not all donor files:

* one Vite environment module using `import.meta.env.VITE_*`;
* one HTTP client that points only to Python middleware;
* one typed endpoint/operation registry;
* Zod parsing at every external boundary, including stream messages;
* TanStack Query for server state and mutation invalidation.

Do not duplicate BFF clients. Do not expose the donor’s server-side token pass-through or any plugin secrets in a browser bundle.

### State management

The donor correctly uses:

* **TanStack Query** for remote/cacheable data;
* **Zustand** for short-lived UI state and per-feature interaction state;
* **Socket.IO** and polling for live updates.

The stores are small and generally portable. `src/lib/state/ui-store.ts:34-40,91-92` is representative: tab/inspector flags and a `pendingApprovalBanner: boolean`; `src/features/run-detail/store.ts:5-22,69-86` retains a bounded/deduplicated live event list.

The important limitation is semantic: approval is represented only as booleans, not as a pending authorization object. A boolean cannot preserve action identity, capability, affected resource, expiry, evidence, provenance, policy, decision reason, or audit record. Do **not** transplant this data model into OH-GUI.

`src/lib/streaming/useRunStream.ts:32-47,94-103` normalizes loosely and dispatches raw event names including `approval_required`/`pending_approval`. It is useful as a lifecycle-hook pattern, but it does not Zod-parse inbound messages, and it can create a socket per hook invocation (`:85-88`). For a security surface, protocol validation and a single connection owner are required.

### Styling approach

This is **not Tailwind**. `src/styles/legacy-globals.css:387-391` says so explicitly; it manually recreates a Tailwind-looking utility subset. Styling is a mixture of:

* CSS Modules for core and domain components;
* global tokens in `src/styles/tokens.css`;
* a large legacy global stylesheet used by settings/metrics/secrets/MCP/agent/plugin surfaces;
* scattered inline style objects.

`src/styles/globals.css:1-2` imports tokens and legacy globals. It also supplies reset, body, focus, reduced-motion, and scrollbar rules (`:4-70`).

**Portability:** ordinary CSS modules and CSS custom properties are Vite-native. The legacy utility sheet is portable in the narrow technical sense, but not desirable to carry forward because it creates a second, untyped styling system. Extract the token reset and selected core CSS modules; leave legacy globals behind.

### Next-specific versus portable

| Concern | Evidence | OH-GUI verdict |
|---|---|---|
| App Router/pages/layouts/errors | `src/app/**` | **Leave.** Replace routes and error boundaries for Vite. |
| Next API gateway | `src/app/api/**/route.ts` | **Leave.** Python middleware owns proxying, credentials, policy, audit, and mutation authorization. |
| `NEXT_PUBLIC_*` config | widespread feature APIs; `lib/feature-flags/index.ts:32-83` | **Port as pattern.** Replace with typed `import.meta.env.VITE_*`; no runtime secret. |
| React Query/query keys | `lib/query/**` | **Port as code**, removing the server/browser singleton branch. |
| Zod schemas | `lib/schemas/**` | **Port as code selectively**, but redesign authorization/telemetry schemas. |
| Zustand UI stores | `lib/state/**`, feature stores | **Port as code/pattern**, after replacing approval booleans with explicit objects. |
| Socket stream hook | `lib/streaming/**` | **Port as pattern.** Introduce schema-validated event envelopes and a single local connection manager. |
| Formatting/error/result utilities | `lib/format/**`, `lib/api/errors.ts`, `lib/api/result.ts` | **Port as code** after path/environment cleanup. |
| Node crypto plugin bridge | `lib/plugins/bridge.ts` | **Leave from browser.** This belongs, if needed, in Python middleware. |

---

## 2. Design system: useful core, incomplete system

### Tokens and theming

`src/styles/tokens.css` is a concise, dark-first token file:

* background layers: `:2-11`;
* borders: `:14-17`;
* text: `:20-27`;
* accent and semantic color families: `:30-40`;
* terminal/diff colors;
* typography: `:53-57`;
* 4px spacing scale: `:60-70`;
* radii/layout/motion: `:73-90`;
* aliases: `:92-100`.

This is extractable and is the cleanest visual donor artifact. It already matches a dark, technical operations surface reasonably well.

But it is not a finished theme system:

* only dark `:root` values exist;
* downstream components reference undefined names such as `--color-accent-emphasis`, `--color-text-on-accent`, `--font-size-caption`, and several `--text-*` variables;
* `src/components/settings/AppearanceSection.tsx:29-34` mutates `--color-primary` and `--text-base`, which do not match the main token names;
* its theme radio buttons merely update settings; no light/system CSS selector or token swap is supplied.

The donor appearance UI is therefore not reliable evidence that its theming works. Port the token *intent* and audit all variable references before reuse. For OH-GUI’s current dark-first scope, remove nonfunctional light/system UI until theme layers truly exist.

### Shared primitives

The core directory is mostly React + CSS Modules with no Next imports. The best reusable subset is:

* `components/core/Button.tsx:4-40` — `forwardRef`, variant/size handling, loading disables;
* `Badge.tsx:4-32` — compact status presentation;
* `Banner.tsx:4-28`;
* `Input`, `Panel`, `Skeleton`, and one `Table`;
* `Tabs` as a visual baseline.

These are technically portable. They need a token repair pass first.

Do **not** port every primitive blindly:

* there are duplicate table implementations: `components/core/Table.tsx` and `components/core/Table/Table.tsx`;
* `Tabs` lacks arrow-key tablist behavior, and its type does not match a story that passes a `badge`;
* `Modal` and `Drawer` support escape/backdrop gestures but lack focus trapping and focus restoration; Drawer uses `role="complementary"` rather than an appropriate dialog role;
* the modal title id is fixed rather than unique.

For approval, emergency stop, and other consequential actions, do not use the donor modal unchanged. Rebuild the accessible dialog once, then use it consistently.

### Extractability assessment

| Design-system area | Verdict | Reason |
|---|---|---|
| `styles/tokens.css` | **Port as code, repaired** | Small, framework-neutral, but normalize undefined aliases and remove pretend themes. |
| Global reset/focus/reduced-motion | **Port as code** | `globals.css:4-70` is broadly sound. |
| CSS-module core subset | **Port as code, selectively** | React/CSS only; retain one implementation per primitive. |
| Modal/Drawer | **Port as pattern** | Interaction idea is useful; current accessibility is insufficient for authorization UI. |
| `legacy-globals.css` | **Leave** | Duplicate global/utility system, conflicts with the cleaner token/CSS-module approach. |
| Appearance settings | **Leave/rebuild** | Settings write variables that main tokens do not consume. |

---

## 3. Authorization, approval, and security review

### Bottom line

Forge-OH has a **run-level HIL approval affordance**, not a complete authorization model. It can pause a run and call `POST /runs/:runId/approve` or `/reject`; it has no approval-request identifier, action-specific scope, capability manifest, auditable decision record, provenance model, budget evidence, expiry, policy version, or emergency-stop confirmation/audit.

That makes it a poor code donor for the OH-GUI authorization slice, but a useful negative/structural reference.

### `ApprovalBanner.tsx`: detailed read

`src/components/domain/ApprovalBanner.tsx:5-10` accepts only:

```ts
context?: string
onApprove: () => void
onReject: () => void
loading?: boolean
```

The entire visual behavior is a warning alert with a hard-coded heading, optional plain context string, and Approve/Reject buttons (`:14-40`). It uses `role="alert"` plus `aria-live="assertive"` (`:14`) and labels its controls accessibly.

What works:

* clear binary decision controls;
* busy-state disabling;
* direct keyboard-accessible buttons;
* tests cover render, callbacks, loading, and optional context in `tests/unit/domain-ApprovalBanner.test.tsx:12-55`.

What is missing for OH-GUI:

* no `approvalId` or idempotency key;
* no action/tool/capability/resource identity;
* no structured diff/command/arguments preview;
* no risk rationale or rule that produced the risk;
* no provenance/retrieval/untrusted-content source;
* no budget pre-check or model/context consequence;
* no policy/manifest match;
* no expiry or stale-decision protection;
* no “approve once / for this capability / for this run” choice;
* no reject reason;
* no audit outcome confirmation;
* no distinction between a safety alert and a routine UI announcement.

**Port verdict:** **port as pattern only.** Keep the visual hierarchy of “paused, evidence, decision controls,” but replace the props and state model entirely.

### How approval actually flows

The run detail page turns approval into a generic run condition:

* it recognizes stream approval events in `src/app/(dashboard)/runs/[runId]/page.tsx:142-166`;
* `handleApprovalRequest` sets only a boolean (`:164-166`);
* it renders `ApprovalBanner` when the run status is `awaiting_approval` (`:290-306`);
* the supplied context is hard-coded to “agent paused on a risk-flagged action,” not an action record;
* it separately exposes approve/reject controls in `components/domain/RunDetailHeader.tsx:42-45,77-96`.

This produces two approval entry points with the same run-wide semantics. `src/features/runs/api.ts:40-66` and `hooks.ts:54-99` issue lifecycle mutations and invalidate queries, but accept no action/approval id. The HIL E2E test proves only that each button posts to `/approve` or `/reject` (`tests/e2e/hitl-approval.spec.ts:284-290,411-458`), not that it approves the intended operation or produces an audit record.

For OH-GUI, one authorization card should own the decision and target a specific immutable request. The page/header can show a compact status entry that opens that card; it should not create a second uncontrolled decision button.

### `features/security/*`

`src/features/security/RiskBadge.tsx` is the only security feature file. It maps:

* `LOW` → success;
* `MEDIUM` → warning;
* `HIGH` → error (`:16-26`);
* `UNKNOWN`/missing → no badge at all (`:33-47`).

It is a presentational chip, not a security boundary. The deliberate omission of unknown/missing risk is a poor fail-safe stance for an authorization UI. Its tests explicitly preserve that behavior (`tests/unit/RiskBadge.test.tsx:29-42`), and the E2E test expects unknown/missing actions to have no badge (`tests/e2e/risk-badge.spec.ts:5-8,129-151`).

The run page’s “Auto-collapse low-risk actions” behavior is more concerning: the documented/tested behavior hides **UNKNOWN or absent** risk values while retaining LOW/MEDIUM/HIGH (`runs/[runId]/page.tsx:203-212`; `risk-badge.spec.ts:156-179`). The label and behavior disagree; neither is appropriate as a trust control.

**Port verdict:** **port as a visual pattern only.** OH-GUI needs both risk and certainty/provenance states:

* unknown/unclassified must remain visible and be conservative;
* “low risk” is not the same as “trusted”;
* a badge must link to the reason/evidence and capability policy;
* provenance must be a separate state from action risk.

### Existing related control patterns

**Run creation approval toggle.** `components/domain/NewRunComposer.tsx:31-32,42-52,199-217` puts a feature-flagged `requireApproval` checkbox into a run form (“before each tool call”). It has a heuristic context-length estimate (`:21-25,117-135`) but no cost/budget preflight. This is only a coarse policy preference, not an approval plan.

**Emergency stop.** `components/domain/RunDetailHeader.tsx:107-116` exposes a stop action directly. It lacks a confirmation step, stop scope/outcome details, local emergency-stop audit record, or UI representation of what was interrupted. `RestartFromHereButton` has a more useful confirmation-copy pattern (`:138-150`): use that interaction *idea* for OH-GUI’s emergency stop, but build a separate high-assurance stop card.

**Model switching.** `components/domain/RunModelSwitchModal.tsx:20-33` explicitly states a useful boundary: model routing should be preset-only and credentials should stay server-side. Its structured status/error handling (`:178-222`) and tests for 404/422/503 (`tests/unit/domain-RunModelSwitchModal.test.tsx:142-224`) are good patterns for any privileged local operation.

**Secrets.** `src/lib/schemas/secret.ts:3-10` establishes a correct principle: raw secret values are not read-side data. `RunSecretsModal` uses write-only input (`components/domain/RunSecretsModal.tsx:20-24,65-79`). This is worth retaining as a security display convention.

**Direct bash.** `features/terminal` and `LiveBashPanel` allow arbitrary run command execution; the unit test demonstrates start plus SSE streamed output (`tests/unit/LiveBashPanel.test.tsx:55-118`). This must be **left behind as code**. If OH-GUI offers terminal intervention, it must run through the capability manifest, policy evaluation, budget/timeout controls, provenance marking, and audit pipeline.

**Plugin bridge.** `lib/plugins/bridge.ts` uses Node crypto and defines events including `APPROVAL_REQUIRED`. It cannot belong in a Vite client. Treat it as a Python-side transport/policy concern, not a frontend donor.

### Required OH-GUI authorization model

Use Forge-OH’s banner/card hierarchy only after establishing a different contract. The pending object needs at least:

```ts
type AuthorizationRequest = {
  id: string
  runId: string
  createdAt: string
  expiresAt?: string
  action: { kind: string; display: string; target?: string; argumentSummary: string }
  capability: { id: string; display: string; manifestVersion: string; policyDecision: "ask" | "deny" }
  risk: { level: "low" | "medium" | "high" | "critical" | "unknown"; reasons: string[] }
  provenance: { trust: "trusted" | "untrusted" | "mixed" | "unknown"; sources: SourceRef[] }
  budget: { allowed: boolean; estimate?: BudgetEstimate; reason?: string }
  diagnostics: Diagnostic[]
  decisionOptions: ("approve_once" | "reject" | "stop_run")[]
}
```

The Python middleware must:

1. generate and persist the request before the action runs;
2. enforce capability/policy/budget checks independently of the UI;
3. require `id` plus an idempotency/version value when a decision is posted;
4. write an immutable audit event with the decision, timestamp, rationale, evidence summary, and resulting executor state;
5. reject stale, already-resolved, or mismatched requests.

The Vite UI then consumes that record. It never becomes the authority.

### Vibe and Pro lenses

There is no donor implementation of two semantic zoom levels. Build the same `AuthorizationRequest` into two presenters:

| Lens | Show by default | Progressive detail |
|---|---|---|
| **Vibe** | clear recommendation, action sentence, trust/risk color, estimated impact, Approve once / Reject / Stop | “Why?” drawer: source, capability, concise evidence, budget. |
| **Pro** | all Vibe fields plus canonical capability id, manifest/policy version, arguments/diff, provenance chain, budget/telemetry snapshot, diagnostics, expiry, audit-event id | raw structured payload, event timeline, rules that matched, exact command/tool-call transcript. |

The lenses must share request id, decision endpoint, audit event, and state reducer. Do not create a separate “Vibe authorization mechanism.”

---

## 4. Runs, metrics, telemetry, and observability

### GPU telemetry: best concrete donor

`components/navigation/GpuStrip.tsx` is the strongest implementation candidate for the requested telemetry strip:

* documented 2-second polling/top-bar role at `:4-17`;
* typed GPU snapshot at `:25-50`;
* warning thresholds at `:54-58`;
* polling at `:139-168`;
* graceful “unavailable” presentation at `:176-187`;
* chip classification and clickable detail UI at `:189-310`.

`GpuChipPopover.tsx` adds a 300-second, two-second-refresh history with temperature/utilization/VRAM/power metrics (`:4-15,31-40,102-157`) and has escape/outside-click handling (`:160-179`). It uses Recharts for the history view.

**Port verdict:** **port as code after API adapter/env rewrite.** It is React/CSS/Recharts only and aligns directly with OH-GUI’s local RTX 5090 focus. Rework the BFF calls to the Python middleware and separate telemetry polling from display. Preserve its “telemetry unavailable” state.

It does **not** provide the other requested fields:

* no tok/s;
* no context pressure;
* no current model/run attribution;
* no authorization-budget correlation.

OH-GUI should use one compact telemetry-strip model:

```ts
{ tokPerSec, vramUsedMiB, vramTotalMiB, vramPressure,
  contextTokens, contextLimit, contextPressure,
  gpuUtilization, gpuTemperature, activeRunId, updatedAt }
```

and surface the frozen snapshot inside every approval/emergency-stop/audit event.

### Metrics UI

`features/metrics/MetricsDashboardPage.tsx:37-55` renders four summary cards; `:57-77` explicitly contains a “Chart.js renders here” placeholder, not a chart. `:79-127` renders simple model/workspace tables. `KpiCard.tsx:4-59` is a small portable display component with a sparkline shape.

Metrics schema coverage is narrow: `lib/schemas/metric.ts:20-27` covers token count, tool calls, files touched, cost, duration, and series. The per-run metrics tab (`runs/[runId]/tabs/MetricsTab.tsx:43-79`) shows stat cards, verification iterations, and merely the count of series points. It has no general real-time chart.

**Verdict:** **port as pattern.** The KPI layout is useful; the dashboard is incomplete and should not set OH-GUI’s telemetry contract.

### Observability and trace UI

The observability route is a master/detail run list and trace panel:

* span table shows input/output token fields (`app/(dashboard)/observability/page.tsx:38-77`);
* detail loads a trace and spans (`:80-107`);
* the selected *run* id is passed to `useTrace` as though it is a trace id (`:130-188`).

This appears to be a real contract ambiguity, because trace fetching paths use both a run-oriented route and a trace-oriented route. `features/trace/api.ts:5-18` includes normalization aliases for legacy fields; `:20-42` treats its parameter differently from observability code. The run trace tab also filters roots by `parentId` while the canonical schema uses `parentSpanId`, risking an empty/mis-rooted tree.

`components/domain/SpanRow.tsx:57-139` is useful as a trace-waterfall presentation pattern. Its verification widgets are not stuck-loop detection:

* `VerifyIterationsWidget.tsx:24-79` derives highest verification iteration and last verdict;
* `VerifyStepCard.tsx:41-148` shows runner command, exit code, files, and logs.

Use their structured-card technique for a **stuck-loop intervention card**, but do not mislabel test verification iteration as loop detection. OH-GUI needs explicit loop signals: repeated tool signature, repeated failure hash, no state-progress interval, token/budget burn rate, and intervention choices.

**Verdict:** **port as pattern.** Keep trace/drill-down and structured diagnostic cards; rebuild against a clean run/trace identifier contract and local event schema.

### Requested missing authorization-adjacent surfaces

| OH-GUI need | Forge-OH evidence | Donor verdict |
|---|---|---|
| Trust dial | No trust model; risk badge only | **Leave/rebuild.** |
| Approval/authorization card | Banner has only generic string and callbacks | **Pattern only.** |
| Audit log | Event timeline/raw event payload but no decision audit | **Pattern only** (event/timeline structure). |
| Capability manifest | Plugin schemas use arbitrary capabilities; no enforceable UI manifest | **Leave/rebuild.** |
| Emergency stop | Direct header stop with no confirmation/audit | **Pattern only** from restart confirmation. |
| Untrusted-content provenance badges | Absent | **Leave/rebuild.** |
| Stuck-loop intervention | Verify iteration is not loop detection | **Pattern only** from Verify cards. |
| Budget pre-check | Composer gives context-length heuristic only | **Leave/rebuild.** |
| Malformed-tool-call diagnostic | Absent | **Leave/rebuild.** |
| Telemetry strip | GPU strip/popover | **Port as code** after adapter rewrite. |

---

## 5. Test strategy and port survivability

### What exists

The inventory contains **130** test files: **88 unit**, **5 integration**, and **37 E2E**.

* `vitest.config.ts:5-32` uses the Vite React plugin, jsdom, MSW setup, and excludes App pages/layouts from coverage.
* `src/tests/setup.ts:1-7` starts MSW with `onUnhandledRequest: "error"` and resets/closes it reliably.
* `playwright.config.ts:3-32` uses Chromium, a local server at port 3000, one worker, and no CI-specific parallelism.

This is a sensible local-first toolchain. The Vite React Vitest setup itself is already close to OH-GUI.

### Strengths

* Store tests are fast and hermetic. `tests/unit/feature-stores.test.ts:4-12` documents the state-machine intent and exercises 14 feature stores.
* Core interactive components receive basic behavior/accessibility coverage.
* MSW tests use explicit route fixtures and test selected errors, e.g. model-switch 404/422/503 (`domain-RunModelSwitchModal.test.tsx:142-224`).
* E2E HIL tests intercept approve/reject and prove the HTTP method (`hitl-approval.spec.ts:411-458`).
* GPU E2E tests cover the real telemetry surface and popover. They are operationally heavy but locally oriented.
* `run-fork-from-here.spec.ts:267-397` demonstrates an excellent regression-test habit: capture exact request body and assert the canonical wire field, including negative aliases.

### Gaps and misleading confidence

* The approval tests prove button presence and a **run-level** POST only. They do not test action identity, policy/capability enforcement, stale/replayed decision rejection, decision audit creation, risk evidence, provenance, or budget denial.
* The risk tests encode hiding `UNKNOWN`/absent risk and then call the behavior auto-collapse. That is a security-UX regression encoded as expected behavior.
* The integration test’s “401 when no auth header” is an MSW handler override, not a verified application authorization path (`run-detail-flow.test.ts:85-96`).
* Many E2E suites skip when no run/BFF is available and several only assert “no application error.” This is valid smoke coverage, not strong behavior coverage.
* GPU screenshot tests contain optional `git add/commit/push` logic (`gpu-popover.spec.ts:71-103`, `gpu-strip.spec.ts:127-167`). This is inappropriate for OH-GUI’s test suite; keep screenshot assertions but remove repository mutation.
* Some tests contain Next-specific mocks, e.g. `RunCard.test.tsx:6-9` mocks `next/link`; those should disappear after routing is replaced.
* `replay-useRunReplay.test.ts:20-40` accepts both malformed and canonical endpoint paths, which masks the source endpoint mismatch.
* Unit tests verify the trace store’s wildcard expansion representation (`feature-stores.test.ts:266-271`), but the rendering code checks individual ids. The test does not detect whether “Expand all” works.

### Porting tests

| Test class | OH-GUI verdict | Work needed |
|---|---|---|
| Vitest + Testing Library + MSW foundation | **Port as code** | Keep tools/config, change aliases/env/base URL. |
| Pure format/schema/store tests | **Port as code** | Rewrite schemas/stores for the new authorization event model. |
| Core primitive tests | **Port as code selectively** | Retain after component accessibility repair. |
| Next routing/page tests | **Port as pattern** | Re-express against Vite route shell; remove Next mocks/announcer assumptions. |
| GPU strip/popover tests | **Port as code/pattern** | Use Python telemetry fixtures; remove build/start/git side effects. |
| HIL approval E2E | **Port as pattern only** | Add request id, evidence, expiry, idempotency, audit and denial cases. |
| Run-control fork/restart tests | **Port as pattern** | Keep exact-payload assertions and destructive-action confirmation checks. |
| Live Bash test | **Leave as functional scope** | If terminal intervention exists, test policy gate and audit first, not unrestricted execution. |

### Authorization test minimum for OH-GUI

Before calling the authorization slice complete, add tests for:

1. a requested action renders the same `authorizationRequest.id` in Vibe and Pro;
2. only the matching pending request can be decided;
3. a stale/resolved/replayed decision is rejected by Python middleware;
4. deny/stop is enforced even if a caller bypasses the UI;
5. each decision produces exactly one immutable audit event;
6. unknown/untrusted provenance is visible and cannot be silently collapsed;
7. capability manifest/policy mismatch denies before executor invocation;
8. budget pre-check prevents action and records its estimate/reason;
9. malformed tool-call diagnostic displays a redacted payload plus repair/stop options;
10. telemetry snapshot is recorded at approval/denial/stop time;
11. Vibe and Pro take the same mutation with the same result.

---

## 6. Per-area donor verdicts

| Area | Verdict | Concrete disposition |
|---|---|---|
| Next App Router, layouts, pages, route handlers, middleware | **Leave** | `src/app/**`, `middleware.ts`; OH-GUI has a different runtime and middleware boundary. |
| Generic fetch/error/result utilities | **Port as code** | Start from `lib/api/client.ts`, `errors.ts`, `result.ts`; collapse duplicate clients and use Vite env. |
| Endpoint registry | **Port as pattern** | `lib/api/endpoints.ts`; regenerate against Python middleware contract rather than copying donor paths. |
| TanStack Query client/keys | **Port as code** | Remove server/browser singleton branch from `lib/query/client.ts`. |
| Zod schemas | **Port as code selectively** | Retain run/event/trace ideas; redesign auth, provenance, diagnostics, budget, and telemetry. |
| Feature flags | **Port as pattern** | `lib/feature-flags`; migrate `NEXT_PUBLIC_*` to typed Vite config and avoid client-side security flags. |
| Zustand stores | **Port as code/pattern** | Retain small UI-state approach; replace `pendingApprovalBanner` boolean with structured authorization state. |
| Socket protocol/hooks | **Port as pattern** | Keep lifecycle concept; use a single validated connection and explicit event envelope. |
| Tokens/reset | **Port as code, repaired** | `styles/tokens.css`, selective `globals.css`; fix aliases and support only real themes. |
| Core Button/Badge/Banner/Input/Panel/Skeleton/Table | **Port as code selectively** | CSS-module React primitives; deduplicate and repair accessibility. |
| Modal/Drawer/Tabs | **Port as pattern** | Rebuild dialog/focus/tab keyboard behavior before using for consequential controls. |
| Legacy global CSS utilities | **Leave** | `styles/legacy-globals.css`; do not transfer a second styling system. |
| `ApprovalBanner` and risk badge | **Port as pattern** | Retain visual urgency/action framing only; no code/data-contract reuse. |
| Run header controls | **Port as pattern** | One controlled authorization surface; emergency stop must be confirmed/audited. |
| Model switching/secrets UI | **Port as pattern** | Keep server-side-secret and preset-only boundary; reuse error-card/error-contract discipline. |
| Live Bash/terminal execution | **Leave** | Never bring unrestricted run command dispatch into authorization slice. |
| GPU strip/popover | **Port as code after adapter rewrite** | Strong local telemetry component; expand to tok/s/context pressure and snapshot decisions. |
| Metrics dashboard/KPI cards | **Port as pattern** | KPI layout is useful; dashboard/chart implementation is incomplete. |
| Trace/observability/verify cards | **Port as pattern** | Rebuild identifier contract; adapt card structure for diagnostics and loop intervention. |
| Run replay | **Port as pattern** | Event-replay affordance is useful, but fix endpoint/schema and treat it as audit viewing. |
| Vitest/MSW unit foundation | **Port as code** | Keep local toolchain, providers, and fixtures; update environment and contracts. |
| Playwright E2E scenarios | **Port as pattern** | Preserve exact-wire and destructive-action tests; eliminate Next and auto-git behaviors. |

## Recommended take

The immediate OH-GUI authorization slice should borrow three things from Forge-OH:

1. **Visual language:** dark token direction, compact status chips, cards, and a persistent GPU strip.
2. **State layering:** Query for remote state, small Zustand stores for UI state, Zod at protocol boundaries.
3. **Testing habits:** MSW route fixtures, exact mutation-body assertions, destructive-action confirmation tests.

It should *not* borrow Forge-OH’s approval semantics. Implement authorization as a Python-enforced, event-sourced request/decision/audit contract, then present that contract in Vibe and Pro components. Treat the donor approval banner, risk badge, direct stop, and live bash surfaces as evidence of what a minimal operational UI looks like—not as security controls ready to port.
