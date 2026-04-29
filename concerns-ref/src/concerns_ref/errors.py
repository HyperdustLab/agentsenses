"""Concern-related exceptions."""


class SenseError(Exception):
    """Base exception for concern parsing and validation."""

    pass


class ParseError(SenseError):
    """Raised when CONCERN.md or legacy files cannot be parsed."""

    pass


class ValidationError(SenseError):
    """Raised when concern metadata fails validation."""

    def __init__(self, message: str, errors: list[str] | None = None):
        super().__init__(message)
        self.errors = errors if errors is not None else [message]
