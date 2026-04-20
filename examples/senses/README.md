# Example sense packages

Concrete senses for demos, regression, and copy-paste. Each immediate subdirectory is one **sense package** (see `specification/SENSE_FORMAT.md`).

To use with OpenClaw: copy selected folders into your workspace `senses/` (so they sit next to each other as sibling directories), or point `resolvePath("senses")` at this `examples/senses` path while developing.

Validate locally: `cd senses-ref && uv run senses-ref validate-tree ../examples/senses`.
