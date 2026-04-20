# Sense format specification

This document defines the **portable Sense package** format used with the OpenClaw Senses plugin. Runtime behavior (hook mapping, NOTICE, haystack construction) lives in `openclaw-senses-plugin/index.ts`; this file is the **author-facing contract** for `SENSE.md` and legacy layouts.

## Directory layout

A **sense package** is a single directory that contains one of:

| Layout | Files | Status |
| ------ | ----- | ------ |
| **Preferred** | `SENSE.md` (YAML frontmatter + Markdown body) | Use for new senses |
| **Legacy** | `sense.yaml` + `prompt.md` | Still supported |

The directory name is for humans only. The canonical identifier is `name` in the metadata. For **strict validation** (see `senses-ref` below), `name` must follow the grammar in [Allowed `name` grammar](#allowed-name-grammar); matching the parent directory name is recommended but not required by the OpenClaw plugin.

At runtime, the plugin loads **only immediate subdirectories** of the workspace `senses/` folder (or the path returned by `resolvePath("senses")`). Each subdirectory that contains a valid sense file set becomes one loaded sense.

### Interoperability paths (optional)

To mirror [Agent Skills](https://agentskills.io) `.agents/skills/` discovery, implementations **may** scan:

| Scope | Path |
| ----- | ---- |
| User | `~/.agents/senses/` |
| Project | `<project>/.agents/senses/` |

These paths are **not** required for OpenClaw; they are a suggested convention so multiple tools can share the same sense tree.

## `SENSE.md` structure

The file MUST start with YAML frontmatter delimited by `---`, then a Markdown body after the closing `---`.

The Markdown body is the **advice**: natural-language policy intended for the **LLM**, not imperative Sense Client code.

### Frontmatter fields

Only the keys below are in the **authored surface** for tooling (`senses-ref`). Other keys should be treated as errors by validators (Sense Clients may still ignore unknown keys at runtime until they tighten).

| Field | Required | Meaning |
| ----- | -------- | ------- |
| `name` | Yes | Unique logical name for logs and NOTICE. |
| `description` | No | Short human summary (max 1024 characters for validation). |
| `advice` | No | Mapping with optional `kind`: `before` / `after` / `around`. |
| `mode` | No | Legacy synonym for `advice.kind` (same enum). Prefer `advice.kind`. |
| `priority` | No | Integer; higher numbers weave earlier when multiple senses match the same turn. |
| `pointcut` | No | Mapping with only `all_of`, `any_of`, and/or `not`, each a list of **strings** (see below). |
| `jointpoints` | No | List of strings (documentational for authors). |
| `modulation` | No | Mapping with optional `type`: `inhibitory` / `excitatory` / `gating` / `mixed`. |
| `license` | No | License string or SPDX id (tooling). |
| `metadata` | No | String-to-string map for client-specific labels. |
| `compatibility` | No | Free-text environment hints (optional; parity with Agent Skills frontmatter). |

#### Allowed `name` grammar

For validation and CI:

- 1–64 characters after trim and Unicode NFKC normalization.
- Lowercase ASCII only.
- Characters: letters `a–z`, digits `0–9`, hyphen `-`, underscore `_`.
- Must not start or end with `-` or `_`, and must not contain `--` or `__`.

### Reference validation (`senses-ref`)

This repository ships **`senses-ref/`**, a small Python tool (similar in spirit to Agent Skills `skills-ref`):

- `senses-ref validate <package_dir>` — one sense package.
- `senses-ref validate-tree <senses_root>` — every immediate subdirectory that looks like a package.
- `senses-ref read-properties <package_dir>` — JSON view of frontmatter (+ short body preview).

Use it in CI to keep `examples/senses/` and your private trees consistent with this spec.

### Minimal example

```markdown
---
name: my_policy
description: Short note on what this sense governs.
advice:
  kind: before
priority: 10
pointcut:
  all_of:
    - 'jointpoint == "execution"'
  any_of:
    - sensitive operation
    - task.requires_web == true
---

When the user or context involves a sensitive operation or web use: state basis and boundaries first; do not invent unauthorized data.
```

## Pointcut language

Each of `pointcut.all_of`, `pointcut.any_of`, and `pointcut.not` is a list of **string conditions**. Semantics are implemented by the plugin (`evalCondition`); authors should treat the following as the stable surface:

### Logical join points

Use explicit tests or AspectJ-style no-arg designators, e.g.:

- `jointpoint == "execution"`, `execution()`, …
- `jointpoint == "call"`, `call()`, …
- `jointpoint == "get"`, `get()`, …
- `jointpoint == "set"`, `set()`, …
- `initialization`, `preinitialization`, `staticinitialization`, `handler`, …

**Legacy alias:** `jointpoint == "prompt"` is equivalent to **`execution`**.

Reserved logical kinds may exist for naming alignment (e.g. `adviceexecution`, `synchronization_lock`) without a matching hook in the Sense Client yet; see plugin logs and `matchSensesForJointPoint` behavior.

### Task / skill predicates

Examples (exact set depends on context the Sense Client passes into the plugin):

- `task.requires_web == true`
- `skill == "web_answer"`

### Natural language and regex

- Any unstructured string → **case-insensitive substring** match on aggregated model-related text (**verb haystack**).
- A leading `/` starts a **regular expression**: `/pattern/flags`.

### Composition

`all_of`, `any_of`, and `not` **may be mixed** with jointpoint, skill, task, and natural-language atoms in one sense.

## Logical join point ↔ OpenClaw hooks

Authors use **logical** joint names; the plugin maps them to OpenClaw hooks. Canonical mapping (see `openclaw-senses-plugin/index.ts` header):

| Logical kind | Typical hook |
| ------------ | ------------ |
| `preinitialization` | first `before_prompt_build` pass (early) |
| `staticinitialization` | first `before_prompt_build` pass (after preinit) |
| `execution` | `before_prompt_build` (main pass) |
| `initialization` | `before_agent_start` |
| `call` | `before_tool_call` |
| `get` | `llm_input` |
| `set` | `message_sending` |
| `handler` | `error` (if exposed) |

## Legacy format

`sense.yaml` holds metadata; `prompt.md` holds the advice text. Prefer **`SENSE.md`** for new packages.

## Workspace install

Copy or symlink sense **package directories** into the OpenClaw workspace `senses/` (e.g. `~/.openclaw/workspace/senses/`), or point `resolvePath("senses")` at a directory whose **children** are those packages. Enable `@local/openclaw-senses` and restart the Gateway.

Step-by-step for local OpenClaw: **[`OPENCLAW.md`](./OPENCLAW.md)**.

Example packs shipped with this repo live under **`examples/senses/`**; copy the subtrees you need into your workspace `senses/`.

## Sense Client integration

For a Sense Client–agnostic integration checklist (discovery, progressive disclosure, hook mapping, coexistence with Agent Skills), see **[`ADDING_SENSES_SUPPORT.md`](./ADDING_SENSES_SUPPORT.md)**.

**Terminology:** A **Sense Client** is to Agent Senses what a **Skill Client** is to [Agent Skills](https://agentskills.io)—the product or runtime that discovers packages, wires hooks, and applies the format.
