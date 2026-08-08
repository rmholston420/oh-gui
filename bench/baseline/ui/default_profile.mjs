/**
 * Temporarily repoint ~/.openhands/profiles/default.json at the cell's own model.
 *
 * WHY: the first matrix logged `litellm.NotFoundError: model 'devstral-small-2:24b' not found` on
 * every cell — the default profile points at a model that was never pulled, and auxiliary
 * machinery invokes it mid-run.
 *
 * This MUTATES the operator's config, so restoration cannot depend on a clean exit. The backup is
 * written to DISK next to the profile before the edit, and `restore()` is idempotent and also
 * bound to SIGINT/SIGTERM — Ctrl-C on a 45-minute matrix must not leave the config rewritten.
 * A stale backup found at startup is restored first, so a hard kill self-heals on the next run.
 */
import { readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";

const DIR = `${process.env.HOME}/.openhands/profiles`;
export const DEFAULT_PATH = `${DIR}/default.json`;
export const BACKUP_PATH = `${DIR}/default.json.baseline-backup`;

/** Put back a backup left behind by an interrupted run. Safe to call always. */
export function restore({ defaultPath = DEFAULT_PATH, backupPath = BACKUP_PATH } = {}) {
  if (!existsSync(backupPath)) return false;
  writeFileSync(defaultPath, readFileSync(backupPath, "utf8"));
  rmSync(backupPath, { force: true });
  return true;
}

/**
 * @returns {{changed:boolean, from?:string, to?:string, recovered:boolean}}
 */
export function pointAtModel(profileName, { dir = DIR } = {}) {
  const defaultPath = `${dir}/default.json`;
  const backupPath = `${dir}/default.json.baseline-backup`;
  const recovered = restore({ defaultPath, backupPath });
  if (!existsSync(defaultPath)) return { changed: false, recovered };

  const raw = readFileSync(defaultPath, "utf8");
  const dflt = JSON.parse(raw);
  const minePath = `${dir}/${profileName}.json`;
  if (!existsSync(minePath)) throw new Error(`profile not found: ${minePath}`);
  const mine = JSON.parse(readFileSync(minePath, "utf8"));

  if (dflt.model === mine.model) return { changed: false, recovered, from: dflt.model, to: mine.model };

  writeFileSync(backupPath, raw);                 // disk first, then edit
  writeFileSync(defaultPath, JSON.stringify(
    { ...dflt, model: mine.model, base_url: mine.base_url }, null, 2));
  return { changed: true, recovered, from: dflt.model, to: mine.model };
}

export function bindRestoreToExit({ defaultPath = DEFAULT_PATH, backupPath = BACKUP_PATH } = {}) {
  const go = () => { try { restore({ defaultPath, backupPath }); } catch {} };
  process.on("exit", go);
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(sig, () => { go(); process.exit(130); });
  }
  process.on("uncaughtException", (e) => { go(); console.error(e); process.exit(1); });
}
