"""Validate concern packages against specification/SENSE_FORMAT.md rules."""

import unicodedata
from pathlib import Path
from typing import Any

from .errors import ParseError
from .parser import find_sense_md, parse_frontmatter, _load_legacy

MAX_NAME_LENGTH = 64
MAX_DESCRIPTION_LENGTH = 1024

# Top-level keys allowed in CONCERN.md / concern.yaml frontmatter (strict authoring surface)
ALLOWED_TOP_LEVEL = {
    "name",
    "description",
    "advice",
    "pointcut",
    "priority",
    "mode",
    "jointpoints",
    "modulation",
    "executable",
    "license",
    "metadata",
    "compatibility",
}

ADVICE_KEYS = {"kind"}
POINTCUT_BRANCH_KEYS = {"all_of", "any_of", "not"}
MODULATION_KEYS = {"type"}
EXECUTABLE_HOOK_KEYS = {
    "before_model_resolve",
    "before_prompt_build",
    "before_agent_start",
    "before_tool_call",
    "message_sending",
}
EXECUTABLE_HOOK_CONFIG_KEYS = {"script", "timeout_ms"}
ADVICE_KINDS = frozenset({"before", "after", "around"})
MODULATION_TYPES = frozenset({"inhibitory", "excitatory", "gating", "mixed"})


def _validate_name(name: str) -> list[str]:
    errors: list[str] = []
    if not name or not isinstance(name, str) or not name.strip():
        errors.append("Field 'name' must be a non-empty string")
        return errors

    name = unicodedata.normalize("NFKC", name.strip())

    if len(name) > MAX_NAME_LENGTH:
        errors.append(
            f"Concern name exceeds {MAX_NAME_LENGTH} characters ({len(name)} chars)"
        )

    if name != name.lower():
        errors.append(f"Concern name '{name}' must be lowercase")

    if name.startswith(("-", "_")) or name.endswith(("-", "_")):
        errors.append("Concern name cannot start or end with hyphen or underscore")

    if "--" in name or "__" in name:
        errors.append(
            "Concern name cannot contain repeated hyphen or underscore separators"
        )

    allowed = set("abcdefghijklmnopqrstuvwxyz0123456789-_")
    if not all(c in allowed for c in name):
        errors.append(
            f"Concern name '{name}' may only contain lowercase letters, digits, hyphens, and underscores"
        )

    return errors


def _validate_description(description: Any) -> list[str]:
    if description is None:
        return []
    errors: list[str] = []
    if not isinstance(description, str) or not description.strip():
        errors.append("Field 'description' must be a non-empty string when present")
        return errors
    if len(description) > MAX_DESCRIPTION_LENGTH:
        errors.append(
            f"Description exceeds {MAX_DESCRIPTION_LENGTH} characters ({len(description)} chars)"
        )
    return errors


def _string_list_conditions(value: Any, label: str) -> list[str]:
    if value is None:
        return []
    errors: list[str] = []
    if not isinstance(value, list):
        errors.append(f"pointcut.{label} must be a list of strings")
        return errors
    for i, item in enumerate(value):
        if not isinstance(item, str):
            errors.append(f"pointcut.{label}[{i}] must be a string")
    return errors


def _validate_pointcut(pc: Any) -> list[str]:
    if pc is None:
        return []
    errors: list[str] = []
    if not isinstance(pc, dict):
        errors.append("Field 'pointcut' must be a mapping")
        return errors
    extra = set(pc.keys()) - POINTCUT_BRANCH_KEYS
    if extra:
        errors.append(
            f"Unexpected pointcut keys: {sorted(extra)}; only {sorted(POINTCUT_BRANCH_KEYS)} are allowed"
        )
    for key in POINTCUT_BRANCH_KEYS:
        if key in pc:
            errors.extend(_string_list_conditions(pc[key], key))
    return errors


