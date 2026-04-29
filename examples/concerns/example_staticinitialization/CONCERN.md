---
name: example_staticinitialization
description: Example crosscut — staticinitialization (static-init segment of the first prompt build).
advice:
  kind: before
priority: 1
pointcut:
  all_of:
    - 'jointpoint == "staticinitialization"'
  any_of:
    - audit
    - compliance
---

When the first prompt build’s aggregated text already touches **audit** or **compliance**: bind later answers to traceable phrasing (basis, scope, retention). Avoid promising concrete audit outcomes with no context yet.
