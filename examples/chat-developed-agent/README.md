# Chat-developed agent — MVP

This example pack is the **first‑stage implementation** of the design in
[`specification/CHAT_DEVELOPED_AGENT.md`](../../specification/CHAT_DEVELOPED_AGENT.md).

Turn chat into a growing, layered "Me" on top of a stable "I":

- the user talks to the agent;
- an Observer skill proposes candidate senses;
- a Curator normalizes them and attaches a `for_me_score` (Bayesian Beta prior);
- a Confirmer card asks for the user's explicit accept/edit/reject;
- a Persister writes the sense package into the workspace `senses/` tree;
- the existing OpenClaw Senses plugin picks them up and weaves them at joinpoints.

No plugin changes are required.

## Pieces shipped here

| Path | Purpose |
|---|---|
| `examples/chat-developed-agent/CONSTITUTION.md` | Template for the **"I" layer** (identity, invariants, do‑no‑harm floor). Install at `senses/.constitution/CONSTITUTION.md`. |
| `examples/chat-developed-agent/SELF.md` | Concise architecture of self (two-layer "I"/"Me", four Me tiers, learning loop). Install at **`<workspace>/SELF.md`** and reference from `AGENTS.md` so the runtime bootstraps it into every session. |
| `skills/chat-self-observer/` | Heuristic candidate detection + feedback classification. |
| `skills/chat-self-curator/` | Validate tier/name, compute `for_me_score`, render `SENSE.md`. |
| `skills/chat-self-confirmer/` | User-facing card, slash commands, conflict handling, audit log format. |
| `skills/chat-self-persister/` | Filesystem writer: `persist`, `archive`, `stage`. Enforces the IEM boundary. |
| `skills/chat-self-heartbeat/` | Periodic self-tick: time-based decay + workspace diff so the self-layer updates between chat turns. |

## File layout at runtime

```
<workspace>/senses/
├── .constitution/
│   └── CONSTITUTION.md          # the "I" layer (read-only to the pipeline)
├── material/<name>/SENSE.md     # bodily Me
├── social/<name>/SENSE.md       # social Me
├── spiritual/<name>/SENSE.md    # cognitive Me (most chat rules land here)
├── meta/<name>/SENSE.md         # higher-order Me (stage 3, not MVP)
├── .staging/<tier>/<name>/      # deferred candidates
├── .archive/<tier>/<name>.<ts>/ # disowned (reversible)
└── .audit.log                   # JSONL per decision
```

## Install

1. **Constitution**

   ```bash
   mkdir -p ~/.openclaw/workspace/senses/.constitution
   cp examples/chat-developed-agent/CONSTITUTION.md \
      ~/.openclaw/workspace/senses/.constitution/CONSTITUTION.md
   ```

   Edit the identity fields. This file is **not** a sense; the plugin skips dot-prefixed directories.

2. **SELF.md** (architecture the runtime actually loads)

   OpenClaw's session bootstrap reads specific files from the workspace root, not from `senses/.constitution/`. To make the "I"/"Me" architecture visible to every turn:

   ```bash
   cp examples/chat-developed-agent/SELF.md ~/.openclaw/workspace/SELF.md
   ```

   Then add this line under `## Session Startup` in `~/.openclaw/workspace/AGENTS.md` so the runtime lists it in the loaded context:

   ```
   - `SELF.md` — the architecture of self (two-layer "I"/"Me", four Me tiers, learning loop).
     **Always read this before answering any "who are you / what is your self" style question.**
   ```

4. **Skills**

   Enable the five pipeline skills wherever your agent loads Agent Skills:

   - `chat-self-observer`
   - `chat-self-curator`
   - `chat-self-confirmer`
   - `chat-self-persister`
   - `chat-self-heartbeat`

   If you use OpenClaw, `~/.openclaw/workspace/skills/*` is the install point; for other clients follow their Agent Skills install docs.

5. **Heartbeat wiring** (self-awareness between turns)

   Append this block to `~/.openclaw/workspace/HEARTBEAT.md`:

   ```
   ## Self-tick (every heartbeat)

       node ~/.openclaw/workspace/skills/chat-self-heartbeat/scripts/tick.js

   Mention state transitions or material workspace changes briefly; stay silent otherwise.
   ```

6. **Verify**

   ```bash
   cd skills/chat-self-curator && node scripts/for-me-score.test.js         # 13 assertions
   node ~/.openclaw/workspace/skills/chat-self-heartbeat/scripts/tick.js    # first-run snapshot
   node ~/.openclaw/workspace/skills/chat-self-heartbeat/scripts/tick.js    # idempotent re-run
   ```

## End-to-end walkthrough

The following is the exact sequence the skills implement. It is the MVP path from §13 of the spec (stage 1 + stage 2).

### Turn N — user says something rule-shaped

> "Always cite your sources when making factual claims."

Observer (`detect-candidates.js`) extracts:

