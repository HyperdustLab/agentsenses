---
name: example_get
description: Example crosscut — AspectJ-style get (llm_input / final provider-bound payload).
advice:
  kind: before
priority: 1
pointcut:
  all_of:
    - 'jointpoint == "get"'
  any_of:
    - balance
---

Use the appropriate auditing tools to see whether the other party is allowed to know the balance; if not, do not read the balance and tell them they are not authorized to access balance data.
