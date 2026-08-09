# ADR-033 — The code index is an MCP server, and it is Serena

**Status:** Proposed
**Lock-in phase:** Phase 2 · agent capability configuration
**Supersedes:** —

## Context

Repository-scale code understanding is the largest single lever on agent quality: without it an
agent explores by repeated `read` and `grep`, spending thousands of tokens per question and
carrying no structural model of the code. On Colossus the binding constraint is a 32 GB card, so
context spent on exploration is context unavailable for reasoning.

Two families of solution exist, and they are frequently conflated:

- **Structural** — a symbol/reference graph (LSP, SCIP, tree-sitter). Answers "who calls this",
  "where is this defined", "what breaks if I change this" *exactly*.
- **Semantic** — vector embeddings over code chunks. Answers "where is retry logic handled"
  *approximately*.

A survey of 24 candidates was performed (`code_graph_research.md`). Three were rejected outright
on licensing under the permissive-only rule: `universal-ctags` (GPL-2.0), `potpie` (pulls GPL-3.0
Neo4j), and `code-graph-rag` (pulls BSL-1.1 Memgraph). `sourcerer-mcp` requires an OpenAI key and
fails the local-first rule.

The survey ranked **`codebase-memory-mcp`** first on the strength of a single artifact delivering
graph + embeddings, 38.2k stars, and a supporting preprint. That recommendation was verified
directly rather than accepted, and the verification inverted it. See "Rejection of
codebase-memory-mcp" below.

## Decision

**1. A code index is harness configuration, not OH-GUI source.** Under ADR-026 the lowest
sufficient tier wins, and ADR-027 holds that OpenHands is the harness while our middleware is only
its residue. An MCP server declaration is a native harness surface
(`Plugin.mcp_config`, ADR-026 tier 4 packaging). Therefore the code index is delivered as an
**MCP server declaration**, and **no indexing code is written into or vendored into this
repository**. There is no `CodeIndexPort`, because there is no adapter to write.

**2. The code index is [Serena](https://github.com/oraios/serena)** (MIT,
commit `430fc62e72d3a82059b870560e4a2ea60bbb9cf5`, 2026-08-08). It provides LSP-backed symbol and
reference resolution over TypeScript and Python — our two languages — as a stdio MCP server, and
already documents an OpenHands integration path.

**3. Structural precision is preferred over semantic recall, and semantic search is deferred.**
Serena ships no embeddings. That gap is accepted for now rather than closed by bundling a second
tool, because the evidence for embeddings is weaker than the evidence for structure, and every
added MCP server is added tool surface in the agent's context window. Revisit only when a measured
task class in our own benchmark is shown to fail on structural lookup and succeed on semantic.

**4. Adoption is gated on measurement, not on installation.** Serena is adopted when it is shown
to help on our own tasks, using the ADR-016 benchmark harness. Until that measurement exists, this
ADR is Proposed and Serena is not enabled by default in either Vibe or Pro.

## Rationale

### Why not the top-ranked candidate

