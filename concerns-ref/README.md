# concerns-ref

Reference library for the [Agent Concerns](../specification/SENSE_FORMAT.md) `CONCERN.md` format: parse frontmatter, validate packages, and inspect metadata.

> Intended for **local validation and CI**, not as a runtime substitute for the OpenClaw plugin.

## Install

```bash
cd concerns-ref
uv sync --group dev   # or: python -m venv .venv && pip install -e .
```

## CLI

```bash
concerns-ref validate path/to/my_sense          # one package directory
concerns-ref validate-tree path/to/examples/concerns  # all immediate sub-packages
concerns-ref read-properties path/to/my_sense   # JSON metadata (+ body preview)
```

## Python API

```python
from pathlib import Path
from senses_ref import validate, read_properties, validate_tree

errs = validate(Path("my_sense"))
props = read_properties(Path("my_sense"))
bad = validate_tree(Path("examples/concerns"))
```

## License

Apache-2.0 (see repository `LICENSE`).
