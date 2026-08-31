"""Filesystem isolation and an explicit single-process guard.

The guard is intentionally local to this experiment.  It never touches the
shared collector's locks, cache, ledger or run state, so no process can be
mistakenly killed or unlocked by this feature.
"""

from __future__ import annotations

import json
import os
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

PACKAGE_ROOT = Path(__file__).resolve().parent
DATA_ROOT = PACKAGE_ROOT / "data"
RAW_ROOT = DATA_ROOT / "raw"
DERIVED_ROOT = DATA_ROOT / "derived"
RUNTIME_ROOT = PACKAGE_ROOT / "runtime"
LOCK_PATH = RUNTIME_ROOT / "collection.lock"


class CoolingDeficitLocked(RuntimeError):
    pass


def ensure_directories() -> None:
    for path in (RAW_ROOT, DERIVED_ROOT, RUNTIME_ROOT):
        path.mkdir(parents=True, exist_ok=True)


def atomic_write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
    temporary.replace(path)


@contextmanager
def exclusive_collection_lock() -> Iterator[None]:
    """Acquire an atomic, crash-detectable lock for this directory only."""
    ensure_directories()
    metadata = {"pid": os.getpid(), "started_at_epoch": time.time()}
    try:
        with LOCK_PATH.open("x", encoding="utf-8") as handle:
            json.dump(metadata, handle)
    except FileExistsError as exc:
        try:
            active = LOCK_PATH.read_text(encoding="utf-8")
        except OSError:
            active = "unreadable lock metadata"
        raise CoolingDeficitLocked(
            "Cooling-deficit collection is already running or was interrupted. "
            f"Inspect {LOCK_PATH}; never delete it while a run may still be active. Metadata: {active}"
        ) from exc
    try:
        yield
    finally:
        # Only the process which successfully acquired this lock reaches here.
        LOCK_PATH.unlink(missing_ok=True)
