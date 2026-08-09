/**
 * Blast radius — a DERIVED value under ADR-015, ratified by ADR-023 (option B).
 *
 * Every projection below is an identity read of a native field, or one standard-library parse.
 * Nothing here infers, expands a glob, resolves a symlink, or interprets shell. Field names are
 * verified in the pinned agent-server image and diffed against the pinned sdists — see
 * `docs/evidence/tool-action-fields.json`.
 *
 * THE DISCRIMINATOR IS NOT THE CLASS NAME
 * ---------------------------------------
 * The concrete action class arrives as `ActionEvent.action.kind`, and upstream's generated schema
 * mangles it to a fully-qualified form:
 *
 *     openhands__tools__file_editor__definition__FileEditorAction-Output__1
 *     openhands__sdk__mcp__definition__MCPToolAction-Output__1
 *
 * An earlier revision of this file keyed the tables on the bare class name. Every lookup missed,
 * so all 37 classes would have rendered as `unknown-action` — the drift state — silently and
 * uniformly. `normalizeActionKind` exists because of that bug, and
 * `blast-radius-contract.test.ts` walks the real union out of the installed client's schema so
 * the mangling can never drift away from us unnoticed.
 *
 * FOUR OUTCOMES, DELIBERATELY DISTINCT
 * ------------------------------------
 *   projected       a formula ran and produced targets
 *   no-projection   no formula is declared for this class; native inputs shown raw (option B)
 *   not-executable  `action` is null — upstream's own "non-executable" state, not an error
 *   unknown-action  the class is in neither table; upstream shipped something we have not ruled on
 *
 * An empty `targets` under `projected` means "the formula ran and found nothing", which is a
 * different fact from all three others and must never render alike (spec 04 §4.2, ADR-015).
 */

/** The subset of `ActionEvent` this module reads. Both fields are native (`action.py:40-56`). */
export interface ActionLike {
  /**
   * Native `ActionEvent.action` — the typed tool action, `null` when non-executable. Typed here
   * as an open record because the client models it as `Record<string, unknown> | null`; the
   * `kind` discriminator is the one member we rely on.
   */
  action: (Record<string, unknown> & { kind?: unknown }) | null;
  /** Native `ActionEvent.tool_name` — the LLM-facing tool label, never the class. */
  tool_name: string;
}

/** One derived target, carrying the native field it came from so ADR-015 (e) can be satisfied. */
export interface Target {
  kind: 'path' | 'search-root' | 'host';
  value: string;
  /** The native field name this was read from, e.g. `path`, `file_path`, `url`. */
  nativeField: string;
  /** The native value, verbatim. Equal to `value` for identity formulas; differs for `url`. */
  nativeValue: string;
}

/** A native field shown verbatim, per ADR-015 condition (e) and ADR-023 decision 2b. */
export interface NativeReading {
  field: string;
  value: string;
}

export type BlastRadius =
  | { status: 'projected'; actionClass: string; targets: Target[]; readings: NativeReading[] }
  | { status: 'no-projection'; actionClass: string; reason: string; readings: NativeReading[] }
  | { status: 'not-executable' }
  | { status: 'unknown-action'; actionClass: string | null };

/**
 * Reduce a wire `kind` to its bare class name.
 *
 * Handles the mangled form (`a__b__ClassName-Output__1`) and the bare form (`ClassName`), because
 * the generated schema uses the former and hand-built fixtures and local conversations use the
 * latter. No OpenHands action class contains a double underscore, so the last `__`-delimited
 * segment is unambiguous.
 */
export function normalizeActionKind(kind: unknown): string | null {
  if (typeof kind !== 'string' || kind.length === 0) return null;
  // Strip the pydantic-generated `-Output__1` / `-Input__2` suffix if present.
  const withoutIo = kind.replace(/-(?:Output|Input)__\d+$/, '');
  const segments = withoutIo.split('__');
  const bare = segments.at(-1);
  return bare !== undefined && bare.length > 0 ? bare : null;
}

type Formula = (a: Record<string, unknown>) => {
  targets: Target[];
  readings: NativeReading[];
};

