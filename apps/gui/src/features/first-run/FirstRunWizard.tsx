import { useState } from 'react';

import { clampStep } from './wizard-nav';
import {
  DEFAULT_CONFIRM_RISKY,
  DEFAULT_STOP,
  TRUST_STOPS,
  outcomeLabel,
  shouldConfirm,
  type ActionContext,
} from './trust-dial';

/**
 * First-run wizard. docs/specs/03-layout.md section 3.4.
 * Steps 2 and 7 were removed by ADR-003, so the spec's items 1, 3, 4, 5, 6 are the five steps here.
 *
 * Phase 0 ships copy and shell. There is no middleware, so nothing here executes an agent action.
 */

const CARD = 'rounded-lg border border-slate-600 bg-night-900 p-4';
const NOTE = 'text-sm text-slate-400';

function Deferred({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 rounded border border-dashed border-slate-500 p-3 text-sm text-slate-300">
      <span className="font-semibold text-slate-200">Not active yet. </span>
      {children}
    </p>
  );
}

function StepConnect() {
  return (
    <section>
      <h2 className="text-lg font-semibold">1. Connect a model</h2>
      <p className={NOTE}>
        Detected local backends will pre-populate from the model-profile scan.
      </p>
      <Deferred>
        Backend detection runs in the OH-GUI middleware, which is not built yet (Phase 1). This
        screen will not reach Ollama from your browser: the frontend talks only to the middleware
        (ADR-001 item 4), so detection cannot be faked here in the meantime.
      </Deferred>
    </section>
  );
}

const EXAMPLE_ACTIONS: readonly { label: string; action: ActionContext }[] = [
  { label: 'Read a file in the worktree', action: { risk: 'LOW' } },
  { label: 'Edit a file in the worktree', action: { risk: 'MEDIUM' } },
  { label: 'Write outside the worktree', action: { risk: 'LOW', writesOutsideWorktree: true } },
  { label: 'Delete a directory / run an unrecognised command', action: { risk: 'HIGH' } },
  { label: 'An action the analyzer cannot classify', action: { risk: 'UNKNOWN' } },
];

