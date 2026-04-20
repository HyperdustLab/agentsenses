# Agent Senses

**Agent Sense** is **the self-reflective layer of an AI agent** — a declarative crosscutting layer that **injects prompt into the model’s context** at pipeline boundaries, so the agent can **re-read constraints and align its own behavior** before/while acting, rather than only executing opaque tool loops.

In plain terms: it **weaves prompts at boundaries** such as *into the model*, *outbound messages*, and *tool calls*, so the model **explicitly checks rules** while generating and acting, instead of burying compliance and safety only inside a single opaque prompt.

This repo ships an **OpenClaw** **Senses** plugin and examples: **weave declarative advice into context at the model’s I/O edges** without putting business logic into Sense Client code.

## What Agent Senses are

A **Sense** is one **crosscutting concern** (security, citation style, web-use posture, compliance hints, and so on). Each sense is a small **model-facing policy spec**; stacking several senses forms the **self-reflective layer** above.

- **Pointcut**: under which **logical join point**, **task/skill**, or **natural-language condition** it applies.
- **Advice**: the **Markdown body** merged into the prompt when it fires, meant for the **LLM** to follow — not for the Sense Client to execute with TypeScript `if/else`.

The design borrows **AspectJ** *join point / pointcut / advice* vocabulary, but the runtime is **LLM + OpenClaw hooks**, not JVM bytecode.

### Skill vs Sense (short)


|                 | **Skill**                                         | **Sense**                                              |
| --------------- | ------------------------------------------------- | ------------------------------------------------------ |
| Main goal       | Teach **how to use tools / do a class of task**   | Apply **constraints or style** across many task paths  |
| Typical content | Steps, commands, workflows                        | Policy, red lines, compliance phrasing, citation rules |
| How it applies  | Via the skill list and instructions in the prompt | **Conditionally woven** by the plugin via pointcuts    |


They can coexist: a Skill says **what to do**; a Sense says **the floor you must hold no matter the task**.

## AspectJ vs Agent Senses

Agent Senses **reuse** AspectJ terms (join point, pointcut, advice, `execution` / `call` / `get` / `set`, …) but the **semantic domain differs**: AspectJ talks about the **program execution graph**; Agent Senses talk about the **agent pipeline plus model-facing text**. The table below helps if you know AspectJ.


| Dimension                           | **AspectJ**                                                            | **Agent Senses**                                                                                                                                                                                                                      |
| ----------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Weaving target**                  | Classes, methods, fields, call sites on the JVM                        | OpenClaw events and **aggregated model text** (user messages, history, tool-arg snippets, outbound body, …)                                                                                                                           |
| **Join point**                      | Fine-grained, typed (e.g. method execution/call, field get/set)        | **A small set of logical kinds** (`execution`, `call`, `get`, `set`, `initialization`, …) mapped to hooks by the plugin; authors use **logical names**, not usually raw hook names exposed by the Sense Client                        |
| **Pointcut language**               | `execution(..)`, `within(..)`, `call(..)` tied to **signatures/types** | Same **designator names** and `jointpoint == "…"`; plus **natural-language substrings**, `/regex/flags`, and `task.requires_web`, `skill == "…"`, …                                                                                   |
| **“Execute / call / read” analogy** | Real execute / call / get in bytecode                                  | **Semantic analogy**: e.g. main model step ≈ execution, before tool call ≈ call, final payload to the provider ≈ get; user phrases like “run / call / check balance” can still match via **NL pointcuts** on the **same prompt edge** |
| **Advice shape**                    | Arbitrary Java (@Before / @After / @Around)                            | **Markdown policy**; the **LLM** carries out its “meaning” in context, not the Sense Client’s imperative interpreter                                                                                                                  |
| **Weaving implementation**          | Compile-time or load-time bytecode transform                           | **Runtime** string prepend / `llm_input` rewrite / outbound `message_sending`, … (see the plugin)                                                                                                                                     |
| **Observability**                   | Debugger, aspect stack                                                 | **NOTICE**, logs with `weave @<jointpoint>`, and changed model behavior                                                                                                                                                               |


**One line**: in AspectJ a join point is a **coordinate in code**; in Agent Senses it is a **logical edge on the agent pipe**. Pointcuts may mix **structured predicates** and **natural language** aligned with what the **LLM** actually reads.

## Repository layout

```
agentsenses/
├── specification/             # Sense format spec + Sense Client integration notes
├── senses-ref/                # Python reference: validate / read-properties (like Agent Skills skills-ref)
├── openclaw-senses-plugin/   # OpenClaw plugin (load senses, match pointcuts, weave)
├── examples/senses/           # Concrete example / product-shaped sense packages
└── skills/                    # Optional: test / explainer skills paired with senses
```

The **format** is `specification/SENSE_FORMAT.md`. **Sense Clients** (runtimes that implement weaving beyond OpenClaw) should read `specification/ADDING_SENSES_SUPPORT.md`. This README stays focused on motivation and architecture.

**CI / authoring:** validate example packs with `cd senses-ref && uv run senses-ref validate-tree ../examples/senses` (see `senses-ref/README.md`).

## Authoring and install (summary)

1. Add a **sense package** directory with `SENSE.md` (YAML frontmatter + Markdown advice body), or the legacy `sense.yaml` + `prompt.md` pair.
2. Install packages under the OpenClaw workspace `senses/` as **sibling subdirectories** (one folder per sense), or point `resolvePath("senses")` at a directory whose children are those folders.
3. Enable `@local/openclaw-senses` and restart the Gateway.

Full field tables, pointcut grammar, and hook mapping: `specification/SENSE_FORMAT.md`.

**OpenClaw 本机安装（插件 + `workspace/senses/` + 重启）：** `specification/OPENCLAW.md`。

## Examples and regression

- `examples/senses/example_*`: examples by jointpoint (includes placeholder senses).
- `examples/senses/safety_sense`, `citation_sense`, `web-answer`: more product-shaped examples.
- `skills/sense-test-full-playbook`: a coach skill that walks a human through **staged** crosscutting checks.

## Plugin and development

- Source: `openclaw-senses-plugin/index.ts`
- Build: `cd openclaw-senses-plugin && npx tsc --noEmit`
- Manifest: `openclaw-senses-plugin/openclaw.plugin.json`

Jointpoint↔hook mapping is summarized in `specification/SENSE_FORMAT.md`; NOTICE behavior, `llm_input`, and other implementation details are in the **header comment** of `index.ts`.

## Project maturity and release readiness

- Current maturity: **beta / early adopter** (`0.1.x` line).
- Release checklist and exit criteria: `RELEASE_READINESS.md`.
- Vulnerability disclosure process: `SECURITY.md`.
- Release notes: `CHANGELOG.md`.

## License and contributing

- **License:** [Apache License 2.0](LICENSE).
- **Contributing:** see [CONTRIBUTING.md](CONTRIBUTING.md).
- **Security:** see [SECURITY.md](SECURITY.md).
- **Changelog:** see [CHANGELOG.md](CHANGELOG.md).

