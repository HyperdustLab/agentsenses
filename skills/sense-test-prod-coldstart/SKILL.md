---
name: sense-test-prod-coldstart
description: Regression playbook — example_preinitialization (first process prompt + production wording).
---

# Sense regression: production cold start → preinitialization

**Goal:** see whether **`example_preinitialization`** inserts a **one-shot** “highest caution” reminder only on the **first prompt build in the process** when the context mentions **production environment** or **production database**.

## Prerequisites

- Keep `examples/senses/example_preinitialization`.  
- **Required:** after restarting the Gateway (or whole OpenClaw process), the **first** message or system slice that enters prompt build must include **production environment** or **production database**.

## Sub-experiment A (match)

**Send as the first message after cold start**  
“This session runs in **production environment**. List three highest-risk constraints you will follow.”

**Observe**  

- Besides the assistant answer, check the **first turn** for extra weave related to the sense (log `weave @preinitialization`).  
- Wording should skew **conservative, auditable, assume worst-case failure** (aligned with the sense body).

## Sub-experiment B (control)

After restart, first message **without** “production environment / production database”, e.g. “Hi, introduce yourself.”

**Observe**  
The **NL clause** of `example_preinitialization` should not hold — do not expect this sense to fire for a non-prod demo.

## Teaching point

Contrast **process-level one-shot** vs **every-turn execution**: preinit is **not** on every message; if the demo fails, ask whether it was a **real cold start** and whether the **first message had production wording**.
