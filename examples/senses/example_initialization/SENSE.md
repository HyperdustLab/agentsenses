---
name: example_initialization
description: Example crosscut — initialization (session / agent start).
advice:
  kind: before
priority: 1
pointcut:
  all_of:
    - 'jointpoint == "initialization"'
  any_of:
    - support ticket
    - customer
---

When the session starts and the context already mentions **support ticket**, **customer**, or similar service wording: establish goal boundaries for this interaction (role, data scope, whether PII is involved). Before identity and authorization are confirmed, do not proactively ask for sensitive identifiers (ID numbers, full card numbers, …).
