# 08. Run Telemetry - Provider-Aware, Not a Dollar Sparkline (Phase 1 seed / Phase 5 full)

## 8.0 Phase-1 telemetry seed

Extract a minimal telemetry strip - tok/s, VRAM used/total, context-window pressure percent - ship as part of Phase 1.

## 8.1 Provider-aware display

- Hosted: tokens, dollar burn rate, rate-limit headroom.
- Local: tok/s (prompt vs generate, tracked separately), VRAM used/total, KV-cache occupancy, queue depth, offload warning, benchmarked against a per-model baseline.
- Universal: context-window pressure percent, wall-clock elapsed, turns since last human input, tool-call count, retry/error rate.
- GPU temperature and power-draw-vs-limit polled via vendor tooling at the same cadence as tok/s sampling. Surface a distinct thermal/power-limited warning separate from the offload warning.
- Diagnosed-state fusion: when both warnings fire simultaneously, fuse into one diagnosed message.

## 8.2 Mandatory implementation detail

Telemetry MUST route through a versioned adapter layer you own. Use the generic ConversationStateUpdateEvent - StatsConversationStateUpdateEvent does not exist.

## 8.3 Stuck detection

StuckDetector already ships with configurable thresholds. Remaining work is wiring - surface is_stuck() results as a non-blocking nudge, expanded to the intervention card.

## 8.4 Model profiles

Reusable profiles for Ollama, vLLM, llama.cpp, SGLang, OpenAI-compatible endpoints, ACP-backed harnesses, recording context limit, tool/vision support, endpoint, quantization, GPU assignment, data-egress status.

Schema additions:
- Model generation/family version - distinct field from parameter count, more predictive of tool-calling reliability than size alone.
- Architecture: dense vs mixture-of-experts. For Qwen3 27B-35B, default to dense unless confirmed MoE.
- Auto-detect from manifest metadata; fall back to manual field.
- deterministic_replay (boolean, v4.0 addition): true when the active backend runs in a batch-invariant/deterministic mode. Read by 05-plan-model.md section 5.5 to select rewind/fork disclosure wording. Defaults false; auto-detect where possible, otherwise manual toggle.

## 8.5 Budget model

- Scope: per-conversation, project-level defaults inherited at start.
- Denomination provider-aware: hosted maps to dollar ceiling; local maps to wall-clock time or turn count.
- Soft limit: non-blocking nudge to the inbox.
- Hard limit: pauses (never kills), presents a summary, offers Extend or Review only.
- Orthogonal to trust dial: NeverConfirm never bypasses a hard budget ceiling.
- Speculative execution: N parallel attempts counted against ceiling before commit.
- Tool-call-depth ceiling, a distinct budget axis independent of turn count and wall-clock time.
- (v4.0) In household deployments, budget ceilings default per-user but can be pooled at project level if explicitly configured.

## 8.6 Local tool-calling reliability posture

- Reliability tier display: derived from observed session-level success rate. Dense Qwen3 27B-35B defaults to "high," adjusts downward if observed failure diverges.
- Local-failure-signature vocabulary: malformed tool-call output (retry-with-diagnostic, not silent retry); tool-call abandonment (model reverts to prose mid-task); circular retry (repeats a materially identical failing call).
- Cloud-fallback escape hatch: a single action to re-run the current task against a configured cloud fallback model without losing context - a per-task model substitution, not a mode switch.
- Tool/skill count warning: soft warning at 30 concurrently enabled tools.

Phase 1 exit criterion addition: reliability-tier indicator displays correctly for a loaded Qwen3 27B-35B profile; a synthetic malformed-tool-call scenario surfaces the correct diagnostic; cloud-fallback escape hatch preserves context; deterministic_replay field is present and correctly read by the rewind/fork UI.
