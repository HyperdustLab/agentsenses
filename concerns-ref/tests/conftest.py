from pathlib import Path

import pytest


@pytest.fixture
def examples_senses() -> Path:
    root = Path(__file__).resolve().parents[2]
    return root / "examples" / "concerns"
