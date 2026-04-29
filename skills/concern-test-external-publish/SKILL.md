---
name: concern-test-external-publish
description: Regression playbook — example_execution structure and wording under an “external publish” scenario.
---

# Concern regression: external publish → execution crosscut

**Goal:** see whether **`example_execution`** forces the model to separate **factual statements / inference / unverified claims** instead of blending them into “final-copy” tone.

## Prerequisites

- Keep `examples/concerns/example_execution` (`any_of` includes **external publish**).  
- The user message must contain the phrase **`external publish`** (or a synonym that still substring-matches the haystack); otherwise this concern does not fire.

## Sub-experiment A (crosscut on): customer-facing bulletin draft

**User**  
“We want to **external publish** the paragraph below on the company notice board. Turn it into a formal announcement and label which sentences are fact vs inference.  
(Internal draft) Q3 revenue grew 40% YoY, we’re #1 in customer satisfaction, and competitor X is on the verge of shutting down.”

**Without the crosscut (mental baseline)**  
The model might state unverified claims like “competitor shutting down” as **flat assertions**.

**With `example_execution` (what you should see)**  

- Add **uncertainty** or **delete/rewrite** unsourced or unverifiable claims.  
- Clearly separate **fact / inference / needs verification**.  
- Keep internal codenames and slang out of “final external” copy.

## Sub-experiment B (control): no trigger phrase

**User**  
“Just smooth this text; **do not** present it as external-facing material.” (Do **not** use the words **external publish** anywhere.)

**Observe**  
`example_execution` **should not** reshape structure just from this concern’s pointcut; if the answer is still careful, that is model baseline, not this pointcut.

## Demo for non-technical colleagues

Same model, two turns: **B** avoids the trigger phrase; **A** includes **external publish** — compare **“needs verification / inference” labels** and **softened absolutes**.
