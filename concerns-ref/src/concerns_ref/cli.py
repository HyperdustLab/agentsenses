"""CLI for concerns-ref."""

import json
import sys
from pathlib import Path

import click

from .errors import SenseError
from .parser import read_properties
from .validator import validate, validate_tree


@click.group()
@click.version_option()
def main():
    """Reference tools for Agent Concerns (CONCERN.md packages)."""
    pass


@main.command("validate")
@click.argument("path", type=click.Path(exists=True, path_type=Path))
def validate_cmd(path: Path):
    """Validate a single concern package directory (or parent of CONCERN.md if a file is given)."""
    if path.is_file():
        if path.name.lower() == "concern.md":
            path = path.parent
        else:
            click.echo(f"Not a CONCERN.md file: {path}", err=True)
            sys.exit(1)

    errors = validate(path)
    if errors:
        click.echo(f"Validation failed for {path}:", err=True)
        for e in errors:
            click.echo(f"  - {e}", err=True)
        sys.exit(1)
    click.echo(f"Valid concern package: {path}")


@main.command("validate-tree")
@click.argument("root", type=click.Path(exists=True, path_type=Path))
def validate_tree_cmd(root: Path):
    """Validate every concern package in immediate subdirectories of ROOT (e.g. examples/concerns)."""
    bad = validate_tree(root)
    if not bad:
        click.echo(f"All concern packages under {root} are valid.")
        return
    click.echo(f"Validation issues under {root}:", err=True)
    for name, errs in sorted(bad.items()):
        click.echo(f"  [{name}]", err=True)
        for e in errs:
            click.echo(f"    - {e}", err=True)
    sys.exit(1)


@main.command("read-properties")
@click.argument("path", type=click.Path(exists=True, path_type=Path))
def read_properties_cmd(path: Path):
    """Print parsed frontmatter (and body preview) as JSON."""
    try:
        if path.is_file() and path.name.lower() == "concern.md":
            path = path.parent
        props = read_properties(path)
        click.echo(json.dumps(props.to_dict(), indent=2))
    except SenseError as e:
        click.echo(f"Error: {e}", err=True)
        sys.exit(1)
