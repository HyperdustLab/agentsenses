"""Parse CONCERN.md and legacy concern.yaml + prompt.md."""

import re
from pathlib import Path
from typing import Any, Optional

import yaml

from .errors import ParseError, ValidationError
from .models import SenseProperties

_CLOSING_FRONTMATTER = re.compile(r"\r?\n---\r?\n")


def find_sense_md(sense_dir: Path) -> Optional[Path]:
    for name in ("CONCERN.md", "concern.md"):
        path = sense_dir / name
        if path.is_file():
            return path
    return None


def parse_frontmatter(content: str) -> tuple[dict[str, Any], str]:
    """Split YAML frontmatter and Markdown body (matches openclaw-concerns-plugin behavior)."""
    text = content.replace("\ufeff", "", 1)
    if not text.startswith("---"):
        raise ParseError("CONCERN.md must start with YAML frontmatter (---)")

    after_open = text[3:].lstrip("\r\n")
    m = _CLOSING_FRONTMATTER.search(after_open)
    if not m:
        raise ParseError(
            "CONCERN.md frontmatter must be closed with a line containing only ---"
        )

    yaml_block = after_open[: m.start()].strip()
    body = after_open[m.end() :].strip()

    try:
        metadata = yaml.safe_load(yaml_block)
    except yaml.YAMLError as e:
        raise ParseError(f"Invalid YAML in frontmatter: {e}") from e

    if not isinstance(metadata, dict):
        raise ParseError("CONCERN.md frontmatter must be a YAML mapping")

    if "metadata" in metadata and isinstance(metadata["metadata"], dict):
        metadata["metadata"] = {str(k): str(v) for k, v in metadata["metadata"].items()}

    return metadata, body


def _load_legacy(sense_dir: Path) -> tuple[dict[str, Any], str]:
    meta_path = sense_dir / "concern.yaml"
    prompt_path = sense_dir / "prompt.md"
    if not meta_path.is_file() or not prompt_path.is_file():
        raise ParseError("Legacy layout requires concern.yaml and prompt.md")
    try:
        meta = yaml.safe_load(meta_path.read_text())
    except yaml.YAMLError as e:
        raise ParseError(f"Invalid YAML in concern.yaml: {e}") from e
    if not isinstance(meta, dict):
        raise ParseError("concern.yaml must be a YAML mapping")
    body = prompt_path.read_text().strip()
    return meta, body


def read_properties(sense_dir: Path) -> SenseProperties:
    """Read frontmatter fields into SenseProperties (minimal validation)."""
    sense_dir = Path(sense_dir)
    sense_md = find_sense_md(sense_dir)
    if sense_md is not None:
        metadata, body = parse_frontmatter(sense_md.read_text())
    else:
        metadata, body = _load_legacy(sense_dir)

    if "name" not in metadata:
        raise ValidationError("Missing required field in frontmatter: name")

    name = metadata["name"]
    if not isinstance(name, str) or not name.strip():
        raise ValidationError("Field 'name' must be a non-empty string")

    advice = (
        metadata.get("advice") if isinstance(metadata.get("advice"), dict) else None
    )
    advice_kind = advice.get("kind") if advice else None
    if isinstance(advice_kind, str):
        advice_kind = advice_kind.strip()
    else:
        advice_kind = None

    mode = metadata.get("mode")
    if isinstance(mode, str):
        mode = mode.strip()
    else:
        mode = None

    desc = metadata.get("description")
    if desc is not None and not isinstance(desc, str):
        raise ValidationError("Field 'description' must be a string when present")

    priority = metadata.get("priority")
    if priority is not None and not isinstance(priority, int):
        raise ValidationError("Field 'priority' must be an integer when present")

    pointcut = metadata.get("pointcut")
    if pointcut is not None and not isinstance(pointcut, dict):
        raise ValidationError("Field 'pointcut' must be a mapping when present")

    jointpoints = metadata.get("jointpoints")
    if jointpoints is not None:
        if not isinstance(jointpoints, list) or not all(
            isinstance(x, str) for x in jointpoints
        ):
            raise ValidationError(
                "Field 'jointpoints' must be a list of strings when present"
            )

    modulation = metadata.get("modulation")
    if modulation is not None and not isinstance(modulation, dict):
        raise ValidationError("Field 'modulation' must be a mapping when present")

    meta_extra = metadata.get("metadata")
    meta_dict: dict[str, str] = {}
    if isinstance(meta_extra, dict):
        meta_dict = {str(k): str(v) for k, v in meta_extra.items()}

    lic = metadata.get("license")
    if lic is not None and not isinstance(lic, str):
        raise ValidationError("Field 'license' must be a string when present")

    preview = body[:280] + ("…" if len(body) > 280 else "")

    return SenseProperties(
        name=name.strip(),
        description=desc.strip() if isinstance(desc, str) else None,
        priority=priority,
        advice_kind=advice_kind,
        mode=mode,
        pointcut=pointcut,
        jointpoints=jointpoints,
        modulation=modulation if isinstance(modulation, dict) else None,
        license=lic.strip() if isinstance(lic, str) else None,
        metadata=meta_dict,
        body_preview=preview or None,
    )
