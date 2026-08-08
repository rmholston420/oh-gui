/**
 * Read what the APP recorded as a conversation's working directory, and refuse to grade a
 * directory the agent was not working in.
 *
 * Discovered 2026-08-08: `VITE_WORKING_DIR` on the running stack pointed at
 * `~/.oh-gui/baseline/fixture`, which does not exist, while the driver graded
 * `~/oh-gui-baseline/fixture`. The runs were in fact correct — the app ignores that env var and
 * uses the registered workspace from `~/.openhands/workspaces.json` — but nothing in the harness
 * checked, and a mismatch is indistinguishable from a model that did nothing: both leave an empty
 * git diff. Sixteen cells would have reported zero accepted with no indication why.
 *
 * The conversation id is stored dashed in the URL and undashed in the directory name.
 * `working_dir` lives at `workspace.working_dir` in meta.json, NOT at the top level.
 */
import { existsSync, readFileSync } from "node:fs";
import { realpathSync } from "node:fs";

export const convDir = (cid, root = `${process.env.HOME}/.openhands/agent-canvas/dev_conversations`) =>
  `${root}/${String(cid || "").replace(/-/g, "")}`;

/** @returns {{ok:boolean, working_dir:string|null, reason:string}} */
export function readWorkingDir(cid, { root } = {}) {
  if (!cid) return { ok: false, working_dir: null, reason: "no conversation id was captured" };
  const dir = convDir(cid, root);
  if (!existsSync(dir)) return { ok: false, working_dir: null, reason: `no conversation dir at ${dir}` };
  const meta = `${dir}/meta.json`;
  if (!existsSync(meta)) return { ok: false, working_dir: null, reason: `no meta.json in ${dir}` };
  let wd = null;
  try {
    wd = (JSON.parse(readFileSync(meta, "utf8")).workspace || {}).working_dir || null;
  } catch (e) {
    return { ok: false, working_dir: null, reason: `meta.json unreadable: ${e.message}` };
  }
  return wd
    ? { ok: true, working_dir: wd, reason: "" }
    : { ok: false, working_dir: null, reason: "meta.json has no workspace.working_dir" };
}

const canon = (p) => { try { return realpathSync(p); } catch { return p.replace(/\/+$/, ""); } };

/**
 * @returns {{match:boolean|null, working_dir:string|null, reason:string}}
 * match === null means UNKNOWN — the app recorded nothing we could read. Unknown is not a pass.
 */
export function checkWorkspace(cid, fixture, { root } = {}) {
  const r = readWorkingDir(cid, { root });
  if (!r.ok) return { match: null, working_dir: null, reason: r.reason };
  const match = canon(r.working_dir) === canon(fixture);
  return {
    match, working_dir: r.working_dir,
    reason: match ? "" : `agent worked in ${r.working_dir} but grading ${fixture}`,
  };
}
