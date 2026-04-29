---
name: chat-self-observer
description: Scan recent chat turns for rule-like statements and produce candidate senses, plus classify chat feedback (affirm/correct/silent_success/silent_override) into signals that update existing senses' for_me_score. Use at the end of each turn in a chat-developed agent pipeline.
---

# Chat-developed agent — Observer

Part of the chat-developed agent pipeline from `specification/CHAT_DEVELOPED_AGENT.md` (§4.1).

## Goal

Two jobs per turn:

1. **Detect candidate senses** — regex/keyword scan of the most recent user turns for rule-shaped utterances (e.g. "always X", "never Y", "prefer Z").
2. **Classify feedback** on the previous assistant response — turn the user's reply into a canonical signal (`affirm`, `correct`, `silent_success`, `silent_override`, …) per the weights table in spec §5.1.3.

The Observer is intentionally cheap. It runs on every turn, produces *drafts*, and hands them to the Curator. A slower LLM-based second pass can refine drafts later; the MVP does not require it.

## Scripts

- `scripts/detect-candidates.js` — heuristic detectors.

## Outputs

### Candidate sense (fed to Curator)

```json
{
  "name": "always_cite_sources",
  "description": "Always cite sources when making factual claims",
  "advice_draft": "Always cite sources when making factual claims",
  "tier_hint": "spiritual",
  "confidence": 0.55,
  "source_turns": ["t-0017"],
  "created_at": "2026-04-21T05:52:00Z"
}
```

### Feedback signal map (fed to Curator for existing senses)

```json
{
  "citation_always": ["affirm"],
  "tone_brief":      ["correct"]
}
```

## Procedure

1. Take the last N turns (default 20).
2. For every **user** turn:
   - split into clauses;
   - keep clauses that contain rule verbs (`always`, `never`, `prefer`, `avoid`, `should`, `must`, `stop`, `only use`, `by default`, `when`, `if`);
   - guess a tier from the clause (`material`/`social`/`spiritual`/`meta`);
   - emit a candidate with a `confidence` in `[0, 1]` (higher for explicit `always`/`never`).
3. Drop candidates below the minimum confidence threshold (default 0.35).
4. Drop near-duplicates (same slug).
5. For feedback classification, look at the user's **next** turn after an assistant response. Map its tone to one of:
   - `affirm` — thanks, great, perfect, exactly, yes
   - `correct` — no, don't, stop, wrong, not like that
   - fall through to `silent_success` if the sense fired and the user moved on to a different topic.

## Invariants

- **Read-only.** The Observer never writes to disk.
- **No LLM call required** for the MVP fast path.
- **Per-turn cost bounded.** Scans only the last N turns (default 20).
- Candidates below confidence threshold are dropped, not queued.

## Important authoring intent

When users give process-level corrections about **how senses should be created or enforced** (for example, "this should be done by self-sense development skills"), treat those as **meta-tier sense candidates** and pass them to Curator/Confirmer instead of hardcoding behavior directly.

## Next step

Pass candidates to `chat-self-curator` and the feedback map to the Curator's `observe()` step for each affected sense.
