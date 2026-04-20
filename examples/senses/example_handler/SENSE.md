---
name: example_handler
description: Example crosscut — handler (error / exception path).
advice:
  kind: before
priority: 1
pointcut:
  all_of:
    - 'jointpoint == "handler"'
  any_of:
    - timeout
    - failure
    - failed
---

When the error context mentions **timeout**, **failure**, or similar: give the user actionable next steps (retry, change conditions, who to contact); avoid dumping stack traces and internal hostnames. For recoverable errors, keep a short summary of what the user already entered so they can continue.
