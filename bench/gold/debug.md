# Gold answer — task `debug`

Authored by Perplexity Max (Claude Sonnet 4.6) 2026-08-08, from first-hand knowledge of
the actual incident. Ground truth is known: this is the real q8 sweep failure from
2026-08-08, diagnosed and fixed in this repository.

Scoring weights: A=25, B=20, C=25, D=20, structure/precision=10.

---

## Defect 1 — the server was never restarted, so the q8 run measured nothing

**Observation:** `idle_used_mib=6747` in run 2 against `640` in run 1. The difference is
**6,107 MiB**, which matches run 1's own reported embedding cost of **6,110 MiB** to within
3 MiB.

**Root cause chain:**
1. Run 1 ended by loading `qwen3-embedding:0.6b` with `keep_alive:"2m"`. Runs were ~1 minute
   apart, so it was still resident.
2. `sudo systemctl restart ollama 2>/dev/null` failed, and `2>/dev/null` swallowed the
   reason. The `||` fallback then ran `pkill -x ollama`, which cannot signal a process owned
   by the `ollama` service user from an unprivileged shell.
3. The fallback `ollama serve` then failed to bind — port 11434 was still held by the
   original server — but its failure was never checked.
4. The original process survived with the embedder still loaded.

**Fix:** verify the restart instead of assuming it, and stop *all* models rather than only
those in `MODELS`:

```bash
sudo systemctl restart ollama || { echo "FATAL: restart failed"; exit 1; }
for i in $(seq 1 30); do curl -sf localhost:11434/api/version >/dev/null && break; sleep 1; done

# stop everything actually resident, not just the sweep list
ollama ps --format json 2>/dev/null | python3 -c '
import sys,json
for l in sys.stdin:
    try: print(json.loads(l).get("name",""))
    except Exception: pass' | xargs -r -n1 ollama stop

resident=$(curl -s localhost:11434/api/ps | python3 -c 'import sys,json;print(len(json.load(sys.stdin).get("models",[])))')
[ "$resident" -eq 0 ] || { echo "FATAL: $resident model(s) still resident; baseline invalid"; exit 1; }
```

The abort is the important half. A contaminated baseline must halt the run, not annotate it.

## Defect 2 — `systemctl set-environment` does not reach the service

**Observation:** even had the restart worked, `set-environment` sets variables on the systemd
*manager*, which are not inherited by an already-declared service unit.

**Fix:** use a drop-in.

```bash
sudo mkdir -p /etc/systemd/system/ollama.service.d
sudo tee /etc/systemd/system/ollama.service.d/oh-gui.conf >/dev/null <<'CONF'
[Service]
Environment="OLLAMA_FLASH_ATTENTION=1"
Environment="OLLAMA_KV_CACHE_TYPE=q8_0"
CONF
sudo systemctl daemon-reload && sudo systemctl restart ollama
systemctl show ollama --property=Environment | tr ' ' '\n' | grep -i ollama
```

## Defect 3 — the embedder is loaded at the default context

Covered in D below. It is a distinct defect from 1 and 2 and should be counted separately.

## Defect 4 — the run reports success without validating its own preconditions

No check that the requested KV type was actually adopted; no check that the baseline was
clean; no check that the fallback `ollama serve` came up. Every one of these failed silently
and the script still printed a well-formed table. **A benchmark that cannot fail loudly is
not a benchmark.**

---

## A. Why `idle_used_mib=6747` vs `640`

The embedder from run 1 was still resident, because the restart silently failed (Defect 1)
and because the stop loop only iterates `MODELS`, which does not contain
`qwen3-embedding:0.6b`. Arithmetic: 6747 − 640 = 6107 ≈ the 6110 MiB embedder cost run 1
measured. Both faults are independently sufficient; both are present.

## B. What near-identical q8 and fp16 numbers mean

KV-cache quantization was not in effect. Two independent causes, and the evidence cannot
separate them from this output alone:

1. The env never reached the server (Defects 1 and 2).
2. Even when correctly applied, Ollama's new Go inference engine ignores
   `OLLAMA_KV_CACHE_TYPE` entirely — [ollama#8921](https://github.com/ollama/ollama/issues/8921).

To confirm, in order:

```bash
systemctl show ollama --property=Environment | tr ' ' '\n' | grep -i kv   # did it arrive?
sudo journalctl -u ollama --since "2 min ago" | grep -iE "kv.?cache|flash"  # did it engage?
```

If the env is present and the log still shows no KV-cache line, cause 2 holds and the
feature must be abandoned on this runtime rather than debugged further.

## C. Why 131072 reads lower (26113) than 65536 (28023)

The embedder was evicted between those two rows. At 65536 the total still carried the stale
embedder; by 131072 the scheduler needed the space, unloaded it, and the total dropped.

The arithmetic confirms it exactly:
- q8@65536 = 28023 vs fp16@65536 = 22119 → **+5904**, an embedder-sized surplus.
- q8@131072 = 26113 vs fp16@131072 = 26136 → **−23**, i.e. the embedder is gone.

Physically: nothing about the model changed. A ~5.9 GB resident tenant was reclaimed by the
scheduler mid-sweep. This is also a correctness finding beyond the bug — eviction is
non-deterministic and can strike the embedder during real work. Pinning the embedder to CPU
(`"options":{"num_gpu":0}`) removes the race; `OLLAMA_MAX_LOADED_MODELS` governs how many
tenants the scheduler will attempt to keep.

## D. Why a 639 MB model reports 5.8 GB

Weights are not the footprint; the KV cache is. The request omitted `num_ctx`, so the model
loaded at the server default (`OLLAMA_CONTEXT_LENGTH=65536` on this host, 4096 upstream) and
allocated a context cache for a window an embedding model can never use. Embeddings are
computed over one chunk, typically ≤512 tokens.

```bash
curl -s localhost:11434/api/embed -d '{
  "model":"qwen3-embedding:0.6b",
  "input":"warmup",
  "options":{"num_ctx":512,"num_gpu":0},
  "keep_alive":"2m"}'
```

Measured effect: 512 → 1,540 MiB; 2,048 → 2,602; 8,192 → 3,344; 32,768 → 6,078. Adding
`num_gpu:0` moves it off the GPU entirely for ~0 MiB VRAM at a cost of 110 ms vs 90 ms per
query.

---

## Claims a strong answer should NOT make

- That q8_0 KV "reduced memory as expected" anywhere in this output.
- That the 131072 row demonstrates a KV saving. It demonstrates an eviction.
- That the embedder is 5.8 GB. The *manifest* is 639 MB; 5.8 GB is what `ollama ps` reports
  for weights plus context allocation.
- Any conclusion about flash attention. The output contains no evidence either way, and an
  answer that asserts FA was active or inactive is unsupported.
