---
name: chat-self-confirmer
description: Present chat-sourced sense candidates to the user as an interactive card (accept / edit / reject / defer), handle slash commands for listing, enabling, disabling, reverting senses, and write a per-decision audit trail. Use when a Curator-produced candidate is ready for human-in-the-loop confirmation.
---

# Chat-developed agent — Confirmer (human-in-the-loop)

Part of the chat-developed agent pipeline from `specification/CHAT_DEVELOPED_AGENT.md` (§4.3).

## Goal

Never persist a sense silently. Every new sense, every edit, every conflict with a stable sense must surface to the user as an explicit card with a small set of safe choices, and every decision is recorded in `senses/.audit.log`.

## Contract

The Confirmer does not call the plugin, does not open files. It:

1. Receives a **Curator output** `{ tier, relative_path, sense_md_text, metadata }`.
2. Formats a **card** (plain markdown) and shows it in chat.
3. Collects the user's choice (via button or a fallback slash command).
4. Passes an instruction to the Persister or returns a negative outcome.
5. Appends one line to `senses/.audit.log`.

## Card format

```
I noticed a pattern from our recent chat.

Proposed Sense
  name: citation_always
  tier: spiritual
  pointcut: jointpoint == "execution"
  advice: Always include source links when making factual claims.

For-me state  (Bayesian prior + this turn's accept)
  alpha: 3.0  beta: 3.0
  for_me_score: 0.500  lcb: 0.311  n: 2
  state: probation  priority: 50

Source turns: t-0017, t-0021

[Accept]  [Edit]  [Reject]  [Ask me again later]
```

### Compact meta-governance card (for process rules)

Use this shorter card when the candidate is `tier: meta` and the content is a
pipeline/governance rule (for example, "build this behavior through self-sense
development skills, not hardcoded patches").

```
Meta-self governance proposal

Rule:
  <one-sentence policy from recent chat>

Why it matters:
  Keeps self-development behavior in Observer→Curator→Confirmer→Persister.

Proposed target:
  tier: meta
  pointcut: jointpoint == "adviceexecution"

[Accept as meta-sense]  [Edit wording]  [Reject]  [Defer]
```

Rendering requirements for this compact card:

- Keep it to <= 8 lines before actions.
- Include exactly one "Rule:" line quoting the policy in plain language.
- If accepted, persist through Persister like any other candidate (no
  out-of-band/manual sense creation).

Fallback slash commands (use these when the chat UI does not render buttons):

| Command | Effect |
|---|---|
| `/senses accept <candidate_id>` | Send to Persister; write to `senses/<tier>/<name>/SENSE.md`. |
| `/senses edit <candidate_id>` | Open the candidate for the user to revise before re-submit. |
| `/senses reject <candidate_id>` | Drop the candidate; signal `reject_card` to any related existing sense. |
| `/senses defer <candidate_id>` | Keep in `.staging/`; Observer may re-propose after more evidence. |
| `/senses list [--state probation\|stable\|core\|archive]` | List senses filtered by state. |
| `/senses show <name>` | Print the rendered SENSE.md and its Beta state. |
| `/senses enable <name>` | Record an `enable_cmd` signal (+α). |
| `/senses disable <name>` | Record a `disable_cmd` signal (+β). Keeps the file; stops firing. |
| `/senses revert <audit_id>` | Undo an earlier Persister write (see §11 of the spec). |
| `/senses pending` | Show all `.staging/` candidates. |

## Conflict handling

If the Curator flags overlap with a `stable` sense, **do not** auto-merge. Show a second card:

```
Conflict with existing stable sense: citation_always

Existing (stable, for_me_score 0.82):
  Always cite at least one source URL when making factual claims.

Proposed (from recent chat):
  Prefer inline citations in (Author, Year) style, not URLs.

[Merge]  [Replace]  [Keep both]  [Discard new]
```

- **Merge**: Curator produces a consolidated advice body; Confirmer re-confirms.
- **Replace**: emit `disable_cmd` for existing, accept new.
- **Keep both**: both fire; Observer marks them as potentially conflicting for Meta-sense stage.
- **Discard new**: emit `reject_card` for the new candidate.

## Audit log format

Append one JSONL line per Confirmer decision to `senses/.audit.log`:

```json
{"ts":"2026-04-21T05:52:00Z","action":"accept","candidate":"citation_always","tier":"spiritual","approver":"user","path":"senses/spiritual/citation_always/SENSE.md","prev_hash":null}
```

Required fields: `ts`, `action`, `candidate`, `tier`, `approver`, `path`.  
Optional but recommended: `prev_hash` of the file replaced (for `/senses revert`).

## Rate limits and safety

From spec §8:

- At most **N new senses per day** (default `N=10`). Excess candidates are deferred.
- Executable advice is **not** supported in the MVP — any Curator output containing `scripts/*` should be blocked by the Confirmer with a clear message.
- `.constitution/` is **never** a valid tier target. Reject any candidate attempting to write there.

## Why a human is in the loop here

The Confirmer is the IEM boundary in operation: chat cannot silently grow the Me layer. Every new piece of "self" becomes self only after the user says so, matching the design principle that identity changes are confirmed, not silently inferred.
