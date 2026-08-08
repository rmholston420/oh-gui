# Shared severity palette for the baseline harness (bash half; ui/colors.mjs is the node half).
#
# The distinction that matters is not how bad something sounds, it is WHOSE FAULT it is:
#
#   green  — as expected. The harness is doing its job.
#   yellow — the MODEL did poorly, or something is UNKNOWN. Data, not a defect. Keep running.
#   red    — the HARNESS or the MACHINE is wrong. Results are not trustworthy. Worth killing over.
#
# A model failing a task is yellow, not red: that is the measurement, not a malfunction. A gate
# that cannot run, a workspace mismatch, or a thermal ceiling breach is red — those invalidate the
# cell rather than describe it.
#
# Honours NO_COLOR (https://no-color.org) and disables itself when stdout is not a terminal, so
# `tee` to a log file stays clean. Force with OH_GUI_COLOR=1, disable with OH_GUI_COLOR=0.
if [ "${OH_GUI_COLOR:-auto}" = "1" ] || { [ "${OH_GUI_COLOR:-auto}" = "auto" ] && [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; }; then
  C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'; C_RED=$'\033[31;1m'
  C_DIM=$'\033[2m';    C_BOLD=$'\033[1m';    C_OFF=$'\033[0m'
else
  C_GREEN=''; C_YELLOW=''; C_RED=''; C_DIM=''; C_BOLD=''; C_OFF=''
fi

cgreen(){  printf '%s%s%s\n' "$C_GREEN"  "$1" "$C_OFF"; }
cyellow(){ printf '%s%s%s\n' "$C_YELLOW" "$1" "$C_OFF"; }
cred(){    printf '%s%s%s\n' "$C_RED"    "$1" "$C_OFF"; }
cdim(){    printf '%s%s%s\n' "$C_DIM"    "$1" "$C_OFF"; }
