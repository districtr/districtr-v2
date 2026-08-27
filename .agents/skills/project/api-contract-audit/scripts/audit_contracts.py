#!/usr/bin/env python3
"""Heuristic drift report between backend response models and frontend API types.

Static analysis only: this parses source text (Python via `ast`, TypeScript
via regex) and never imports or executes repo code, so it is safe to run
against a dirty working tree with no environment set up.

Usage:
    python audit_contracts.py [--backend-dir DIR] [--ts-file FILE]

Defaults match this repo's layout:
    --backend-dir backend/app
    --ts-file     app/src/app/utils/api/apiHandlers/types.ts

This is a v1 heuristic, not a type checker — see the "Limitations" section
printed at the end of every run.
"""

from __future__ import annotations

import argparse
import ast
import re
import sys
from dataclasses import dataclass
from pathlib import Path

# Directories under --backend-dir that hold no runtime response models:
# migration scripts (schema history, not API contracts) and test fixtures
# (which intentionally construct partial/invalid shapes).
BACKEND_EXCLUDE_DIR_NAMES = {"alembic", "tests", "__pycache__"}

# Suffixes stripped when normalizing a name for cross-language matching.
# Ordered longest-first so e.g. "CreateResponse" strips as one unit rather
# than leaving a dangling "Response" pass to also strip "Create".
NAME_SUFFIXES = [
    "CreateResponse",
    "CreatePublic",
    "Response",
    "Public",
    "Create",
    "Result",
    "Metadata",
]


@dataclass
class BackendClass:
    name: str
    bases: list[str]
    fields: set[str]
    file: Path


@dataclass
class FrontendType:
    name: str
    bases: list[str]
    fields: set[str]


def normalize(name: str) -> str:
    """Lowercase and strip a trailing contract-role suffix, for fuzzy matching."""
    for suffix in NAME_SUFFIXES:
        if name.endswith(suffix) and len(name) > len(suffix):
            name = name[: -len(suffix)]
            break
    return name.lower()


def is_model_base(base: ast.expr) -> str | None:
    """Return the base class name if it looks like a Pydantic/SQLModel base
    or a locally-defined model class (for inheritance chasing), else None."""
    if isinstance(base, ast.Name):
        return base.id
    if isinstance(base, ast.Attribute):
        return base.attr
    return None


def extract_backend_classes(root: Path) -> dict[str, BackendClass]:
    classes: dict[str, BackendClass] = {}
    for py_file in sorted(root.rglob("*.py")):
        if any(part in BACKEND_EXCLUDE_DIR_NAMES for part in py_file.parts):
            continue
        if py_file.name.startswith("test_"):
            continue
        try:
            source = py_file.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError) as exc:
            print(f"warning: skipping {py_file}: {exc}", file=sys.stderr)
            continue
        try:
            tree = ast.parse(source, filename=str(py_file))
        except SyntaxError as exc:
            print(f"warning: skipping {py_file}: syntax error: {exc}", file=sys.stderr)
            continue

        for node in ast.walk(tree):
            if not isinstance(node, ast.ClassDef):
                continue
            bases = [b for b in (is_model_base(b) for b in node.bases) if b]
            if not bases:
                continue
            # Collected regardless of what the base resolves to: a class
            # whose only base is another local model class (e.g.
            # `DocumentCreatePublic(DocumentPublic)`) needs to be in this
            # dict for the BaseModel/SQLModel reachability filter below to
            # find it. Classes with no path back to BaseModel/SQLModel are
            # dropped after that filter runs, not here.
            fields: set[str] = set()
            for stmt in node.body:
                if isinstance(stmt, ast.AnnAssign) and isinstance(
                    stmt.target, ast.Name
                ):
                    if not stmt.target.id.startswith("_"):
                        fields.add(stmt.target.id)
                elif isinstance(stmt, ast.FunctionDef):
                    decorator_names = {
                        d.id for d in stmt.decorator_list if isinstance(d, ast.Name)
                    } | {
                        d.func.id
                        for d in stmt.decorator_list
                        if isinstance(d, ast.Call) and isinstance(d.func, ast.Name)
                    }
                    if "computed_field" in decorator_names and not stmt.name.startswith(
                        "_"
                    ):
                        fields.add(stmt.name)
            classes[node.name] = BackendClass(
                name=node.name, bases=bases, fields=fields, file=py_file
            )
    resolve_inherited_fields(classes)
    return {
        name: cls for name, cls in classes.items() if reaches_model_base(cls, classes)
    }


def reaches_model_base(
    cls: BackendClass, classes: dict[str, BackendClass], _seen: set[str] | None = None
) -> bool:
    """True if cls is BaseModel/SQLModel, or inherits from one through a
    chain of locally-defined classes. `_seen` guards against a base-class
    cycle (which would otherwise recurse forever)."""
    seen = _seen or set()
    if cls.name in seen:
        return False
    seen = seen | {cls.name}
    for base_name in cls.bases:
        if base_name in ("BaseModel", "SQLModel"):
            return True
        base = classes.get(base_name)
        if base is not None and reaches_model_base(base, classes, seen):
            return True
    return False


def resolve_inherited_fields(classes: dict[str, BackendClass]) -> None:
    """Fold in fields from locally-defined base classes (one level of
    transitive resolution is enough for this repo's shallow model hierarchy;
    deeper chains still get whatever their immediate parent already resolved,
    since this walks in insertion order after the first pass)."""
    for _ in range(3):  # bounded passes cover the deepest real chain with margin
        changed = False
        for cls in classes.values():
            for base_name in cls.bases:
                base = classes.get(base_name)
                if base is None:
                    continue
                new_fields = base.fields - cls.fields
                if new_fields:
                    cls.fields |= new_fields
                    changed = True
        if not changed:
            break


