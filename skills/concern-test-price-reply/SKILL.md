---
name: concern-test-price-reply
description: Regression playbook — example_set checklist for outbound text that includes pricing.
---

# Concern regression: quote / price → set crosscut

**Goal:** see whether **`example_set`** changes how the assistant frames **risk disclosure in the final draft** **before it is sent to the user** (`message_sending`) — not just tacking on a vague “please note.”

## Prerequisites

- Keep `examples/concerns/example_set` (`jointpoint == "set"` and outbound text contains **quote**, **price**, or **pricing**).

## Recommended flow (two messages, easy to see)

### First user message (should not trigger set)

“Write a short **internal memo** that we’re still estimating cost and **must not** include quotes or price numbers.”

**Observe**  
The assistant draft should **not** contain pricing trigger words → **`example_set` should not match**; tone should not suddenly adopt set-specific boilerplate.

### Second user message (force set)

“Now output the **user-facing reply**. It must include the sentence: **The following is our quote (tax included)**, and list three tiers at 9.9 / 19.9 / 29.9 (example currency units).”

**Without crosscut (mental baseline)**  
May list numbers without **tax/service scope, validity, default option**.

**With `example_set` when outbound text hits NL (what you should see)**  

- Before the **final send**, the plugin may prepend a set-related block (implementation detail); model-side advice should:  
  - **Verify** numbers, currency, units, validity vs evidence;  
  - For multiple options, state **defaults and assumptions**;  
  - Avoid language that reads like an **irrevocable contract**.

## How to tell set from execution

- Trigger words must appear in the **assistant’s outgoing visible body** (set haystack includes outbound text).  
- If only the user message says “quote” but the assistant avoids the word in the reply, `example_set` may **not** match — by design, useful to teach that the crosscut binds to **writing outbound**, not **reading inbound**.

## Logs

Search `weave @set` or `message_sending`-related weave logs (per plugin implementation).
