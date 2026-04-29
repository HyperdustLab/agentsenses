---
name: chat-self-heartbeat
description: Keep the agent self-aware between chat turns — apply time-based decay to every Sense's for_me_score and diff the workspace to surface new or changed files. Run on OpenClaw heartbeats (and any cron) so the self-layer updates even when the user isn't typing. Depends on chat-self-curator.
---

# Chat-developed agent — Self heartbeat

Part of the chat-developed agent pipeline from `specification/CHAT_DEVELOPED_AGENT.md` (§5 + §5.1.4).

## Goal

Self-senses must **not** be turn-based. Time passes and the workspace changes without any chat activity. This skill runs a single idempotent tick that:

1. **Decays** each installed Sense's Beta state by the minutes elapsed since that Sense's last tick (disuse → uncertainty, per spec §5.1.4). State promotion / demotion thresholds are re-evaluated after decay.
2. **Diffs** the workspace against the previous snapshot and lists added / modified / removed files so the agent sees environmental change.
3. Emits a concise report (human or JSON) that the agent can read directly in a heartbeat turn.

The tick is **idempotent**: running it twice in quick succession does nothing the second time (decay by 0 minutes, identical snapshot).

## Scripts

- `scripts/tick.js` — single entry point.

```
node scripts/tick.js           # human-readable report to stdout
node scripts/tick.js --json    # machine-readable report
node scripts/tick.js --no-diff # decay only
node scripts/tick.js --no-decay# workspace diff only
```

No arguments required. Workspace is inferred from `$OPENCLAW_WORKSPACE` or defaults to `~/.openclaw/workspace`.

## Where state lives

Runtime state is kept in **sidecar files**, never in `SENSE.md` (SENSE.md stays authored):

```
<workspace>/senses/<name>/.state.json        # per-sense Beta state (α, β, score, last_tick, ...)
<workspace>/state/chat-self-heartbeat/
├── workspace-snapshot.json                 # last known file list (path, mtime, size)
└── last-tick.json                          # last tick timestamp
```

This layout does not interfere with the OpenClaw Senses plugin, which only reads `SENSE.md` / `sense.yaml` / `prompt.md`.

## When to run

Three natural trigger points:

- **OpenClaw heartbeat** — add the command below to `~/.openclaw/workspace/HEARTBEAT.md` so the agent runs it roughly every 30 minutes along with the user's other periodic checks.
- **Cron** — `openclaw cron` for precise scheduling (e.g. every 15 min) when heartbeat cadence is not tight enough.
- **Agent discretion** — the agent can invoke it manually when it senses significant time has passed (e.g. at session resume).

Recommended heartbeat entry:

```
## Self-heartbeat (every tick)

Run once per heartbeat to keep the self-layer current:

    node ~/.openclaw/workspace/skills/chat-self-heartbeat/scripts/tick.js

Read the output. If `senses changed > 0` mention the promotion/demotion briefly.
If `workspace added/modified/removed > 0` mention only material file changes
(skip noise like memory/, state/, and session files).
```

## Output contract

The report (human mode) has exactly two sections:

```
## time
- senses scanned: N
- senses changed: K
  - <sense>: <old_state> → <new_state> (score X→Y, after Nm)

## workspace
- added:    A
- modified: M
- removed:  R
  new:   <up to 10 paths, then "(+K more)">
  changed: ...
  gone:    ...
```

In `--json` mode the same fields appear as one object with `{ tickAt, decay, workspace }`.

## Invariants

- **Never edits `SENSE.md`.** All runtime state is in per-package `.state.json` sidecars.
- **Never writes outside the workspace.** All paths are resolved against `$OPENCLAW_WORKSPACE` or `~/.openclaw/workspace`.
- **Skips `.constitution/`**, `.archive/`, `.staging/`, and any other dot-prefixed senses directory.
- **Idempotent.** Two back-to-back runs only record one snapshot and decay by zero minutes.
- **Excludes noisy paths** from workspace diffs by default: `node_modules/`, `.git/`, `sessions/`, `state/`, `memory/`. Adjust `SNAPSHOT_EXCLUDE_DIRS` in the script to change.

## Dependencies

- **`chat-self-curator`** must be installed in the same `skills/` directory — the tick script imports `scripts/for-me-score.js` from it for the Beta-Binomial update math.

## Relationship to the design doc

| Design section | Implemented here |
|---|---|
| §5 predictive-coding loop | Decay pass = "nothing happened this tick, reduce confidence". |
| §5.1.4 "decay ≠ reject" | `tickDecay` pulls α, β toward prior, never below. |
| §5.1.5 promotion/demotion thresholds | Re-evaluated after every decay; new state is published to the sidecar. |
| §13 stage 2 (for_me scoring) | Adds the time-based portion that pure chat turns were missing. |
| §6 meta-senses | Not implemented here; this tick stays observational. Meta-senses that act on the tick report come in stage 3. |