const asString = (v: unknown): string | null =>
  typeof v === 'string' && v.length > 0 ? v : null;

function fmt(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}

const readings = (a: Record<string, unknown>, fields: string[]): NativeReading[] =>
  fields.map((f) => ({ field: f, value: fmt(a[f]) }));

/** Identity read of a single path-bearing field. */
const onePath =
  (field: string, alsoShow: string[] = []): Formula =>
  (a) => {
    const value = asString(a[field]);
    return {
      targets: value ? [{ kind: 'path', value, nativeField: field, nativeValue: value }] : [],
      readings: readings(a, [field, ...alsoShow]),
    };
  };

/**
 * Identity read of a search root. The match set of a glob or grep is not knowable before
 * execution and is not a native field; the root is both.
 */
const searchRoot =
  (rootField: string, alsoShow: string[]): Formula =>
  (a) => {
    const value = asString(a[rootField]);
    return {
      targets: value
        ? [{ kind: 'search-root', value, nativeField: rootField, nativeValue: value }]
        : [],
      readings: readings(a, [rootField, ...alsoShow]),
    };
  };

/** One WHATWG URL parse. An unparseable URL yields no target, never a guess at the host. */
const navigateHost: Formula = (a) => {
  const url = asString(a.url);
  let host: string | null = null;
  if (url !== null) {
    try {
      host = new URL(url).host || null;
    } catch {
      host = null;
    }
  }
  return {
    targets:
      host !== null && url !== null
        ? [{ kind: 'host', value: host, nativeField: 'url', nativeValue: url }]
        : [],
    readings: readings(a, ['url', 'new_tab']),
  };
};

/**
 * Declared projections, keyed by bare class name. Adding a row without amending ADR-023 is a
 * spec violation, and `blast-radius-contract.test.ts` will not catch that for you — it only
 * catches classes with *no* decision at all.
 */
const PROJECTIONS: Record<string, Formula> = {
  FileEditorAction: onePath('path', ['command']),
  PlanningFileEditorAction: onePath('path', ['command']),
  EditAction: onePath('file_path'),
  WriteFileAction: onePath('file_path'),
  ReadFileAction: onePath('file_path', ['offset', 'limit']),
  ListDirectoryAction: onePath('dir_path', ['recursive']),
  GlobAction: searchRoot('path', ['pattern']),
  GrepAction: searchRoot('path', ['pattern', 'include']),
  BrowserNavigateAction: navigateHost,
};

const BROWSER_INDEXED =
  'This browser action addresses a tab or element by index or id and names no host. The page it ' +
  'acts on is browser session state, which no action field carries.';

const TOUCHES_NOTHING = 'Touches no path, host, or network resource.';

/**
 * Classes with no projection, each with the reason and the native fields to show verbatim.
 * Presence here is a *recorded decision* under ADR-023. Absence from both tables is drift.
 */
