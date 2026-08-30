"""Minimal isolated FortyGuard client used only after explicit execution.

It deliberately has no dependency on ``src.collect``: no shared cache, ledger,
session date-time file or retry state is imported.
"""

from __future__ import annotations

import os
import time
import json
from pathlib import Path
from typing import Any

from .config import Aoi, CACHE_VERSION, UTC, date_time_payload
from .isolation import RAW_ROOT, atomic_write_json

API_ROOT = "https://api.fortyguard.com/v1"
_REPO_ROOT = Path(__file__).resolve().parents[2]


class FortyGuardError(RuntimeError):
    pass


def _api_key() -> str:
    # Keep module import cheap: dry runs do not need requests, dotenv or keys.
    try:
        from dotenv import load_dotenv
    except ImportError as exc:
        raise FortyGuardError("Install the main ml dependencies before executing paid collection: pip install -r requirements.txt") from exc
    for env_name in (".env.local", ".env"):
        candidate = _REPO_ROOT / env_name
        if candidate.exists():
            load_dotenv(candidate)
    # Key 3 is dedicated to this isolated overnight experiment.  Keeping it
    # first avoids consuming the daytime collector's existing training budget.
    key = (
        os.environ.get("FORTYGUARD_TRAINING_API_KEY_3")
        or os.environ.get("FORTYGUARD_TRAINING_API_KEY")
        or os.environ.get("FORTYGUARD_TRAINING_API_KEY_2")
    )
    if not key:
        raise FortyGuardError("Missing a FORTYGUARD_TRAINING_API_KEY entry in the repo .env.local.")
    return key


def _request(path: str, method: str = "GET", payload: dict | None = None) -> dict[str, Any]:
    try:
        import requests
    except ImportError as exc:
        raise FortyGuardError("Install the main ml dependencies before executing paid collection: pip install -r requirements.txt") from exc
    response = requests.request(
        method,
        f"{API_ROOT}{path}",
        json=payload,
        headers={"api-key": _api_key(), "content-type": "application/json"},
        timeout=30,
    )
    try:
        body = response.json()
    except ValueError:
        body = {}
    if not response.ok or body.get("error"):
        raise FortyGuardError(body.get("message") or f"FortyGuard {path} failed with {response.status_code}.")
    return body


def submit_and_wait(path: str, payload: dict, timeout_seconds: int = 300) -> dict[str, Any]:
    submitted = _request(path, method="POST", payload=payload)
    activity_id = (submitted.get("data") or {}).get("activity_id")
    if not activity_id:
        raise FortyGuardError(f"No activity_id returned for {path}.")
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        result = _request(f"/status/{activity_id}")
        status = (result.get("data") or {}).get("status") or result.get("status")
        if status == "Completed":
            return result
        if status == "Failed":
            raise FortyGuardError(f"FortyGuard activity {activity_id} failed.")
        time.sleep(3)
    raise FortyGuardError(f"FortyGuard activity {activity_id} timed out after {timeout_seconds}s.")


def slug(value: str) -> str:
    return "".join(character.lower() if character.isalnum() else "-" for character in value).strip("-")


def cache_path(aoi: Aoi, period: str, kind: str, timestamp) -> Path:
    stamp = timestamp.astimezone(UTC).strftime("%Y%m%dT%H%MZ")
    return RAW_ROOT / slug(aoi.name) / f"{stamp}_{period}_{CACHE_VERSION}_{kind}.json"


def fetch_heatmap(aoi: Aoi, period: str, timestamp) -> dict:
    path = cache_path(aoi, period, "heatmap", timestamp)
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    result = submit_and_wait(
        "/heatmap",
        {
            "polygon_aoi": aoi.polygon(),
            "date_time": date_time_payload(timestamp),
            "granularity": 100,
            "analytic_type": "tcm",
        },
    )
    atomic_write_json(path, result)
    return result


def fetch_env_params(aoi: Aoi, period: str, timestamp) -> dict:
    path = cache_path(aoi, period, "env_params", timestamp)
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    result = submit_and_wait(
        "/env_params",
        {
            "latitude": aoi.lat,
            "longitude": aoi.lng,
            "temperature": 30.0,
            "date_time": date_time_payload(timestamp),
        },
    )
    atomic_write_json(path, result)
    return result
