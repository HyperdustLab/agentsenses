# Example concern packages

Concrete concerns for demos, regression, and copy-paste. Each immediate subdirectory is one **concern package** (see `specification/SENSE_FORMAT.md`).

To use with OpenClaw: copy selected folders into your workspace `concerns/` (so they sit next to each other as sibling directories), or point `resolvePath("concerns")` at this `examples/concerns` path while developing.

Validate locally: `cd concerns-ref && uv run concerns-ref validate-tree ../examples/concerns`.