def _validate_advice(advice: Any) -> list[str]:
    if advice is None:
        return []
    errors: list[str] = []
    if not isinstance(advice, dict):
        errors.append("Field 'advice' must be a mapping")
        return errors
    extra = set(advice.keys()) - ADVICE_KEYS
    if extra:
        errors.append(
            f"Unexpected advice keys: {sorted(extra)}; only 'kind' is allowed"
        )
    kind = advice.get("kind")
    if kind is not None:
        if not isinstance(kind, str) or kind not in ADVICE_KINDS:
            errors.append(f"advice.kind must be one of {sorted(ADVICE_KINDS)}")
    return errors


def _validate_modulation(mod: Any) -> list[str]:
    if mod is None:
        return []
    errors: list[str] = []
    if not isinstance(mod, dict):
        errors.append("Field 'modulation' must be a mapping")
        return errors
    extra = set(mod.keys()) - MODULATION_KEYS
    if extra:
        errors.append(
            f"Unexpected modulation keys: {sorted(extra)}; only 'type' is allowed"
        )
    t = mod.get("type")
    if t is not None and (not isinstance(t, str) or t not in MODULATION_TYPES):
        errors.append(f"modulation.type must be one of {sorted(MODULATION_TYPES)}")
    return errors


def _validate_mode(mode: Any) -> list[str]:
    if mode is None:
        return []
    if not isinstance(mode, str) or mode not in ADVICE_KINDS:
        return [f"Field 'mode' must be one of {sorted(ADVICE_KINDS)} when present"]
    return []


def _validate_executable(executable: Any, sense_dir: Path | None = None) -> list[str]:
    if executable is None:
        return []
    errors: list[str] = []
    if not isinstance(executable, dict):
        errors.append("Field 'executable' must be a mapping")
        return errors
    extra = set(executable.keys()) - EXECUTABLE_HOOK_KEYS
    if extra:
        errors.append(
            f"Unexpected executable keys: {sorted(extra)}; only {sorted(EXECUTABLE_HOOK_KEYS)} are allowed"
        )
    for hook, cfg in executable.items():
        if hook not in EXECUTABLE_HOOK_KEYS:
            continue
        if not isinstance(cfg, dict):
            errors.append(f"executable.{hook} must be a mapping")
            continue
        cfg_extra = set(cfg.keys()) - EXECUTABLE_HOOK_CONFIG_KEYS
        if cfg_extra:
            errors.append(
                f"Unexpected executable.{hook} keys: {sorted(cfg_extra)}; "
                f"only {sorted(EXECUTABLE_HOOK_CONFIG_KEYS)} are allowed"
            )
        script = cfg.get("script")
        if not isinstance(script, str) or not script.strip():
            errors.append(f"executable.{hook}.script must be a non-empty string")
        else:
            script_norm = script.strip().replace("\\", "/")
            if not script_norm.startswith("scripts/"):
                errors.append(
                    f"executable.{hook}.script must be under scripts/ (e.g. scripts/advice.js)"
                )
            elif sense_dir is not None:
                script_path = (sense_dir / script).resolve()
                scripts_root = (sense_dir / "scripts").resolve()
                try:
                    in_scripts = script_path == scripts_root or script_path.is_relative_to(
                        scripts_root
                    )
                except Exception:
                    in_scripts = str(script_path).startswith(str(scripts_root))
                if not in_scripts:
                    errors.append(
                        f"executable.{hook}.script resolves outside package scripts/ directory"
                    )
                elif not script_path.is_file():
                    errors.append(
                        f"executable.{hook}.script does not exist or is not a file: {script}"
                    )
        timeout_ms = cfg.get("timeout_ms")
        if timeout_ms is not None and not isinstance(timeout_ms, int):
            errors.append(f"executable.{hook}.timeout_ms must be an integer when present")
    return errors


def _validate_priority(priority: Any) -> list[str]:
    if priority is None:
        return []
    if not isinstance(priority, int):
        return ["Field 'priority' must be an integer when present"]
    return []


