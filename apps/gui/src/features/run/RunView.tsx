import { useState } from 'react';
import AuthorizationCard from '../authorization/AuthorizationCard';
import {
  DEFAULT_STOP,
  TRUST_STOPS,
  type TrustStopId,
} from '../first-run/trust-dial';
import { useConversation } from './useConversation';
import EventLog from './EventLog';
import ModelProfilePanel from '../model-profiles/ModelProfilePanel';

/**
 * The run surface is a view of durable server objects, not a chat transcript. Event narration is
 * append-only; execution status and event objects come from the pinned Agent Server on each poll.
 */
export default function RunView({ isReadOnlyViewport = false }: { isReadOnlyViewport?: boolean }) {
  const [goal, setGoal] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [trustStop, setTrustStop] = useState<TrustStopId>(DEFAULT_STOP);
  const run = useConversation();
  const canStart = !isReadOnlyViewport && !run.isStarting && run.conversationId === null;
  // Steering is available whenever a conversation exists, including while it is
  // waiting for confirmation or paused: the operator's most useful correction is
  // usually the one made before approving the action they dislike.
  const canSendFollowUp =
    !isReadOnlyViewport && run.conversationId !== null && !run.isSending && followUp.trim() !== '';

  const onTrustStopChange = (nextStop: TrustStopId) => {
    setTrustStop(nextStop);
    if (run.conversationId !== null) void run.setTrustStop(nextStop);
  };

  return (
    <main className="mx-auto grid min-h-screen max-w-6xl gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.8fr)]">
      <section className="rounded-lg border border-slate-700 bg-night-900 p-5">
        <header>
          <p className="text-sm font-semibold uppercase tracking-wide text-agent-active">Local run</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Agent Server workspace</h1>
          <p className="mt-2 text-sm text-slate-400">
            Start one local conversation in the configured workspace. The event log below is
            narration; server state remains authoritative.
          </p>
        </header>

        <form
          className="mt-6 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void run.start(goal, trustStop);
          }}
        >
          <label className="block text-sm font-medium" htmlFor="run-goal">
            Goal
          </label>
          <textarea
            id="run-goal"
            className="min-h-28 w-full rounded border border-slate-600 bg-night-950 p-3 text-sm outline-none focus:border-agent-active"
            value={goal}
            onChange={(event) => setGoal(event.target.value)}
            disabled={!canStart}
            placeholder="Describe the task for the local agent."
          />
          <label className="block text-sm font-medium" htmlFor="trust-dial">
            Trust dial
          </label>
          <select
            id="trust-dial"
            className="w-full rounded border border-slate-600 bg-night-950 p-3 text-sm outline-none focus:border-agent-active"
            value={trustStop}
            onChange={(event) => onTrustStopChange(event.target.value as TrustStopId)}
            aria-describedby="trust-dial-description"
            disabled={isReadOnlyViewport || run.isStarting}
          >
            {TRUST_STOPS.map((stop) => (
              <option key={stop.id} value={stop.id}>
                {stop.label}
              </option>
            ))}
          </select>
          <p id="trust-dial-description" className="text-sm text-slate-400">
            This applies the matching native confirmation policy now when a run is active, or when
            the next run starts.
          </p>
          <button
            type="submit"
            className="rounded bg-agent-active px-4 py-2 text-sm font-semibold text-night-950 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canStart}
          >
            {run.isStarting ? 'Starting…' : 'Start'}
          </button>
        </form>

        {run.conversationId !== null && (
          <form
            className="mt-6 space-y-3 border-t border-slate-700 pt-6"
            aria-label="Steer the run"
            onSubmit={(event) => {
              event.preventDefault();
              void run.send(followUp).then(() => setFollowUp(''));
            }}
          >
            <label className="block text-sm font-medium" htmlFor="run-follow-up">
              Follow-up instruction
            </label>
            <textarea
              id="run-follow-up"
              className="min-h-20 w-full rounded border border-slate-600 bg-night-950 p-3 text-sm outline-none focus:border-agent-active"
              value={followUp}
              onChange={(event) => setFollowUp(event.target.value)}
              disabled={isReadOnlyViewport || run.isSending}
              placeholder="Correct or extend the task without restarting the run."
              aria-describedby="run-follow-up-description"
            />
            <p id="run-follow-up-description" className="text-sm text-slate-400">
              This resumes the agent loop with your message appended to the same conversation.
            </p>
            <button
              type="submit"
              className="rounded border border-agent-active px-4 py-2 text-sm font-semibold text-agent-active disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!canSendFollowUp}
            >
              {run.isSending ? 'Sending…' : 'Send follow-up'}
            </button>
          </form>
        )}

        {run.status === 'waiting_for_confirmation' && (
          <section className="mt-6 space-y-4" aria-label="Pending authorization">
            <header>
              <h2 className="text-lg font-semibold">Pending authorization</h2>
              <p className="mt-1 text-sm text-slate-400">
                These executable action objects are pending server confirmation; the event log is
                only narration.
              </p>
            </header>
            {run.pendingActions.length === 0 ? (
              <p className="rounded border border-amber-600 bg-amber-950/40 p-3 text-sm text-amber-100">
                The server is waiting for confirmation, but its pending action has not arrived in
                the current event poll yet.
              </p>
            ) : (
              run.pendingActions.map((action, index) => (
                <AuthorizationCard
                  key={`${action.toolName}-${index}`}
                  action={action}
                  onApprove={() => void run.approve()}
                  onReject={(reason) => void run.reject(reason)}
                />
              ))
            )}
          </section>
        )}

        {run.error !== null && (
          <p className="mt-4 rounded border border-rose-700 bg-rose-950/40 p-3 text-sm text-rose-100" role="alert">
            {run.error}
          </p>
        )}
      </section>

      <aside className="rounded-lg border border-slate-700 bg-night-900 p-5" aria-label="Run status">
        <h2 className="text-lg font-semibold">Run status</h2>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-slate-400">State</dt>
            <dd className="mt-1 font-mono text-slate-100">
              {run.status ?? 'unavailable'}
            </dd>
          </div>
          <div>
            <dt className="text-slate-400">Event count</dt>
            <dd className="mt-1 font-mono text-slate-100">
              {run.eventCount ?? 'unavailable'}
            </dd>
          </div>
          <div>
            <dt className="text-slate-400">Elapsed</dt>
            <dd className="mt-1 font-mono text-slate-100">{run.elapsedSeconds}s</dd>
          </div>
          <div>
            <dt className="text-slate-400">Conversation</dt>
            <dd className="mt-1 truncate font-mono text-xs text-slate-100">
              {run.conversationId ?? 'unavailable'}
            </dd>
          </div>
        </dl>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            className="rounded border border-slate-500 px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => void run.pause()}
            disabled={isReadOnlyViewport || run.conversationId === null}
          >
            Pause
          </button>
          <button
            type="button"
            className="rounded border border-rose-700 px-4 py-2 text-sm text-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => void run.stop()}
            disabled={isReadOnlyViewport || run.conversationId === null}
          >
            Stop
          </button>
        </div>
        <ModelProfilePanel
          sdkNative={run.nativeModelProfile}
          events={run.events}
          isReadOnlyViewport={isReadOnlyViewport}
        />
      </aside>

      <section className="overflow-hidden rounded-lg border border-slate-700 bg-night-900 lg:col-span-2">
        <header className="border-b border-slate-700 px-5 py-4">
          <h2 className="text-lg font-semibold">Events</h2>
          <p className="mt-1 text-sm text-slate-400">
            Polled every 3 seconds from the append-only event object store.
          </p>
        </header>
        <div className="max-h-[50vh] overflow-y-auto">
          <EventLog events={run.events} />
        </div>
      </section>
    </main>
  );
}