function StepWalkStops() {
  return (
    <section>
      <h2 className="text-lg font-semibold">2. What each trust-dial stop does</h2>
      <p className={NOTE}>
        Every cell below is computed by the same function the review UI will call. It is not a
        screenshot and not example copy: change the rule and this table changes with it.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">Trust-dial stop by example action</caption>
          <thead>
            <tr>
              <th scope="col" className="border border-slate-600 p-2 text-left">
                Example action
              </th>
              {TRUST_STOPS.map((s) => (
                <th
                  key={s.id}
                  scope="col"
                  className="border border-slate-600 p-2 text-left align-bottom text-xs uppercase tracking-wide"
                >
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {EXAMPLE_ACTIONS.map((ex) => (
              <tr key={ex.label}>
                <th scope="row" className="border border-slate-600 p-2 text-left font-normal">
                  {ex.label}
                  <span className="ml-2 whitespace-nowrap text-xs text-slate-400">risk: {ex.action.risk}</span>
                </th>
                {TRUST_STOPS.map((s) => {
                  const pauses = shouldConfirm(s.id, ex.action, DEFAULT_CONFIRM_RISKY);
                  return (
                    <td
                      key={s.id}
                      className="whitespace-nowrap border border-slate-600 p-2"
                      data-testid={`cell-${s.id}-${ex.action.risk}-${ex.action.writesOutsideWorktree ? 'out' : 'in'}`}
                    >
                      {outcomeLabel(pauses)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Deferred>
        Phase 0 shows the decision, not a running agent. Walking each stop against a real harmless
        action (spec 3.4 item 3) needs the middleware and lands in Phase 1.
      </Deferred>
    </section>
  );
}

function StepDefaultStop() {
  const def = TRUST_STOPS.find((s) => s.id === DEFAULT_STOP);
  if (!def) throw new Error('DEFAULT_STOP is not a known trust stop');
  const never = TRUST_STOPS.find((s) => s.id === 'never');
  return (
    <section>
      <h2 className="text-lg font-semibold">3. Your default: {def.label}</h2>
      <div className={CARD}>
        <p>
          You start on <strong>{def.label}</strong>, which maps to:
        </p>
        <p className="mt-2 overflow-x-auto">
          <code className="text-slate-200">{def.mapsTo}</code>
        </p>
        <p className="mt-2 text-sm">
          Why this and not stricter: pausing on every read makes supervision so noisy that people
          stop reading the prompts, which is worse than not having them. Why this and not looser:
          HIGH-risk and unclassifiable actions are exactly the ones you cannot undo by reading a
          diff afterwards.
        </p>
        <p className="mt-2 text-sm">
          Both knobs are yours to change and are shown in settings rather than hidden:{' '}
          <strong>threshold</strong> is {DEFAULT_CONFIRM_RISKY.threshold}, and{' '}
          <strong>confirm_unknown</strong> is{' '}
          {DEFAULT_CONFIRM_RISKY.confirmUnknown ? 'on' : 'off'}, meaning an action the analyzer
          cannot classify {DEFAULT_CONFIRM_RISKY.confirmUnknown ? 'pauses' : 'proceeds'}.
        </p>
      </div>
      <div className={`${CARD} mt-3`}>
        <p className="font-semibold">{never?.label} is opt-in only, and here is why</p>
        <p className="mt-1 text-sm">
          <code className="text-slate-300">NeverConfirm()</code> gives the agent full autonomy. No
          action pauses, including deletes and commands the analyzer could not classify. You would
          find out what happened by reading the audit log afterwards. It is never selected for you.
        </p>
      </div>
    </section>
  );
}

function StepCounter() {
  const [accepted] = useState(0);
  return (
    <section>
      <h2 className="text-lg font-semibold">4. Lines accepted without inspection</h2>
      <div className={CARD}>
        <p className="text-3xl font-semibold tabular-nums" data-testid="lines-accepted-counter">
          {accepted}
        </p>
        <p className="mt-2 text-sm">
          This counts lines you accepted without opening the diff. It is here so that number stays
          visible to you, not to grade you.
        </p>
      </div>
      <Deferred>
        The counter is seeded at zero and is in-memory for now. Persisting it per session
        (13-hard-constraints.md) needs a storage layer that arrives in Phase 1.
      </Deferred>
    </section>
  );
}

function StepPlanTree() {
  return (
    <section>
      <h2 className="text-lg font-semibold">5. How a plan will look</h2>
      <div className={CARD}>
        <p className="mb-2 inline-block rounded border border-slate-500 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-slate-300">
          Example
        </p>
        <ul className="ml-4 list-disc space-y-1 text-sm">
          <li>
            Add a health endpoint
            <ul className="ml-4 list-[circle] space-y-1">
              <li>Read the existing router module</li>
              <li>Add the route and a test</li>
              <li>
                Run the test suite
                <span className="ml-2 text-xs text-slate-400">pauses at your default stop</span>
              </li>
            </ul>
          </li>
        </ul>
        <p className="mt-3 text-sm text-slate-400">
          Illustration only. No plan has been generated and nothing here will run.
        </p>
      </div>
    </section>
  );
}

const STEPS = [
  { id: 'connect', node: <StepConnect /> },
  { id: 'stops', node: <StepWalkStops /> },
  { id: 'default', node: <StepDefaultStop /> },
  { id: 'counter', node: <StepCounter /> },
  { id: 'plan', node: <StepPlanTree /> },
] as const;

export const STEP_COUNT = STEPS.length;

export default function FirstRunWizard() {
  const [i, setI] = useState(0);
  const step = STEPS[i];
  if (!step) throw new Error(`step ${i} out of range`);
  const last = i === STEPS.length - 1;
  return (
    <div className="mx-auto max-w-4xl p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Set up OH-GUI</h1>
        <p className={NOTE} aria-live="polite">
          Step {i + 1} of {STEPS.length}
        </p>
      </header>
      {step.node}
      <nav className="mt-8 flex gap-3">
        <button
          type="button"
          className="rounded border border-slate-500 px-4 py-2 text-sm disabled:opacity-40"
          onClick={() => setI((n) => clampStep(n - 1, STEPS.length))}
          disabled={i === 0}
        >
          Back
        </button>
        <button
          type="button"
          className="rounded border border-slate-400 bg-slate-800 px-4 py-2 text-sm disabled:opacity-40"
          onClick={() => setI((n) => clampStep(n + 1, STEPS.length))}
          disabled={last}
        >
          Next
        </button>
      </nav>
    </div>
  );
}
