"""Lightweight parser for src/lib/mock-data/blocks.ts's DEMO_BLOCKS array.

Doesn't run a real TS/JS toolchain (no ts-node dependency added just for
this) -- DEMO_BLOCKS is a flat array of object literals with simple
string/number fields, so a small regex-based extractor is enough. The one
computed field (`distribution: spread(...)`) is intentionally not needed
here. If blocks.ts's shape changes meaningfully, this will need updating
alongside it.
"""

from __future__ import annotations

import re
from pathlib import Path

BLOCKS_TS_PATH = Path(__file__).resolve().parents[3] / "src" / "lib" / "mock-data" / "blocks.ts"

_STRING_FIELD = re.compile(r'(\w+):\s*"([^"]*)"')
_NUMBER_FIELD = re.compile(r"(\w+):\s*(-?\d+\.?\d*)")


def _split_top_level_objects(array_body: str) -> list[str]:
    """Splits `{...}, {...}, {...}` on top-level braces (ignores nested ones,
    e.g. inside a value's own object -- DEMO_BLOCKS has none)."""
    objects, depth, start = [], 0, None
    for i, ch in enumerate(array_body):
        if ch == "{":
            if depth == 0:
                start = i
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0 and start is not None:
                objects.append(array_body[start : i + 1])
                start = None
    return objects


def parse_demo_blocks() -> list[dict]:
    text = BLOCKS_TS_PATH.read_text(encoding="utf-8")
    match = re.search(r"DEMO_BLOCKS[^=]*=\s*\[(.*?)\n\];", text, re.DOTALL)
    if not match:
        raise ValueError(f"Could not find DEMO_BLOCKS array in {BLOCKS_TS_PATH}")
    blocks = []
    for obj_text in _split_top_level_objects(match.group(1)):
        fields: dict[str, str | float] = {}
        for key, value in _STRING_FIELD.findall(obj_text):
            fields.setdefault(key, value)
        for key, value in _NUMBER_FIELD.findall(obj_text):
            if key in fields:  # a string field already claimed this key
                continue
            fields[key] = float(value)
        blocks.append(fields)
    return blocks
