import { useState } from 'react';
import { useConversation } from './useConversation';

function EventList({ events }: { events: ReturnType<typeof useConversation>['events'] }) {
  if (events.length === 0) {
    return <p className="p-4 text-sm text-slate-400">No events have been returned yet.</p>;
  }

  return (
    <ol className="divide-y divide-slate-800">
      {events.map((event, index) => (
        <li key={event.id ?? String(index)} className="p-3">
          <pre className="overflow-x-auto whitespace-pre-wrap break-words text-xs text-slate-200">
            {JSON.stringify(event, null, 2)}
          </pre>
        </li>
      ))}
    </ol>
  );
}

/**
 * The run surface is a view of durable server objects, not a chat transcript. Event narration is
 * append-only; execution status and event objects come from the pinned Agent Server on each poll.
 */
export default function RunView() {
  const [goal, setGoal] = useState('');
  const run = useConversation();
  const canStart = !run.isStarting && run.conversationId === null;

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
            void run.start(goal);
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
          <button
            type="submit"
            className="rounded bg-agent-active px-4 py-2 text-sm font-semibold text-night-950 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canStart}
          >
            {run.isStarting ? 'Starting…' : 'Start'}
          </button>
        </form>

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
            disabled={run.conversationId === null}
          >
            Pause
          </button>
          <button
            type="button"
            className="rounded border border-rose-700 px-4 py-2 text-sm text-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => void run.stop()}
            disabled={run.conversationId === null}
          >
            Stop
          </button>
        </div>
      </aside>

      <section className="overflow-hidden rounded-lg border border-slate-700 bg-night-900 lg:col-span-2">
        <header className="border-b border-slate-700 px-5 py-4">
          <h2 className="text-lg font-semibold">Events</h2>
          <p className="mt-1 text-sm text-slate-400">
            Polled every 3 seconds from the append-only event object store.
          </p>
        </header>
        <div className="max-h-[50vh] overflow-y-auto">
          <EventList events={run.events} />
        </div>
      </section>
    </main>
  );
}
