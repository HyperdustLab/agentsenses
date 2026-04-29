---
name: example_call
description: Example crosscut — call (tool-call boundary).
advice:
  kind: before
priority: 1
pointcut:
  all_of:
    - 'jointpoint == "call"'
  any_of:
    - delete
    - overwrite
---

When the tool-call context mentions **delete** or **overwrite** or similar destructive intent: confirm scope first (path, resource id, environment); if impact cannot be determined uniquely from parameters, refuse or switch to read-only preview, and explain risks and what confirmation is needed.
