"""
Main entry point for the pipelines package.
"""

import sys
import importlib

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python -m <module> [arguments]")
        sys.exit(1)

    module_name = sys.argv[1]
    sys.argv = [sys.argv[0]] + sys.argv[2:]

    try:
        module = importlib.import_module(module_name)
        if hasattr(module, "cli"):
            module.cli()
        else:
            print(f"Module '{module_name}' does not have a 'cli' attribute.")
            sys.exit(1)
    except ModuleNotFoundError:
        print(f"Module '{module_name}' not found.")
        sys.exit(1)
