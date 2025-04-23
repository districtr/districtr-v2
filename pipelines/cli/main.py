"""
Main CLI module for the districtr-v2 pipelines.
"""

# Import the main CLI group
from core.cli import cli

# Import subcommands from modules to register them

# This allows the CLI to be run with `python -m cli`
if __name__ == "__main__":
    cli()
