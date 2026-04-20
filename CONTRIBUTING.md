# Contributing to Agent Senses

Thank you for your interest in improving Agent Senses. This document describes where different kinds of changes belong and how to work on the repo.

## Types of contributions

### Specification and integration docs

Changes to the portable sense format (`specification/SENSE_FORMAT.md`) or Sense Client integration notes (`specification/ADDING_SENSES_SUPPORT.md`) are welcome: clarifications, edge cases, and optional interoperability paths (e.g. `.agents/senses/`). Keep normative rules aligned with what `senses-ref` enforces, or update both the spec and the validator in the same PR.

### Reference library (`senses-ref/`)

Bug fixes and tests for parsing/validation are welcome. Larger behavioral changes to validation (new required fields, stricter name rules) should be paired with **spec updates** and a short note in the PR so sense authors know what broke.

### OpenClaw plugin (`openclaw-senses-plugin/`)

PRs that fix bugs, improve logging, or align hook mapping with OpenClaw should touch `index.ts` and, when behavior is user-visible, the specification or README.

### Example sense packages (`examples/senses/`)

Adjustments that make examples clearer or more representative are welcome. After editing YAML/Markdown, run:

```bash
cd senses-ref && uv run senses-ref validate-tree ../examples/senses
```

### Skills under `skills/`

Updates that keep playbooks in sync with example paths or plugin behavior are welcome.

## What we are not tracking here

- **Central registry of third-party senses** — this repo is format + reference implementation + examples, not a marketplace.
- **Breaking gateway API changes** without version notes — follow OpenClaw plugin compatibility in `openclaw.plugin.json`.

## Development quick reference

| Component | Command |
| --------- | ------- |
| OpenClaw local setup | See `specification/OPENCLAW.md` |
| Plugin typecheck | `cd openclaw-senses-plugin && npx tsc --noEmit` |
| Sense packages CI | `cd senses-ref && uv sync --group dev && uv run senses-ref validate-tree ../examples/senses` |
| Python tests | `cd senses-ref && uv run pytest` |

For release gates and checklist criteria, see `RELEASE_READINESS.md`.

## Security reports

Please report suspected vulnerabilities privately as described in `SECURITY.md`.

## AI-assisted contributions

If you use AI tools to author a PR, disclose that in the PR description.

## License

Code in this repository is licensed under the [Apache License 2.0](LICENSE) unless a subdirectory specifies otherwise.
