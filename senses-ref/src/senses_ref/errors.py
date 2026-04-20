"""Sense-related exceptions."""


class SenseError(Exception):
    """Base exception for sense parsing and validation."""

    pass


class ParseError(SenseError):
    """Raised when SENSE.md or legacy files cannot be parsed."""

    pass


class ValidationError(SenseError):
    """Raised when sense metadata fails validation."""

    def __init__(self, message: str, errors: list[str] | None = None):
        super().__init__(message)
        self.errors = errors if errors is not None else [message]