def _validate_jointpoints(jp: Any) -> list[str]:
    if jp is None:
        return []
    if not isinstance(jp, list) or not all(isinstance(x, str) for x in jp):
        return ["Field 'jointpoints' must be a list of strings when present"]
    return []


def _validate_metadata(meta: Any) -> list[str]:
    if meta is None:
        return []
    if not isinstance(meta, dict):
        return ["Field 'metadata' must be a mapping when present"]
    return []


def _validate_compatibility(compat: Any) -> list[str]:
    if compat is None:
        return []
    if not isinstance(compat, str):
        return ["Field 'compatibility' must be a string when present"]
    return []


def validate_metadata(
    metadata: dict[str, Any], sense_dir: Path | None = None
) -> list[str]:
    """Validate parsed frontmatter dict."""
    errors: list[str] = []
    extra = set(metadata.keys()) - ALLOWED_TOP_LEVEL
    if extra:
        errors.append(
            f"Unexpected frontmatter keys: {', '.join(sorted(extra))}. "
            f"Allowed: {', '.join(sorted(ALLOWED_TOP_LEVEL))}."
        )

    if "name" not in metadata:
        errors.append("Missing required field in frontmatter: name")
    else:
        errors.extend(_validate_name(metadata["name"]))

    errors.extend(_validate_description(metadata.get("description")))
    errors.extend(_validate_advice(metadata.get("advice")))
    errors.extend(_validate_pointcut(metadata.get("pointcut")))
    errors.extend(_validate_priority(metadata.get("priority")))
    errors.extend(_validate_mode(metadata.get("mode")))
    errors.extend(_validate_jointpoints(metadata.get("jointpoints")))
    errors.extend(_validate_modulation(metadata.get("modulation")))
    errors.extend(_validate_executable(metadata.get("executable"), sense_dir=sense_dir))
    errors.extend(_validate_metadata(metadata.get("metadata")))
    errors.extend(_validate_compatibility(metadata.get("compatibility")))

    lic = metadata.get("license")
    if lic is not None and not isinstance(lic, str):
        errors.append("Field 'license' must be a string when present")

    return errors


def _is_sense_package_dir(d: Path) -> bool:
    if find_sense_md(d) is not None:
        return True
    return (d / "concern.yaml").is_file() and (d / "prompt.md").is_file()


def validate(sense_dir: Path) -> list[str]:
    """Validate one concern package directory. Empty list means valid."""
    sense_dir = Path(sense_dir)
    if not sense_dir.exists():
        return [f"Path does not exist: {sense_dir}"]
    if not sense_dir.is_dir():
        return [f"Not a directory: {sense_dir}"]
    if not _is_sense_package_dir(sense_dir):
        return ["Not a concern package: need CONCERN.md (or concern.yaml + prompt.md)"]

    try:
        if find_sense_md(sense_dir):
            metadata, body = parse_frontmatter(find_sense_md(sense_dir).read_text())
        else:
            metadata, body = _load_legacy(sense_dir)
    except ParseError as e:
        return [str(e)]

    errors = validate_metadata(metadata, sense_dir=sense_dir)
    if not (body and body.strip()):
        errors.append(
            "Advice body is empty: add Markdown content after the closing ---"
        )
    return errors


def validate_tree(senses_root: Path) -> dict[str, list[str]]:
    """Validate each immediate child directory under a concerns root (e.g. examples/concerns)."""
    root = Path(senses_root)
    if not root.is_dir():
        return {"": [f"Not a directory: {root}"]}

    results: dict[str, list[str]] = {}
    for entry in sorted(root.iterdir(), key=lambda p: p.name):
        if not entry.is_dir():
            continue
        if entry.name.startswith("."):
            continue
        if not _is_sense_package_dir(entry):
            continue
        err = validate(entry)
        if err:
            results[entry.name] = err
    return results
