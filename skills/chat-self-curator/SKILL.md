---
name: chat-self-curator
description: Normalize a chat-sourced sense candidate into a valid SENSE.md, compute for_me_score with the Beta-Binomial update, choose tier and joinpoint, detect overlap with existing senses. Use when a candidate has been accepted by the user and needs to be turned into a sense package.
---

# Chat-developed agent — Curator

Part of the chat-developed agent pipeline from `specification/CHAT_DEVELOPED_AGENT.md` (§4.2).

## Goal

Turn a rough candidate (name hint, description, advice draft, optional pointcut) into a **valid, installable sense package** with:

- a lowercase slug name,
- a tier (`material`, `social`, `spiritual`, or `meta`),
- a default pointcut bound to the tier's canonical joinpoint,
- starting `for_me_score` state from the Beta prior `(α₀=1, β₀=3)`,
- provenance metadata (source turns, approver, timestamp).

Do **not** generate executable `scripts/` in the MVP. Executable advice is an explicit later opt-in (spec §13 stage 4).

## Scripts

- `scripts/for-me-score.js` — Bayesian Beta-Binomial update (score, lcb, evidence, state transitions).
- `scripts/render-sense.js` — deterministic SENSE.md renderer.
- `scripts/for-me-score.test.js` — verifies the worked example in spec §5.1.7.

## Procedure

1. **Receive a candidate** object:

   ```
   {
     name, description, advice_draft,
     tier_hint?, pointcut?, priority?,
     source_turns, approver
   }
   ```

2. **Normalize tier**.
   - Map the candidate to one of: `material`, `social`, `spiritual`, `meta`.
   - Default to `spiritual` if unclear (most chat-sourced rules are cognitive).

3. **Default the pointcut** using `scripts/render-sense.js` → `JOINTPOINTS_BY_TIER`:
   - `material` → `jointpoint == "initialization"`
   - `social` → `jointpoint == "set"`
   - `spiritual` → `jointpoint == "execution"`
   - `meta` → `jointpoint == "adviceexecution"`

4. **Initialize for_me state** with `for-me-score.js`:

   ```js
   const { initial, observe } = require('./scripts/for-me-score');
   const state = initial();
   observe(state, { signals: ['accept_card'] });
   ```

   - Apply an `accept_card` signal on first Curator run (the user just accepted the Confirmer card).
   - Published fields land on `state.for_me_score`, `state.for_me_lcb`, `state.evidence_n`, `state.priority`, `state.state`.

5. **Check for overlap** with existing senses in `senses/`:
   - Same pointcut AND overlapping keywords in description → propose **consolidation** instead of creating a new sense; return the merged candidate and stop.
   - Near-duplicate name → suffix with a counter (`citation_always_2`).

6. **Render SENSE.md** using `renderSense({ ...candidate, ...state, source_turns, approver })`.

7. **Return** `{ tier, relative_path, sense_md_text, metadata, state }` to the caller (the Confirmer or Persister).

## Output contract

The Curator never writes to disk. It returns a plain object:

```json
{
  "tier": "spiritual",
  "relative_path": "spiritual/citation_always/SENSE.md",
  "sense_md_text": "---\nname: citation_always\n...",
  "metadata": {
    "state": "probation",
    "for_me_score": 0.5,
    "for_me_lcb": 0.311,
    "evidence_n": 2,
    "alpha": 3,
    "beta": 3,
    "priority": 50
  }
}
```

The Persister consumes this contract.

## Invariants

- **Never write to `senses/.constitution/`** (the "I" layer, per spec §8 IEM boundary).
- **Never generate executable `scripts/`** in the MVP.
- **Never mutate existing stable senses** without a Confirmer card (spec §5 prediction error handling).

## Running the tests

```bash
cd skills/chat-self-curator
node scripts/for-me-score.test.js
```

All 13 assertions should pass. Any failure indicates the formula drifted from spec §5.1.
