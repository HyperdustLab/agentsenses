---
name: example_execution
description: Example crosscut — execution (main model step / prompt build).
advice:
  kind: before
priority: 1
pointcut:
  all_of:
    - 'jointpoint == "execution"'
  any_of:
    - external publish
---

When the dialogue involves **external publish**-style output (announcements, customer-facing docs, regulator-facing materials, …): separate fact from inference; mark unverified data with uncertainty; do not turn internal codenames or draft tone into final external copy.