def extract_frontend_types(ts_file: Path) -> dict[str, FrontendType]:
    try:
        text = ts_file.read_text(encoding="utf-8")
    except OSError as exc:
        print(f"error: cannot read {ts_file}: {exc}", file=sys.stderr)
        sys.exit(1)

    types: dict[str, FrontendType] = {}
    # Matches `export interface Name [extends Base1, Base2] {` and
    # `export type Name = {` — the two shapes this file's field objects use.
    header_re = re.compile(
        r"export\s+(?:interface\s+(\w+)(?:\s+extends\s+([\w,\s]+))?|"
        r"type\s+(\w+)\s*=)\s*\{"
    )
    field_re = re.compile(r"^\s*(?:readonly\s+)?([A-Za-z_]\w*)\??\s*:")

    for match in header_re.finditer(text):
        name = match.group(1) or match.group(3)
        bases = [b.strip() for b in match.group(2).split(",")] if match.group(2) else []
        # Walk forward from the opening brace, tracking depth, to find the
        # matching close and collect only depth-1 field lines (so a nested
        # inline object type's keys aren't mistaken for top-level fields).
        start = match.end()  # just past the opening '{'
        depth = 1
        pos = start
        fields: set[str] = set()
        line_start = start
        while pos < len(text) and depth > 0:
            char = text[pos]
            if char == "{":
                depth += 1
            elif char == "}":
                depth -= 1
            elif char == "\n":
                if depth == 1:
                    line = text[line_start:pos]
                    field_match = field_re.match(line)
                    if field_match:
                        fields.add(field_match.group(1))
                line_start = pos + 1
            pos += 1
        types[name] = FrontendType(name=name, bases=bases, fields=fields)

    resolve_ts_inheritance(types)
    return types


def resolve_ts_inheritance(types: dict[str, FrontendType]) -> None:
    for _ in range(3):
        changed = False
        for t in types.values():
            for base_name in t.bases:
                base = types.get(base_name)
                if base is None:
                    continue
                new_fields = base.fields - t.fields
                if new_fields:
                    t.fields |= new_fields
                    changed = True
        if not changed:
            break


def match_pairs(
    backend: dict[str, BackendClass], frontend: dict[str, FrontendType]
) -> list[tuple[BackendClass, FrontendType]]:
    by_norm_fe: dict[str, list[FrontendType]] = {}
    for t in frontend.values():
        by_norm_fe.setdefault(normalize(t.name), []).append(t)

    pairs: list[tuple[BackendClass, FrontendType]] = []
    for cls in backend.values():
        candidates = by_norm_fe.get(normalize(cls.name), [])
        for candidate in candidates:
            pairs.append((cls, candidate))
    return pairs


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--backend-dir",
        type=Path,
        default=Path("backend/app"),
        help="Backend source root to scan for BaseModel/SQLModel classes.",
    )
    parser.add_argument(
        "--ts-file",
        type=Path,
        default=Path("app/src/app/utils/api/apiHandlers/types.ts"),
        help="Frontend TypeScript file to scan for interface/type field shapes.",
    )
    args = parser.parse_args()

    if not args.backend_dir.is_dir():
        print(f"error: backend dir not found: {args.backend_dir}", file=sys.stderr)
        return 2
    if not args.ts_file.is_file():
        print(f"error: TS file not found: {args.ts_file}", file=sys.stderr)
        return 2

    backend = extract_backend_classes(args.backend_dir)
    frontend = extract_frontend_types(args.ts_file)
    pairs = match_pairs(backend, frontend)

    print(f"Backend models found:  {len(backend)}")
    print(f"Frontend types found:  {len(frontend)}")
    print(f"Name-matched pairs:    {len(pairs)}")
    print()

    any_drift = False
    for cls, ts_type in sorted(pairs, key=lambda p: p[0].name):
        backend_only = cls.fields - ts_type.fields
        frontend_only = ts_type.fields - cls.fields
        if not backend_only and not frontend_only:
            continue
        any_drift = True
        print(f"## {cls.name} (backend)  <->  {ts_type.name} (frontend)")
        print(f"   backend source: {cls.file}")
        if backend_only:
            print(f"   only on backend:  {sorted(backend_only)}")
        if frontend_only:
            print(f"   only on frontend: {sorted(frontend_only)}")
        print()

    if not any_drift:
        print("No field-name drift found among matched pairs.")

    print("=" * 72)
    print("Limitations (v1, name-matching heuristic — read before acting):")
    print("  - Classes/interfaces are matched by normalized NAME only. A")
    print("    same-named pair that represents unrelated data will produce")
    print("    false-positive drift; an intentionally-renamed pair across")
    print("    languages will be missed entirely (reported as unmatched).")
    print("  - No type-compatibility checking: a field present on both sides")
    print("    with incompatible types (str vs number) is not detected.")
    print("  - Optional/nullable-ness, unions, and TS generics are not")
    print("    modeled — only field *names* are compared.")
    print("  - Backend inheritance and TS `extends` are folded in field-wise,")
    print("    but only a few passes deep; a very deep chain may be partial.")
    print("  - Response models NOT reachable from a name match (renamed, or")
    print("    genuinely backend-only/frontend-only) are silently excluded")
    print("    from the report above — check the found/matched counts.")

    return 1 if any_drift else 0


if __name__ == "__main__":
    sys.exit(main())
