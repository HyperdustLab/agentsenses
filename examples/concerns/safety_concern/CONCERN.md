---
name: safety_sense
description: Apply safety moderation and avoid unsafe or harmful outputs.
pointcut:
  all_of:
    - 'jointpoint == "execution"'
  any_of:
    - open my own crypto wallet
    - '/open\s+my\s+own\s+crypto\s+wallet/i'
    - unlock my crypto wallet
priority: 20
---

Always keep the response safe and avoid generating harmful or disallowed content.
If the user request could lead to unsafe behavior, either refuse politely or provide a safer alternative.
Do not include violent, sexual, hateful, or otherwise unsafe instructions.
