---
name: small_model_web_guard
description: Block web_fetch and browser tool calls when the current turn is running on a small local model (ollama, lmstudio, llama.cpp, vllm). Implements the do-no-harm floor of the constitutional "I" layer.
advice:
  kind: before
priority: 95
pointcut:
  all_of:
    - 'jointpoint == "call"'
metadata:
  tier: material
  source: safety-policy
  rationale: 'small models are more susceptible to prompt injection into tool use; hard-block web reach until an explicit opt-in'
---

# Small-model web-tool guard

When the current turn is resolved to a **small local model** (provider is `ollama`, `lmstudio`, `llama.cpp`, or `vllm`, or the model metadata is flagged `small: true`), the agent **must not** invoke web-reaching tools.

Blocked tools (matched case-insensitively, and by common aliases):

- `web_fetch`, `webfetch`, `fetch`, `http_get`, `http.get`
- `browser`, `browser_navigate`, `browser_snapshot`, `browser_click`, `browser_type`, `browser_tabs`
- `curl`, `wget`

Policy:

- If a tool call matches the blocklist while the turn is on a guarded provider, refuse the call with a clear reason and ask the user to explicitly route the task to the hosted `advanced` agent.
- Do **not** silently substitute a different tool; the refusal is visible.
- This advice is constitutional (§"Do-no-harm floor"); other concerns cannot override it.

Executable advice lives in `scripts/before_tool_call.js` per the convention in
`specification/SENSE_FORMAT.md` (executable by default).
