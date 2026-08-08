# Gold answer — task `plan`

Authored by Perplexity Max (Claude Sonnet 4.6) 2026-08-08 against the actual state of this
repository. Ground truth is known: this is the real Phase 0 exit sequencing.

Scoring weights: ordering + dependency justification = 30, Definitions of Done = 20,
invalidation analysis = 25, highest-risk unknown + cheap experiment = 15,
stop condition = 10.

---

## 1. Order

**R2 → R3 → R1 → R4**, with R2 split because only part of it is cheap.

**R2a. Pin the immutable artifacts (container digest + four Python packages).**
First because it is minutes of work, produces immutable identifiers, and every later item
is measured against *some* version of OpenHands — an unpinned dependency means any later
result is attributed to a moving target. Cheap and de-risking work goes before expensive
work when it has no upstream dependency, and this has none.

**R2b. Pin the TypeScript client AND smoke-test it.** Separated from R2a because pinning an
alpha is not the same as knowing it works. The documentation states the API may change
significantly between versions without notice, which means the pin protects against drift
but proves nothing about fitness. A version number recorded without an executed call is a
false sense of completion.

**R3. Reference checkout.** Depends on R2a. A checkout of the stock frontend is only a
valid reference if it is the *same version* as the pinned artifacts; a reference to a
different release teaches behaviour that the pinned API does not have, and every such
lesson has to be unlearned. Reversing R2a and R3 does not fail loudly — it fails by
producing confidently wrong UI expectations.

**R1. Quality benchmark.** Independent of R2 and R3 in principle: model quality does not
depend on which OpenHands release is pinned. It goes third anyway, for two reasons.

  - It is the long pole and the only item that needs exclusive hardware. Putting cheap
    items first means the expensive item runs against a settled environment.
  - **R3 and R1 cannot overlap in wall-clock time on this machine.** The reference checkout
    invites browsing a frontend in a browser, and the browser costs 2–3 GB of VRAM. The
    planner cells run at 26,140–29,368 MiB of 32,607. Doing R3 during R1 changes the memory
    conditions mid-matrix and silently invalidates the cells that ran alongside it. They
    are logically independent and physically exclusive.

**R4. First-run wizard.** Last, and genuinely dependent on both predecessors. The wizard
must state where the trust dial stops, but it must also present the ratified planner and
coder (R1) and the pinned versions (R2). Specifying it earlier means specifying placeholder
values, and placeholder values in a first-run security disclosure are how a UI ends up
telling the operator something untrue.

Sub-steps required but not named in the brief:

  - **R1.0** — write gold-standard answers *before* running any cell. Scoring against a
    baseline authored after seeing model output is not scoring, it is rationalisation.
  - **R1.5** — an end-to-end agent-loop check on the leading candidate before ratifying
    (see §4).
  - **R2c** — record all pins in one machine-readable file, not prose in a log.

## 2. Definitions of Done

**R2a.** A committed file contains the `ghcr.io/openhands/agent-server` image **digest**
(`sha256:…`, not a tag) and exact `==` versions of all four Python packages, and
`docker pull <digest>` plus `pip install -r` of those pins both succeed on Colossus from a
clean cache. Checkable: re-running both commands after `docker image rm` reproduces byte
sizes.

**R2b.** The pinned `@openhands/typescript-client` version is recorded, and a committed
smoke test executes the minimum call set OH-GUI requires — start a conversation, send a
message, receive an event stream, stop — against the R2a container digest, and exits 0.
Checkable: `npm test` returns 0 with the container running.

**R3.** A read-only checkout exists at a recorded path, pinned to the same release as R2a,
and is excluded from the build: it appears in no import path, no `package.json`, no
`pyproject.toml`, and no Docker build context. Checkable: deleting the directory and
building OH-GUI still succeeds.

**R1.** Every cell in the matrix has one JSON result file, every task has a gold answer
authored before the run, every cell is scored 0–100 against gold, and an ADR records one
ratified planner and one ratified coder with the score table and the tie-break rule
applied. Checkable: cell count on disk equals cell count in the harness, and the ADR status
is `Ratified`, not `Proposed`.

