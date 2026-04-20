---
name: sense-test-reserved-joints
description: Notes — how to treat placeholder senses for adviceexecution / sync_lock / sync_unlock (no hooks yet).
---

# Sense notes: reserved jointpoints (not verifiable in chat today)

`examples/senses/example_adviceexecution`, `example_sync_lock`, and `example_sync_unlock` exist to **align names with AspectJ** and hold a place; the plugin **does not** set `ctx.jointpoint` to these values, so:

- They **cannot** be triggered from chat phrasing alone.  
- Logs **should not** show `weave @adviceexecution`, etc.

## How a team can still “validate” placeholders

1. **Design review**: read the `SENSE.md` body and check expectations if the Sense Client later adds matching hooks.  
2. **After implementation**: map that jointpoint in the plugin, then add a **real regression playbook** in the `sense-test-*` style.

## What not to do

Spamming keywords in chat hoping for a hit only wastes time; label these clearly as **“not implemented — do not test in chat.”**
