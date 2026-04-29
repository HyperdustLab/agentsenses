---
name: concern-test-compliance-coldstart
description: Regression playbook — example_staticinitialization (first process prompt + audit/compliance wording).
---

# Concern regression: compliance cold start → staticinitialization

**Goal:** see whether **`example_staticinitialization`**, on the **second slice** of the **first prompt build after cold start**, combined with **audit / compliance** context, stresses **traceability and no premature conclusions**.

## Prerequisites

- Keep `examples/concerns/example_staticinitialization` (`any_of`: **audit**, **compliance**).  
- Like `concern-test-prod-coldstart`: needs the **first prompt after a process-level cold start** to satisfy the NL clause.

## Sub-experiment A (match)

**First user message after cold start**  
“We’re about to undergo regulatory **audit**. List how you’ll structure answers to meet **compliance** and traceability.”

**Observe**  

- The assistant should not promise outcomes like “audit will definitely pass” with **no factual material** yet.  
- Should stress **scope, basis, retention, reviewable phrasing** (aligned with the concern).  
- Logs: search `weave @staticinitialization`.

## Sub-experiment B (control)

First message after cold start: “Write a five-character regulated verse.” (No audit/compliance wording.)

**Observe**  
The NL condition for this concern should not fire.

## Joint run with preinitialization (advanced)

1. Craft one **first** message (or system slice) that contains both **production environment** and **compliance**.  
2. Send only that after restart.

**Observe**  
Whether logs show **`preinitialization`** then **`staticinitialization`** weaves in order (ordering is defined inside `before_prompt_build` in the plugin).