const NO_PROJECTION: Record<string, { reason: string; fields: string[] }> = {
  TerminalAction: {
    reason:
      'The terminal tool carries only an opaque command string. Deriving what it touches would ' +
      'mean parsing shell, and a shell parse under-reports — it cannot see through command ' +
      'substitution, aliases, eval, or a chained command that names no path at all.',
    fields: ['command', 'is_input', 'timeout', 'reset'],
  },
  ApplyPatchAction: {
    reason:
      'Paths live inside the patch body. Reading them would be a second implementation of ' +
      "upstream's own patch parser (ADR-015 clause 7).",
    fields: ['patch'],
  },
  MCPToolAction: {
    reason:
      'MCP tool arguments are shaped at runtime by the connected MCP server. No static field ' +
      'set exists to project over — not pending work, but impossible in principle.',
    fields: ['data'],
  },
  TaskAction: {
    reason: 'Delegates to a subagent; what that agent touches is not knowable from this action.',
    fields: ['description', 'prompt', 'subagent_type', 'resume', 'max_turns'],
  },
  DelegateAction: {
    reason: 'Delegates to other agents; targets are not knowable from this action.',
    fields: ['command', 'ids', 'agent_types', 'tasks'],
  },
  WorkflowAction: {
    reason:
      'Runs a script whose contents are opaque to projection — the same reasoning as the terminal.',
    fields: ['name', 'script', 'max_concurrency'],
  },
  TaskTrackerAction: {
    reason: 'Operates on the in-conversation task list. ' + TOUCHES_NOTHING,
    fields: ['command', 'task_list'],
  },
  ConsultTomAction: {
    reason: 'Consults a model. ' + TOUCHES_NOTHING,
    fields: ['reason', 'use_user_message', 'custom_query'],
  },
  SleeptimeComputeAction: { reason: TOUCHES_NOTHING, fields: [] },
  FinishAction: { reason: 'Ends the conversation. ' + TOUCHES_NOTHING, fields: ['message'] },
  ThinkAction: { reason: 'Records a thought. ' + TOUCHES_NOTHING, fields: ['thought'] },
  InvokeSkillAction: { reason: 'Invokes a named skill. ' + TOUCHES_NOTHING, fields: ['name'] },
  SwitchLLMAction: {
    reason: 'Switches model profile. ' + TOUCHES_NOTHING,
    fields: ['profile_name', 'reason'],
  },
  VisionInspectAction: {
    reason: 'Inspects an image already in context. ' + TOUCHES_NOTHING,
    fields: ['image_index', 'question', 'profile_name'],
  },
  BrowserAction: { reason: BROWSER_INDEXED, fields: [] },
  BrowserClickAction: { reason: BROWSER_INDEXED, fields: ['index', 'new_tab'] },
  BrowserTypeAction: { reason: BROWSER_INDEXED, fields: ['index', 'text'] },
  BrowserScrollAction: { reason: BROWSER_INDEXED, fields: ['direction'] },
  BrowserGetStateAction: { reason: BROWSER_INDEXED, fields: ['include_screenshot'] },
  BrowserGetContentAction: {
    reason: BROWSER_INDEXED,
    fields: ['extract_links', 'start_from_char'],
  },
  BrowserListTabsAction: { reason: BROWSER_INDEXED, fields: [] },
  BrowserSwitchTabAction: { reason: BROWSER_INDEXED, fields: ['tab_id'] },
  BrowserCloseTabAction: { reason: BROWSER_INDEXED, fields: ['tab_id'] },
  BrowserGoBackAction: { reason: BROWSER_INDEXED, fields: [] },
  BrowserGetStorageAction: { reason: BROWSER_INDEXED, fields: [] },
  BrowserSetStorageAction: { reason: BROWSER_INDEXED, fields: ['storage_state'] },
  BrowserStartRecordingAction: { reason: BROWSER_INDEXED, fields: [] },
  BrowserStopRecordingAction: { reason: BROWSER_INDEXED, fields: [] },
};

/** Every action class carrying a recorded ADR-023 decision. Consumed by the contract test. */
export const DECIDED_ACTION_CLASSES: readonly string[] = Object.freeze([
  ...Object.keys(PROJECTIONS),
  ...Object.keys(NO_PROJECTION),
]);

export function blastRadius(event: ActionLike): BlastRadius {
  if (event.action === null || event.action === undefined) {
    // Upstream's own documented state: "Single tool call returned by LLM (None when
    // non-executable)". Not drift, not an empty radius.
    return { status: 'not-executable' };
  }

  const cls = normalizeActionKind(event.action.kind);
  if (cls === null) return { status: 'unknown-action', actionClass: null };

  const projection = PROJECTIONS[cls];
  if (projection !== undefined) {
    const out = projection(event.action);
    return { status: 'projected', actionClass: cls, targets: out.targets, readings: out.readings };
  }

  const declared = NO_PROJECTION[cls];
  if (declared !== undefined) {
    return {
      status: 'no-projection',
      actionClass: cls,
      reason: declared.reason,
      readings: readings(event.action, declared.fields),
    };
  }

  // In neither table: upstream shipped a class we have not ruled on. It must not quietly render
  // as "no projection", which would look like a decision we never made.
  return { status: 'unknown-action', actionClass: cls };
}
