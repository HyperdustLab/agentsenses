---
name: concern-test-reserved-joints
description: Notes — how to treat placeholder concerns for adviceexecution / sync_lock / sync_unlock (no hooks yet).
---

# Concern notes: reserved jointpoints (not verifiable in chat today)

`examples/concerns/example_adviceexecution`, `example_sync_lock`, and `example_sync_unlock` exist to **align names with AspectJ** and hold a place; the plugin **does not** set `ctx.jointpoint` to these values, so:

- They **cannot** be triggered from chat phrasing alone.  
- Logs **should not** show `weave @adviceexecution`, etc.

## How a team can still “validate” placeholders

1. **Design review**: read the `CONCERN.md` body and check expectations if the Concern Client later adds matching hooks.  
2. **After implementation**: map that jointpoint in the plugin, then add a **real regression playbook** in the `concern-test-*` style.

## What not to do

Spamming keywords in chat hoping for a hit only wastes time; label these clearly as **“not implemented — do not test in chat.”**
