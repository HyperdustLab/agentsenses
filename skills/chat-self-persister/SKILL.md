---
name: chat-self-persister
description: Write an accepted sense candidate to the workspace senses/ directory in the correct tier folder, append a tamper-evident audit log entry, and enforce the IEM boundary (never writes to .constitution, never creates executable scripts in the MVP). Supports create, update, archive, and stage actions.
---

# Chat-developed agent — Persister

Part of the chat-developed agent pipeline from `specification/CHAT_DEVELOPED_AGENT.md` (§4.4 and §8).

## Goal

Turn a Curator output + a user's acceptance into an **installed sense package**. Record the decision so it can be reverted.

The Persister is the only component in the pipeline that touches the filesystem. Every other skill produces or consumes strings.

## Scripts

- `scripts/write-sense-package.js` — `persist`, `archive`, `stage` functions + guards.

## Target layout

```
<workspace>/senses/
├── material/<name>/SENSE.md
├── social/<name>/SENSE.md
├── spiritual/<name>/SENSE.md
├── meta/<name>/SENSE.md
├── .staging/<tier>/<name>/SENSE.md
├── .archive/<tier>/<name>.<timestamp>/SENSE.md
└── .audit.log
```

`.constitution/` is **never** written by this skill. That directory is the "I" layer (see spec §8).

## Procedure

1. Receive the Curator's output:

   ```
   { tier, name, sense_md_text, metadata, approver }
   ```

2. Validate:
   - `tier` ∈ `{material, social, spiritual, meta}` — reject `constitution` or anything else.
   - `name` matches the strict slug regex.
   - `sense_md_text` does **not** contain `executable:` or `scripts:` in YAML frontmatter (MVP rule).

3. Call `persist(...)`. On success it returns:

   ```
   { path, audit_id, action: "create" | "update" }
   ```

4. Append a JSONL record to `<senses>/.audit.log`:

   ```json
   {
     "ts": "...",
     "action": "create|update|archive|stage",
     "candidate": "<name>",
     "tier": "<tier>",
     "approver": "<user>",
     "path": "<relative>",
     "prev_hash": "<sha256 or null>",
     "new_hash": "<sha256>",
     "audit_id": "<16-hex>"
   }
   ```

5. Return the result to the Confirmer. The Confirmer tells the user what was written and the `audit_id` to use for `/senses revert`.

## Other actions

- **archive**(`tier`, `name`) — moves `senses/<tier>/<name>` → `senses/.archive/<tier>/<name>.<timestamp>`. Soft delete.
- **stage**(`tier`, `name`, `sense_md_text`) — writes under `.staging/` only. Use when the Confirmer says "defer".

## Refusal matrix

| Input | Action | Why |
|---|---|---|
| `tier = "constitution"` | **refuse** | IEM boundary |
| `tier` not in allowed set | refuse | spec §3 tiers |
| `name` not matching slug regex | refuse | spec `SENSE_FORMAT.md` |
| `sense_md_text` contains `executable:` | refuse | MVP stage 1 only |
| `sense_md_text` contains `scripts:` key | refuse | MVP stage 1 only |
| existing sense is `stable` or `core` without `replace: true` | refuse | must go through Confirmer conflict card |

## Revert flow

`/senses revert <audit_id>` (handled by the Confirmer) reads the audit log, finds the matching entry, and:

- for a `create` → archive the created file;
- for an `update` → restore `prev_hash` from the archive, or from an object store if configured;
- for an `archive` → move back from `.archive/` to the live tier;
- for a `stage` → delete the staging entry.

The Persister refuses to revert anything older than the N=30 most recent audit entries by default (configurable). This matches spec §11.

## Invariants

- **Atomic per file.** One `persist()` call writes exactly one `SENSE.md`.
- **Never silent.** Every write is mirrored to `.audit.log`.
- **Path-safe.** All `persist`/`archive`/`stage` paths are checked to be inside `sensesRoot` before any filesystem operation.
- **MVP executable lock.** The frontmatter filter is checked by string pattern **and** by YAML parse in future revisions.

## Running the smoke test

```bash
cd /Users/moss/agentsenses
node -e '
  const {persist, archive, stage} = require("./skills/chat-self-persister/scripts/write-sense-package");
  const {renderSense} = require("./skills/chat-self-curator/scripts/render-sense");
  const os = require("node:os"), fs = require("node:fs"), path = require("node:path");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "senses-mvp-"));
  const text = renderSense({ name: "foo", tier: "spiritual", advice_draft: "be brief" });
  const r = persist({ sensesRoot: root, tier: "spiritual", name: "foo", sense_md_text: text });
  console.log(r);
'
```