```json
{
  "name": "always_cite_your_sources",
  "description": "Always cite your sources when making factual claims",
  "advice_draft": "Always cite your sources when making factual claims",
  "tier_hint": "spiritual",
  "confidence": 0.55,
  "source_turns": ["t-N"]
}
```

Observer also treats process/governance chat as meta candidates (for example:
"this should be implemented by self-sense development skills"), so these rules
are learned through the same confirmation pipeline instead of hardcoded edits.

### Curator normalizes + initializes for_me_score

```js
const { initial, observe } = require('chat-self-curator/scripts/for-me-score');
const state = initial();                             // α=1, β=3
observe(state, { signals: ['accept_card'] });         // α=3, β=3
// → for_me_score=0.500, lcb=0.311, n=2, state="probation"
```

Curator renders a valid `SENSE.md`:

```markdown
---
name: always_cite_your_sources
description: Always cite your sources when making factual claims
advice:
  kind: before
priority: 50
pointcut:
  all_of:
    - 'jointpoint == "execution"'
metadata:
  tier: spiritual
  state: probation
  for_me_score: 0.5
  for_me_lcb: 0.311
  evidence_n: 2
  alpha: 3
  beta: 3
  source: chat-developed-agent
---

Always cite your sources when making factual claims.
```

### Confirmer card

```
I noticed a pattern from our recent chat.

Proposed Sense
  name: always_cite_your_sources
  tier: spiritual
  advice: Always cite your sources when making factual claims.

For-me state
  alpha: 3.0  beta: 3.0
  for_me_score: 0.500  lcb: 0.311  n: 2  state: probation

[Accept]  [Edit]  [Reject]  [Ask me again later]
```

For meta-governance rules, Confirmer may use a compact card:

```
Meta-self governance proposal

Rule:
  build this behavior through self-sense development skills, not hardcoded patches

Why it matters:
  keeps behavior changes inside Observer → Curator → Confirmer → Persister

[Accept as meta-sense]  [Edit wording]  [Reject]  [Defer]
```

### Persister writes to disk

```
senses/spiritual/always_cite_your_sources/SENSE.md
senses/.audit.log  (+1 JSONL line)
```

### Turns N+1 … — the sense weaves and learns

Each time the sense fires at `before_prompt_build` (`jointpoint == "execution"`), the user's reaction updates the Beta pseudo-counts per spec §5.1.3:

- user says "thanks" → `affirm` (+1.0 α)
- user corrects → `correct` (+2.0 β)
- user moves on without correcting → `silent_success` (+0.25 α)

Over ~6 positive evidences the sense crosses `score ≥ 0.60, lcb ≥ 0.50, n ≥ 6` and is promoted to **stable**. Priority rises to ~63.

### Disuse

If the sense stops firing for a while, `tickDecay` pulls `(α, β)` back toward the prior `(1, 3)`, lowering confidence without rejecting the sense. Only an explicit `reject_card` or `disable_cmd` can send it to archive.

## What this MVP does **not** do

Deferred to later stages of the design (§13 of the spec):

- **No meta-senses.** The stage-3 `adviceexecution` weaving is not implemented here.
- **No executable advice.** The Persister blocks any SENSE.md that declares `executable:` or `scripts:`. Stage 4 of the spec is explicit opt-in.
- **No tier-aware plugin discovery.** Senses under `senses/<tier>/<name>/` are not automatically loaded by the current plugin unless you flatten or symlink them. Until the plugin gains tier-aware scanning (stage 5), use either:
  - **Flat workaround**: install to `senses/<tier-prefix>_<name>/` and keep `metadata.tier` for categorization.
  - **Symlink workaround**: symlink each `senses/<tier>/<name>` directory up to `senses/<name>` as well, so the plugin discovers it.

A follow-up PR will add tier-aware scanning to `openclaw-senses-plugin/index.ts`.

## Relationship to the design doc

| Design section | Implemented by |
|---|---|
| §4.1 Observer | `skills/chat-self-observer/` |
| §4.2 Curator | `skills/chat-self-curator/` |
| §4.3 Confirmer | `skills/chat-self-confirmer/` |
| §4.4 Persister | `skills/chat-self-persister/` |
| §5.1 `for_me_score` formula | `chat-self-curator/scripts/for-me-score.js` |
| §5.1.7 Worked example | `chat-self-curator/scripts/for-me-score.test.js` |
| §8 IEM boundary | `write-sense-package.js` guards + `.constitution/` skip |
| §9 File layout | this README + `write-sense-package.js` |

## Further reading

- [`specification/CHAT_DEVELOPED_AGENT.md`](../../specification/CHAT_DEVELOPED_AGENT.md) — full design.
- [`specification/SENSE_FORMAT.md`](../../specification/SENSE_FORMAT.md) — sense package contract.
- Woźniak (2018). ["I" and "Me": The Self in the Context of Consciousness.](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2018.01656/full)
