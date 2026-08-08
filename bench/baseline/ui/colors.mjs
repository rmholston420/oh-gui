/**
 * Shared severity palette for the baseline harness (node half; lib/colors.sh is the bash half).
 *
 * The distinction that matters is not how bad something sounds, it is WHOSE FAULT it is:
 *   green  — as expected.
 *   yellow — the MODEL did poorly, or something is UNKNOWN. Data, not a defect. Keep running.
 *   red    — the HARNESS or the MACHINE is wrong. The cell is not trustworthy. Kill-worthy.
 *
 * A model failing its task is yellow: that is the measurement. A workspace mismatch or a gate that
 * cannot run is red, because it invalidates the cell instead of describing it.
 *
 * Honours NO_COLOR and turns itself off when stdout is not a TTY, so piping to `tee` stays clean.
 */
const on =
  process.env.OH_GUI_COLOR === "1" ||
  (process.env.OH_GUI_COLOR !== "0" && !process.env.NO_COLOR && process.stdout.isTTY === true);

const wrap = (code) => (s) => (on ? `\u001b[${code}m${s}\u001b[0m` : String(s));

export const green = wrap("32");
export const yellow = wrap("33");
export const red = wrap("31;1");
export const dim = wrap("2");
export const bold = wrap("1");
export const colorEnabled = on;

/**
 * Colour a cell's one-line outcome. Kept here, not inline, so the bash and node halves agree on
 * what counts as red.
 */
export function outcomeLine({ accepted, gate, fixtureTests, outcome, filesChanged }) {
  // Harness faults first — these mean the number is not a measurement at all.
  if (gate === "no-venv" || gate === "no-gate" || outcome === "aborted")
    return red(`ACCEPTED=UNKNOWN (harness: gate=${gate}, outcome=${outcome})`);
  if (accepted === true) return green("ACCEPTED=yes");
  if (filesChanged === 0) return yellow("ACCEPTED=no (changed no files — did not attempt)");
  return yellow(`ACCEPTED=no (gate=${gate}, tests=${fixtureTests})`);
}
