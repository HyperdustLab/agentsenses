---
name: citation_sense
description: Enforce citations and evidence for factual claims in responses.
advice:
  kind: before
pointcut:
  all_of:
    - 'jointpoint == "execution"'
  any_of:
    - 'skill == "web_answer"'
    - task.requires_web == true
priority: 10
---

When generating the response, always cite sources for factual claims.
If you reference external information, include the source and explain why it supports the answer.
Do not hallucinate facts, and if you are unsure, state that you do not have enough evidence.
