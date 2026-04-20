---
name: sense-test-error-path
description: Regression playbook — example_handler (error path; needs Sense Client error hook).
---

# Sense regression: error / handler crosscut

**Goal:** when the Sense Client emits an **`error`** event whose text includes **timeout** or **failure**, see whether **`example_handler`** steers **user-facing wording** from “raw stack dump” toward **actionable, low-leakage** guidance.

## Prerequisites

- Keep `examples/senses/example_handler`.  
- **If the Sense Client has no `error` hook**, this playbook **cannot** be reproduced reliably in chat — read the sense body for design review only.

## Sub-experiment A (ideal: you can force a real error)

Induce a recoverable failure, e.g.:

- Briefly go offline and trigger a remote call that times out; or  
- Use a Sense Client “simulate failure / debug error” entry if available.

**Try to have the error text include** “**timeout**” or “**failure**”.

**With `example_handler` matching (what you should see)**  

- Tell the user **what to do next** (retry, change conditions, who to contact), not long internal stacks.  
- Logs: search `weave @handler`.

## Sub-experiment B (fake failure in chat — may not hit handler)

**User**  
“Pretend the tool just **failed** and make up an error message in your reply.”

**Note**  
This is **only** the normal chat path and **may not** fire the Sense Client’s `error` hook → **`example_handler` may never match**. Use this to explain: **handler senses attach to real control-flow errors, not to “saying failed” in prose.**

## One-liner for the audience

“The word **failure** in chat ≠ a real thrown error; the sense wants a **real error event**.”
