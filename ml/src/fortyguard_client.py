"""Minimal FortyGuard REST client for the offline data-collection pipeline.

Mirrors src/lib/fortyguard/client.ts's submit-then-poll pattern so the two
codebases stay conceptually in sync, but this one is standalone (no Next.js
runtime) and adds bounded polling since bulk collection can't sit on a
webhook/route the way the app's UI does.
"""

from __future__ import annotations

import os
import time
from pathlib import Path
from typing import Any

import requests
from dotenv import load_dotenv

API_ROOT = "https://api.fortyguard.com/v1"

# Repo root is two levels up from this file (ml/src/fortyguard_client.py).
_REPO_ROOT = Path(__file__).resolve().parents[2]
for _candidate in (".env.local", ".env"):
    _path = _REPO_ROOT / _candidate
    if _path.exists():
        load_dotenv(_path)


class FortyGuardError(RuntimeError):
    def __init__(self, message: str, status: int | None = None):
        super().__init__(message)
        self.status = status


def _api_key() -> str:
    # The bulk training/collection pipeline uses its own dedicated key
    # (separate budget from the live Next.js app's FORTYGUARD_API_KEY),
    # falling back to the app's key for local dev convenience if unset.
    key = (
        os.environ.get("FORTYGUARD_TRAINING_API_KEY")
        or os.environ.get("FORTYGUARD_API_KEY")
        or os.environ.get("api_key")
    )
    if not key:
        raise FortyGuardError(
            "Missing FortyGuard API key. Add FORTYGUARD_API_KEY to a .env.local "
            "(or .env) file at the repo root — same convention as the Next.js app."
        )
    return key


def _request(path: str, method: str = "GET", json: dict | None = None, api_key: str | None = None) -> dict[str, Any]:
    response = requests.request(
        method,
        f"{API_ROOT}{path}",
        json=json,
        headers={"api-key": api_key or _api_key(), "content-type": "application/json"},
        timeout=30,
    )
    try:
        body = response.json()
    except ValueError:
        body = None
    if not response.ok or (isinstance(body, dict) and body.get("error")):
        message = (body or {}).get("message") if isinstance(body, dict) else None
        raise FortyGuardError(message or f"FortyGuard request failed ({response.status_code}).", response.status_code)
    return body or {}


def submit_job(path: str, payload: dict, api_key: str | None = None) -> str:
    body = _request(path, method="POST", json=payload, api_key=api_key)
    activity_id = (body.get("data") or {}).get("activity_id")
    if not isinstance(activity_id, str):
        raise FortyGuardError(f"FortyGuard did not return an activity ID for {path}.")
    return activity_id


def job_status(activity_id: str, api_key: str | None = None) -> dict[str, Any]:
    return _request(f"/status/{activity_id}", api_key=api_key)


def poll_until_complete(
    activity_id: str,
    *,
    interval_seconds: float = 3.0,
    timeout_seconds: float = 180.0,
    api_key: str | None = None,
) -> dict[str, Any]:
    """Bounded polling. Raises FortyGuardError on Failed or timeout."""
    deadline = time.monotonic() + timeout_seconds
    while True:
        body = job_status(activity_id, api_key=api_key)
        status = (body.get("data") or {}).get("status") or body.get("status")
        if status == "Completed":
            return body
        if status == "Failed":
            raise FortyGuardError(f"FortyGuard job {activity_id} failed.")
        if time.monotonic() > deadline:
            raise FortyGuardError(f"FortyGuard job {activity_id} timed out after {timeout_seconds}s.")
        time.sleep(interval_seconds)


def submit_and_wait(path: str, payload: dict, api_key: str | None = None, **poll_kwargs) -> dict[str, Any]:
    activity_id = submit_job(path, payload, api_key=api_key)
    return poll_until_complete(activity_id, api_key=api_key, **poll_kwargs)
