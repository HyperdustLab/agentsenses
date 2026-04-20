from pathlib import Path

import pytest

from senses_ref.errors import ParseError
from senses_ref.parser import parse_frontmatter, read_properties


def test_parse_minimal():
    raw = """---
name: test-one
---
Body here.
"""
    meta, body = parse_frontmatter(raw)
    assert meta["name"] == "test-one"
    assert body == "Body here."


def test_parse_requires_closing_fence():
    raw = """---
name: x
"""
    with pytest.raises(ParseError):
        parse_frontmatter(raw)


def test_read_properties_example_sense(examples_senses: Path):
    safety = examples_senses / "safety_sense"
    props = read_properties(safety)
    assert props.name == "safety_sense"
    assert props.description
    assert "safe" in (props.body_preview or "").lower()
