"""Data models for Agent Concerns."""

from dataclasses import dataclass, field
from typing import Any, Optional


@dataclass
class SenseProperties:
    """Properties read from a concern package (CONCERN.md frontmatter + body summary)."""

    name: str
    description: Optional[str] = None
    priority: Optional[int] = None
    advice_kind: Optional[str] = None
    mode: Optional[str] = None
    pointcut: Optional[dict[str, Any]] = None
    jointpoints: Optional[list[str]] = None
    modulation: Optional[dict[str, str]] = None
    license: Optional[str] = None
    metadata: dict[str, str] = field(default_factory=dict)
    body_preview: Optional[str] = None

    def to_dict(self) -> dict:
        result: dict = {"name": self.name}
        if self.description is not None:
            result["description"] = self.description
        if self.priority is not None:
            result["priority"] = self.priority
        if self.advice_kind is not None:
            result["advice"] = {"kind": self.advice_kind}
        if self.mode is not None:
            result["mode"] = self.mode
        if self.pointcut is not None:
            result["pointcut"] = self.pointcut
        if self.jointpoints is not None:
            result["jointpoints"] = self.jointpoints
        if self.modulation is not None:
            result["modulation"] = self.modulation
        if self.license is not None:
            result["license"] = self.license
        if self.metadata:
            result["metadata"] = self.metadata
        if self.body_preview is not None:
            result["body_preview"] = self.body_preview
        return result
