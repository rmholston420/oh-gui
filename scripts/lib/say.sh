# Shared colour-coded status output for operator-run scripts.
# green = ok, yellow = questionable, red = serious. Sourced, never executed.
_g=$'\e[32m'; _y=$'\e[33m'; _r=$'\e[31m'; _c=$'\e[36m'; _b=$'\e[1m'; _z=$'\e[0m'
ok()   { printf '%s✔ PASS%s %s\n'  "$_g$_b" "$_z" "$*"; }
warn() { printf '%s▲ CHECK%s %s\n' "$_y$_b" "$_z" "$*"; }
fail() { printf '%s✘ FAIL%s %s\n'  "$_r$_b" "$_z" "$*"; }
step() { printf '%s→%s %s\n' "$_c" "$_z" "$*"; }
chk()  { if [ "$2" = "$3" ]; then ok "$1 ($3)"; else fail "$1 — expected $3, got $2"; fi; }
