---
name: example_set
description: Example crosscut — set (before outbound message is written).
advice:
  kind: before
priority: 1
pointcut:
  all_of:
    - 'jointpoint == "set"'
  any_of:
    - quote
    - price
    - pricing
---

When the assistant’s outgoing body already contains words like **quote**, **price**, or **pricing**: before sending, verify numbers, currency, units, and validity against the evidence; if several options exist, state defaults and assumptions clearly so the user does not read it as final contract language.
