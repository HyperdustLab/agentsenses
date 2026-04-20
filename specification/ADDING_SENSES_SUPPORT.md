# Adding Agent Senses support to a Sense Client

This guide is for **Sense Client** implementors—any agent runtime, gateway, or IDE integration that loads declarative sense packages and weaves **advice** at pipeline boundaries—mirroring the role of [How to add skills support to your agent](https://agentskills.io/client-implementation/adding-skills-support) (Agent Skills **Skill Clients**) in the ecosystem, but for **crosscutting policy** rather than task playbooks.

**Prerequisites:** read [`SENSE_FORMAT.md`](./SENSE_FORMAT.md) and the header comment in `openclaw-senses-plugin/index.ts` for hook-level behavior.

## Core principle: weave at edges, not in business logic

A **Sense** is model-facing Markdown policy selected by **pointcuts** (joinpoint, task/skill flags, natural-language matches on a **verb haystack**). The **Sense Client** should:

1. **Discover** sense packages (directories with `SENSE.md` or `sense.yaml` + `prompt.md`).
2. On each relevant **lifecycle hook**, build **context** (jointpoint id, haystack text, skill id, task flags, …).
3. **Evaluate** pointcuts and merge matched advice into the prompt or outbound channel according to `priority` and `advice.kind`.
4. **Observe** which senses fired (logs, optional user-visible NOTICE).

Avoid encoding the same rules in imperative `if/else` in Sense Client code; the format is meant to stay **declarative** and portable.

## Progressive disclosure (adapted from Agent Skills)

Agent Skills use a three-tier **catalog → full SKILL.md → resources** model. Senses differ: advice is usually **short**, but many senses may exist. Recommended pattern:

| Tier | Content | When | Cost |
| ---- | ------- | ---- | ---- |
| 1 | `name` + `description` (and optional operator catalog) | Deploy / admin UI | Minimal |
| 2 | Full pointcut + advice body | When a sense **matches** a hook | Per match |
| 3 | Linked assets (if you extend the format later) | Rare | Optional |

Sense Clients are not required to inject Tier 1 into the model context; it is mainly for **humans and tooling** (`senses-ref read-properties`, dashboards).

## Discovery: where sense packages live

The **format does not mandate** a single global path. For **OpenClaw**, the plugin uses `resolvePath("senses")` and expects **immediate child directories**, each one package.

For **cross-tool interoperability** (optional convention, same spirit as `.agents/skills/`):

| Scope | Suggested path |
| ----- | -------------- |
| User | `~/.agents/senses/` |
| Project | `<project>/.agents/senses/` |

Scanners should skip `.git/`, `node_modules/`, and respect depth/token limits like skills clients.

## Hook mapping (logical jointpoints)

Each Sense Client must map its own events to the **logical** jointpoint ids used in pointcuts. The reference OpenClaw mapping is:

| Logical jointpoint | Typical hook / phase |
| ------------------ | -------------------- |
| `preinitialization` | Earliest pass on first prompt build |
| `staticinitialization` | Second pass on first prompt build |
| `execution` | Main model step / prompt build |
| `initialization` | Session or agent start |
| `call` | Before tool / skill invocation |
| `get` | Final payload bound for the model (`llm_input` analogue) |
| `set` | Outbound assistant / user-visible message |
| `handler` | Error / exception path (if available) |

Reserved ids (`adviceexecution`, `synchronization_lock`, …) may exist for naming alignment until a hook exists.

## Verb haystack

For natural-language and regex pointcuts, the Sense Client should aggregate **model-relevant text** for the current step (user/assistant messages, tool names/args snippets, system fragments, outbound body—see plugin `buildVerbHaystack`). Cap length to avoid pathological cost (the reference plugin uses a large character budget with message tail sampling).

## Validation before deploy

Use the **`senses-ref`** CLI in this repository to validate packages in CI:

```bash
cd senses-ref && uv run senses-ref validate-tree ../examples/senses
```

## Coexistence with Agent Skills

**Skills** teach **how** to do a task; **senses** set **crosscutting floors** (safety, citations, web posture). Both can be active: skills appear in the skill list; senses weave **conditionally** at hooks. Document for your users **order of application** (e.g. sense advice prepended before tool loop, skill body loaded on demand).
