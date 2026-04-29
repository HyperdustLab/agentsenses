---
name: web-answer-concern
description: Fires when the question needs web retrieval / search.
advice:
  kind: before
priority: 100
mode: before
modulation:
  type: excitatory
pointcut:
  all_of:
    - 'jointpoint == "execution"'
    - task.requires_web == true
---

When this concern fires, keep answers concise and prioritize the freshest sources of information.
