# senses-ref

Reference library for the [Agent Senses](../specification/SENSE_FORMAT.md) `SENSE.md` format: parse frontmatter, validate packages, and inspect metadata.

> Intended for **local validation and CI**, not as a runtime substitute for the OpenClaw plugin.

## Install

```bash
cd senses-ref
uv sync --group dev   # or: python -m venv .venv && pip install -e .
```

## CLI

```bash
senses-ref validate path/to/my_sense          # one package directory
senses-ref validate-tree path/to/examples/senses  # all immediate sub-packages
senses-ref read-properties path/to/my_sense   # JSON metadata (+ body preview)
```

## Python API

```python
from pathlib import Path
from senses_ref import validate, read_properties, validate_tree

errs = validate(Path("my_sense"))
props = read_properties(Path("my_sense"))
bad = validate_tree(Path("examples/senses"))
```

## License

Apache-2.0 (see repository `LICENSE`).
