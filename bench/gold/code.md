# Gold standard — task `code`

Written and committed before any cell ran, per the Perplexity-gold-first rule in
`local-llm-bench`. The reference implementation is at
`bench/gold/reference/code_reference.py` and passes 30/30 of the hidden suite in
`bench/gold/code_tests.py`.

This task exists because the `debug`, `arch`, and `plan` tasks are all reasoning tasks.
Run `20260808_0555` scored two coder-specialist models on `debug` and then could not say
anything about them, because a diagnostic task with `think=False` measures the wrong
thing. Nothing in that matrix asked any model to write code.

## Why this task and not a synthetic one

Both functions come from defects this repository actually shipped:

- `parse_perf_flags` — `bench/lib/gpu.sh` originally parsed the throttle field with an
  awk `$NF` match. `Not Active` has `Active` as its last whitespace-delimited field, so
  the harness reported thermal throttling on every sample, including idle ones. The fix
  is recorded in `gpu.sh` as an inline comment.
- `decode_flag` — the two-character `pcap_thermal` CSV column needs a length check before
  indexing position 1, or short and empty fields raise `IndexError` mid-summary.

A model that has genuinely absorbed the brief will handle both without being told they
are traps. Neither trap is hinted at in the prompt.

## Scoring — 100 points

| Component | Points | How it is awarded |
|---|---:|---|
| Executed tests | 60 | `round(60 * passed / 30)`. Machine-scored, no judgment. |
| Edge-case commentary | 15 | The ≤150-word closing question. |
| Contract adherence | 15 | Exact names, signatures, type hints, stdlib only, one runnable block. |
| Code quality | 10 | Judgment. |

A module that fails to import scores 0 on tests. It is not partially credited for
looking plausible — the brief states it will be imported and executed as written.

### Executed tests (60)

The suite is the arbiter. Ties in the test score are broken by the remaining 40 points,
never the reverse.

The two highest-signal tests, both untelegraphed:

- `test_not_active_is_false` — the `$NF` trap.
- `test_block_terminates_at_dedent` — requires tracking the header's indent and stopping
  at the first line that dedents to it. An implementation that parses every
  `label : value` line in the file, or that stops only at a blank line, fails this and
  `test_excludes_fields_outside_block` together.

Also discriminating:

- `test_unknown_future_reason_appears` fails any whitelist-based implementation. The
  brief prohibits whitelists explicitly, so this is a compliance failure, not a
  cleverness test.
- `test_missing_block_returns_empty_dict` — return `{}`, do not raise. The brief is
  explicit and the two behaviours are easy to conflate with the `ValueError` clause.
- `test_long_truncates_four` — `"1011"` is `(True, False)`. Pad-then-truncate in that
  order; truncate-then-pad gives the same answer here but differs on `"1"`.

### Edge-case commentary (15)

The brief asks which edge case a careless implementation is most likely to get wrong.

- **15** — names the `Not Active` / `Active` suffix collision, or block termination at
  dedent, and explains the failure mechanism correctly.
- **10** — names a genuine edge case from the brief with correct reasoning.
- **5** — generic ("error handling is important") or restates a clause without a mechanism.
- **0** — absent, over-length by more than half, or names something the brief never said.

### Contract adherence (15)

Deduct 5 each: wrong function name or signature; missing type hints; any import outside
the standard library; code not delivered as a single runnable block; placeholders, `...`,
`TODO`, or prose inside the block.

### Code quality (10)

Readability, absence of dead code, sensible error messages. Not length — the reference is
about 50 lines and a correct 30-line answer is not penalised.

## Claims a strong answer should NOT make

- That `nvidia-smi --query-gpu=clocks_throttle_reasons.active` would be a better approach.
  It may be, but the brief specifies parsing `-q -d PERFORMANCE` text, and substituting a
  different data source is not the task. Mentioning it as an aside is fine; implementing
  it instead is a contract failure.
- That a regex over the whole document is equivalent to block-scoped parsing. It is not —
  `test_excludes_fields_outside_block` and `test_block_terminates_at_dedent` exist
  precisely to separate these.
- That `N/A` should raise. The brief says it maps to `False`.
- That an empty `pcap_thermal` field is an error condition. The brief says `(False, False)`.
- Silently returning `(False, False)` for malformed input instead of raising `ValueError`.
  Swallowing a bad flag makes a throttled run look clean, which is the exact failure this
  harness exists to prevent.
- Adding argument-parsing, logging configuration, or a `__main__` block. Not requested;
  the module is imported, not run.
