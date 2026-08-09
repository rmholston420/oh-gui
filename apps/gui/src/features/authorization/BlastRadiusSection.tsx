/**
 * Blast radius presentation (spec 04 §4.2, ADR-023 option B).
 *
 * The single hard rule this component exists to enforce: a value we *derived* and a value we are
 * merely *echoing* must never appear under the same heading or with the same affordance. ADR-023
 * decision 2b requires a test to fail if they ever do — see `BlastRadiusSection.test.tsx`.
 *
 * So derived targets are the only thing that ever carries `data-testid="blast-target"`, echoed
 * native fields are the only thing that ever carries `data-testid="native-reading"`, and the two
 * live under headings that make different claims. The four statuses each get their own heading
 * and their own border colour, because "nothing was found" and "nothing was computed" and "this
 * event does nothing" and "we do not recognise this" are four different sentences.
 */

import type { BlastRadius, NativeReading } from './blast-radius';

const KIND_LABEL: Record<'path' | 'search-root' | 'host', string> = {
  path: 'File',
  'search-root': 'Search root',
  host: 'Host',
};

/**
 * Echoed native inputs. Rendered as a definition list of field name to verbatim value — the field
 * name is shown because "the agent sent `path=/etc`" is a checkable claim while "/etc" alone is
 * not, and ADR-015 condition (e) requires the native basis to travel with anything derived.
 */
function NativeReadings({ readings, heading }: { readings: NativeReading[]; heading: string }) {
  if (readings.length === 0) return null;
  return (
    <div className="mt-3">
      <h4 data-testid="native-readings-heading" className="text-xs font-semibold text-slate-400">
        {heading}
      </h4>
      <dl className="mt-1 space-y-1">
        {readings.map((r) => (
          <div key={r.field} data-testid="native-reading" data-field={r.field} className="text-sm">
            <dt className="inline font-mono text-xs text-slate-400">{r.field}</dt>
            <dd className="ml-2 inline break-all font-mono text-slate-200">{r.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default function BlastRadiusSection({ radius }: { radius: BlastRadius }) {
  const frame = (border: string, children: React.ReactNode) => (
    <section
      data-testid="blast-radius"
      data-status={radius.status}
      aria-labelledby="blast-radius-heading"
      className={`mt-3 rounded border p-3 ${border}`}
    >
      {children}
    </section>
  );

  if (radius.status === 'not-executable') {
    return frame(
      'border-slate-700 bg-night-950',
      <>
        <h3 id="blast-radius-heading" className="text-sm font-semibold text-slate-300">
          This event carries no executable action
        </h3>
        <p className="mt-1 text-sm text-slate-400">
          Nothing will run, so there is nothing to project.
        </p>
      </>,
    );
  }

  if (radius.status === 'unknown-action') {
    // Loud on purpose. This means upstream shipped an action class we have never ruled on, so the
    // absence of analysis here is a gap in *our* coverage, not a property of the action.
    return frame(
      'border-amber-600 bg-amber-950',
      <>
        <h3 id="blast-radius-heading" className="text-sm font-semibold text-amber-100">
          Unrecognised action — no analysis available
        </h3>
        <p className="mt-1 text-sm text-amber-100">
          {radius.actionClass === null
            ? 'This action arrived without a recognisable type.'
            : `This build has no recorded analysis for ${radius.actionClass}.`}{' '}
          Treat the command above as the only description of what will happen.
        </p>
      </>,
    );
  }

  if (radius.status === 'no-projection') {
    return frame(
      'border-slate-600 bg-night-950',
      <>
        <h3 id="blast-radius-heading" className="text-sm font-semibold text-slate-200">
          No blast radius was computed for this tool
        </h3>
        <p className="mt-1 text-sm text-slate-400">{radius.reason}</p>
        <NativeReadings
          readings={radius.readings}
          heading="Sent by the agent, shown exactly as received — not analysed"
        />
      </>,
    );
  }

  const empty = radius.targets.length === 0;
  return frame(
    'border-slate-600 bg-night-950',
    <>
      <h3 id="blast-radius-heading" className="text-sm font-semibold text-slate-200">
        What this will touch
      </h3>
      {empty ? (
        // Distinct from no-projection: the formula ran. Saying so is the difference between
        // "we looked and found nothing" and "we never looked".
        <p data-testid="blast-empty" className="mt-1 text-sm text-slate-400">
          Read from this action&rsquo;s own fields: it names no file or host.
        </p>
      ) : (
        <ul className="mt-2 space-y-1">
          {radius.targets.map((t) => (
            <li
              key={`${t.kind}:${t.value}`}
              data-testid="blast-target"
              data-kind={t.kind}
              className="flex flex-wrap items-baseline gap-2 text-sm"
            >
              <span className="rounded border border-slate-600 px-1.5 py-0.5 text-xs text-slate-300">
                {KIND_LABEL[t.kind]}
              </span>
              <span className="break-all font-mono text-slate-100">{t.value}</span>
            </li>
          ))}
        </ul>
      )}
      <NativeReadings
        readings={radius.readings}
        heading="Read from these fields, shown exactly as received"
      />
    </>,
  );
}
