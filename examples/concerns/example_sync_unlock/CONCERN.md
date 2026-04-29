---
name: example_sync_unlock
description: Placeholder — synchronization_unlock (no Concern Client hook mapping yet).
advice:
  kind: before
priority: 1
pointcut:
  all_of:
    - 'jointpoint == "synchronization_unlock"'
---

Analogous to “leaving a critical section”; no Concern Client hook mapping yet, so it will not match. If an unlock hook is added later, you could require release ordering, consistency, and confirming side effects are persisted.