`codebase-memory-mcp` is a real, active, MIT project — 2,151 commits, 1,503 PRs, outside
contributors, pushed 2026-08-09 — and its preprint genuinely exists
([arXiv:2603.27277](https://arxiv.org/abs/2603.27277), submitted 28 Mar 2026, cs.SE). The initial
suspicion that its metrics were fabricated was wrong, and is recorded here so it is not repeated.

It is nevertheless rejected on four independent grounds:

- **Its own benchmark reports a quality regression.** The abstract states *"83% answer quality
  versus 92% for a file-exploration agent, at ten times fewer tokens and 2.1 times fewer tool
  calls."* That is nine points of answer quality traded for token efficiency. Our standing rule is
  quality first, speed second. This is the inverse trade, and adopting it would mean accepting a
  measured regression on the axis we care about most in exchange for one we care about less.
- **The evidence is self-authored.** First author Martin Vogel is the repository's dominant
  committer (1,101 of 2,151 commits). A ten-page unreviewed preprint benchmarking its own system
  is a design description, not independent evidence.
- **Distribution is an opaque prebuilt binary.** Install is `curl -fsSL … | bash`; grammars and
  embedding weights are compiled into the executable, which ad-hoc signs itself and strips macOS
  quarantine. A binary cannot be logged in `PORTING_LEDGER.md` with a meaningful source commit and
  cannot be inspected before use, which is the point of the ledger.
- **The bundled weights do not match their stated identity.** The README advertises
  `nomic-embed-code` at "768d int8"; upstream `nomic-embed-code` is a 7B model at 3584 dimensions.
  Whatever is embedded is an undisclosed distilled or substituted variant, and no separate weights
  license is stated — only the repository's MIT badge, which does not cover third-party weights.

Secondary concerns, not load-bearing on their own: pre-1.0 (`v0.9.1-rc.1`), 428 open issues, and
TypeScript and Python both sitting in its self-declared "Good (75–89%)" tier rather than its top
tier.

### Why Serena

- **Deterministic, not probabilistic.** LSP resolution returns the definition, not a ranked guess.
  There is no quality regression to trade away, which is the whole objection to the alternative.
- **Source-installable**, so it can be pinned to a commit SHA and inspected.
- **MIT**, clean under the permissive-only rule, verified from the repository's
  [LICENSE](https://github.com/oraios/serena/blob/main/LICENSE).
- **Healthy maintenance signal**: 27.8k stars, 91 open issues (against 428), pushed 2026-08-08.
- **Already targets OpenHands**, so integration is declaration rather than adaptation.

### Why no port, and why no code

The reflex under `kosmos-port-workflow` is to wrap a vendored component behind a formal port. That
reflex is wrong here, and naming why matters more than the choice itself: **an MCP server is not a
dependency of our code — it is a capability of the agent.** Nothing in `apps/gui` calls Serena.
Writing a `CodeIndexPort` would create an abstraction with exactly zero call sites in our source,
which is speculative generality, and would quietly convert an extension-only posture into a
build-into-the-harness one, contradicting ADR-026 and ADR-027.

## Consequences

- `PORTING_LEDGER.md` gains a Serena entry recorded as **CONFIGURED, not vendored**, with the
  commit SHA above — a new status distinguishing "the agent is told this exists" from "we copied
  source into the tree". `codebase-memory-mcp` is recorded as **REJECTED** with the grounds above
  so the decision is not re-litigated from star count alone.
- No new source files, no new port, no new adapter, no change to `apps/gui`.
- Serena is declared in OpenHands MCP configuration, disabled by default until clause 4 is met.
- The ADR-016 harness gains a task class exercising cross-file symbol resolution, so clause 4 is
  measurable rather than rhetorical.
- Embeddings remain unaddressed. This is a known, deliberate gap, not an oversight.

## Lock-in phase

Phase 2. Nothing in Phase 1 depends on this, and it must not block the ADR-016 benchmark.

## Open question for the operator

Clause 3 defers semantic search entirely. The competing view is that on a 32 GB card token
efficiency *is* quality, because context exhaustion degrades answers more than imprecise retrieval
does — which is the strongest argument the rejected candidate has. If that view is preferred, the
follow-on is `grepai` (MIT, Ollama-backed, local) as a second MCP server, decided in its own ADR
rather than folded into this one.

## References

- `code_graph_research.md` — 24-candidate survey with licenses verified from LICENSE files
- [ADR-026](ADR-026-extension-only-posture-and-capability-allocation.md) — extension-only posture,
  lowest tier wins, `mcp_config` as a native surface
- [ADR-027](ADR-027-openhands-is-the-harness.md) — OpenHands is the harness; MCP declarations are
  harness surfaces
- [ADR-016](ADR-016-decouple-baseline-benchmark-from-phase-0-exit.md) — the harness that gates clause 4
- [Serena](https://github.com/oraios/serena) · [codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp) · [arXiv:2603.27277](https://arxiv.org/abs/2603.27277)
