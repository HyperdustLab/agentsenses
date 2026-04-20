from pathlib import Path

from senses_ref.validator import validate, validate_metadata, validate_tree


def test_validate_safety_sense(examples_senses: Path):
    assert validate(examples_senses / "safety_sense") == []


def test_validate_tree_all_examples(examples_senses: Path):
    assert validate_tree(examples_senses) == {}


def test_validate_missing_name():
    errors = validate_metadata({"description": "only desc"})
    assert any("name" in e.lower() for e in errors)


def test_validate_unknown_key():
    errors = validate_metadata({"name": "ok", "foo": 1})
    assert any("Unexpected" in e for e in errors)
