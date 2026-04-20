---
name: example_adviceexecution
description: Placeholder — adviceexecution (runtime does not set this jointpoint yet).
advice:
  kind: before
priority: 1
pointcut:
  all_of:
    - 'jointpoint == "adviceexecution"'
---

This sense only preserves naming alignment with AspectJ *advice execution*; the plugin does not map Sense Client events to this jointpoint yet, so it will not match. If meta-hooks are added later, describe constraints for when “the aspect itself is woven again”.