**R4.** A committed spec states the exact default trust-dial stop as it will appear in the
UI, naming the string the operator sees, and enumerates for each action class whether it
auto-approves or pauses. Checkable: the enumeration covers every `ActionKind` in the
security-analyzer port with no gaps.

## 3. Items that invalidate earlier work if sequenced wrongly

**R3 concurrent with R1 — silent, and the worst of the four.** A browser opened to read the
reference frontend takes 2–3 GB of VRAM. Cells that ran with it open saw a different
envelope than cells that did not. Nothing errors; some cells are just slower or spill to
CPU, and the ranking reflects when the operator happened to be browsing rather than model
quality. This project has already been bitten by exactly this class of defect: a benchmark
that produced plausible numbers while measuring a state nobody intended.

**R2b after R4 — expensive and loud.** If the alpha client turns out to lack an endpoint
the wizard's flow assumes, the wizard is re-specified. Cost scales with how much UI was
built on the assumption.

**R2a after R3 — quiet and corrosive.** A reference checkout at the wrong version teaches
wrong behaviour. There is no error; there is a slow accumulation of incorrect expectations
that surface later as bugs attributed to the code rather than to the reference.

**R1 before its gold answers exist.** Scoring against a baseline written after seeing model
outputs anchors on what the models produced. The failure mode is a defensible-looking
score table that ratifies the wrong model.

**R4 before R1** yields a wizard naming a model that the benchmark then rejects.

## 4. Highest-risk unknown, and the cheap experiment

**The highest-risk unknown is not model quality — it is whether the ratified model can
drive the OpenHands agent loop at all.**

R1 as specified measures single-turn answer quality on three prompts. OpenHands needs
sustained multi-turn tool calling: emitting well-formed tool calls, recovering from tool
errors, and not derailing over a long trajectory. These correlate weakly. A model can write
an excellent architectural analysis and still fail to emit a parseable tool call on turn
nine. Ratifying on single-turn quality and discovering this during implementation would
invalidate the entire benchmark and the ADR that rests on it.

**Cheap experiment, before ratifying anything:** run *one* real OpenHands task end-to-end
against the leading candidate through the R2a container — a task with a known-correct
outcome, such as fixing a failing test in a scratch repo. Record whether every tool call
parsed, how many turns it took, and whether it completed. Roughly 30 minutes and no new
tooling, since R2a is already pinned and running by then. If the leading candidate fails,
try the runner-up before the ADR is written rather than after.

This also has direct external support worth acting on: All Hands' own local-LLM
documentation recommends `qwen3.6:35b-a3b` as the first local model to try with OpenHands,
which is a candidate in this matrix. That recommendation is evidence about agent-loop
fitness specifically, which is exactly the axis the benchmark does not measure.

## 5. Stop condition

Phase 0 closes when **all five** hold:

1. An ADR with status `Ratified` names one planner and one coder, with the score table and
   the applied tie-break rule.
2. A committed pins file contains the container digest and all exact package versions, and
   the TypeScript smoke test exits 0 against that digest.
3. The reference checkout exists at the pinned version and is provably not a build
   dependency (deleting it does not break the build).
4. The first-run wizard spec states the default trust-dial stop as displayed text and
   covers every action class.
5. The agent-loop check in §4 has completed successfully with the ratified model.

Anything not on this list is Phase 1. Explicitly out of scope: writing application code,
choosing a frontend framework, and the deferred `OLLAMA_LLM_LIBRARY` / llama.cpp
experiment — that last one would change every measured context ceiling and must not run
inside a phase whose purpose is to freeze the model configuration.

---

## Claims a strong answer should NOT make

- That R1 should go first because it is the most important. Importance is not a dependency;
  the cheap immutable pins go first.
- That R3 and R1 can run in parallel "because they are independent." They are logically
  independent and physically exclusive on one GPU with one desktop.
- That pinning the alpha TypeScript client is sufficient without executing a call.
- Definitions of Done phrased as intentions ("ensure the models are evaluated") rather than
  checkable conditions.
- Treating single-turn benchmark quality as evidence of agent-loop fitness.
- Adding generic project-management scaffolding — standups, RACI matrices, risk registers.
  The brief excludes it and it is not sequencing.
- Declaring Phase 0 closed while any ADR remains `Proposed`.
