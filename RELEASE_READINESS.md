# Release Readiness Checklist

This checklist defines the minimum gates for moving from experimental `0.x` toward a stable release line.

## Current release status

- **Project maturity:** Beta / early adopter
- **Recommended tag today:** `0.1.x`
- **Not yet claimed:** General Availability (GA)

## Quality gates

Each release candidate should satisfy all required gates.

| Area | Gate | Required for GA |
| --- | --- | --- |
| Specification | `specification/SENSE_FORMAT.md` reflects implemented behavior | Yes |
| Validation tool | `senses-ref` tests pass | Yes |
| Example correctness | `examples/senses` validates cleanly via `senses-ref validate-tree` | Yes |
| Plugin quality | `openclaw-senses-plugin` typechecks cleanly | Yes |
| Automation | CI runs required checks on PR and `main` | Yes |
| Security process | `SECURITY.md` exists with private reporting process | Yes |
| Release notes | `CHANGELOG.md` updated for each release | Yes |
| Compatibility | OpenClaw compatibility constraints documented | Yes |

## Local verification commands

Run these commands before cutting a release:

```bash
cd senses-ref
uv sync --group dev
uv run pytest
uv run senses-ref validate-tree ../examples/senses
```

```bash
cd openclaw-senses-plugin
npm ci
npx tsc --noEmit
```

## Release flow (recommended)

1. Ensure CI is green for the release PR.
2. Update `CHANGELOG.md`:
   - move release notes from `Unreleased` to a versioned heading
   - include release date
3. Confirm compatibility fields in:
   - `openclaw-senses-plugin/package.json`
   - `openclaw-senses-plugin/openclaw.plugin.json`
4. Tag and publish the release.
5. Announce upgrade notes and known limitations.

## Exit criteria for first stable release (`1.0.0`)

Use this as the minimum bar:

- Multiple real integrations have run on the same format without breaking changes.
- Pointcut and advice semantics are stable across at least one full minor cycle.
- CI has remained green across routine change velocity.
- Security reporting and patch cadence are proven in practice.
