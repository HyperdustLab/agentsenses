---
name: example_sync_lock
description: Placeholder — synchronization_lock (no Concern Client hook mapping yet).
advice:
  kind: before
priority: 1
pointcut:
  all_of:
    - 'jointpoint == "synchronization_lock"'
---

Analogous to “entering a critical section”; no OpenClaw hook currently sets `ctx.jointpoint` to `synchronization_lock`, so this will not match. If a lock-semantics hook is added later, you could require mutual-exclusion ordering on one resource, warnings against nested-lock deadlocks, etc.
