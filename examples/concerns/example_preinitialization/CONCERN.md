---
name: example_preinitialization
description: Example crosscut — preinitialization (earliest frame of the first in-process prompt build).
advice:
  kind: before
priority: 1
pointcut:
  all_of:
    - 'jointpoint == "preinitialization"'
  any_of:
    - production environment
    - production database
    - in production
---

Only after a cold process start, on the **first** prompt build, when the context already mentions **production** in a production-context phrase (e.g. **production environment**, **production database**, or **in production**): this frame weaves a reminder to align default policy to the highest caution (logging, redaction, rollback assumptions). For local dev, avoid putting those phrases in system or first user messages to prevent accidental triggers.
