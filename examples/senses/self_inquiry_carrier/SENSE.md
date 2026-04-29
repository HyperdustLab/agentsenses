---
name: self_inquiry_carrier
description: Carry any open self-heartbeat inquiry into every model turn so the agent is reminded — in its prompt, not just in an instruction file — to ask the user the inquiry (or to web-research it when escalated). This is the AOP-level enforcement for the chat-self-heartbeat inquiry loop.
advice:
  kind: before
priority: 90
pointcut:
  all_of:
    - 'jointpoint == "execution"'
metadata:
  tier: meta
  source: chat-developed-agent
  rationale: 'instructions in HEARTBEAT.md can be deprioritised by the model; this sense injects the inquiry directly into the prompt every turn'
---

# Self-inquiry carrier

When the chat-self-heartbeat pipeline has an open inquiry, this sense injects a compact `<self_inquiry_reminder>` block into the system context on every turn. The agent cannot "forget" to ask while an inquiry is open — the reminder is part of its prompt.

If there are no open inquiries, the sense returns nothing and adds zero tokens.

Source of truth: `state/chat-self-heartbeat/inquiries.json` (maintained by `chat-self-heartbeat/scripts/tick.js`).

Executable advice: `scripts/before_prompt_build.js` (resolved by convention).
