"""date_time payload construction, matching the pattern already proven in
src/app/api/fortyguard/investigate/route.ts and .../heatmap/route.ts: always
request the most recently *completed* UTC hour, never the current one --
sending the current minute is known to be accepted as a job but produce zero
cells (see data/debug/fortyguard-empty-heatmap*.json)."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

_LA_TZ = ZoneInfo("America/Los_Angeles")
_SESSION_PATH = Path(__file__).resolve().parents[2] / "data" / "raw" / "_session_date_times.json"


def completed_hour(hours_ago: int = 1) -> datetime:
    now = datetime.now(timezone.utc) - timedelta(hours=hours_ago)
    return now.replace(minute=0, second=0, microsecond=0)


def date_time_payload(dt: datetime) -> dict:
    return {
        "start_date": dt.strftime("%Y-%m-%d"),
        "start_time": dt.strftime("%H:%M"),
        "filter_type": 1,
    }


def satellite_reference_date() -> datetime:
    """Land cover is roughly time-invariant, but confirmed empirically: unlike
    /heatmap and /env_params, /satellite's underlying imagery has revisit lag
    -- requesting "1 hour ago" failed (job status "Failed", no other detail);
    30 days ago succeeded. Using 45 days back for a safety margin beyond the
    confirmed-working 30."""
    return completed_hour(45 * 24 + 1)


def sample_date_times(count: int = 2) -> list[datetime]:
    """A handful of distinct, always-completed hours spread across recent
    days, for a little temporal variation without needing deep history."""
    offsets_hours = [1, 25, 49, 73][:count]  # ~1h ago, then same hour on prior days
    return [completed_hour(h) for h in offsets_hours]


# LA-local hours considered "daytime" for this project: a thermal reasoning
# agent doesn't need nighttime coverage (per project decision) -- late
# morning through early evening, spanning the diurnal heating curve without
# ever landing before sunrise or after dark for any time of year.
_DAYTIME_LOCAL_HOURS = [10, 13, 16]  # late morning, early afternoon (near peak), early evening

# Reversed for the later "include night for the new AOIs" decision -- urban
# heat island effects are often strongest at night (differential cooling
# rates between built-up and vegetated surfaces), so this is genuinely
# complementary signal, not just more of the same.
_NIGHTTIME_LOCAL_HOURS = [22, 1, 4]  # late evening, midnight, pre-dawn


def _compute_local_hour_date_times(hours: list[int], days_back: int) -> list[datetime]:
    now_la = datetime.now(_LA_TZ)
    out: list[datetime] = []
    for day_offset in range(days_back):
        for hour in hours:
            candidate_la = (now_la - timedelta(days=day_offset)).replace(hour=hour, minute=0, second=0, microsecond=0)
            if candidate_la >= now_la:
                candidate_la -= timedelta(days=1)
            out.append(candidate_la.astimezone(timezone.utc))
    return out


def _persisted_local_hour_date_times(session_key: str, hours: list[int], days_back: int) -> list[datetime]:
    """Shared machinery for daytime_date_times()/nighttime_date_times():
    computes distinct LA-local `hours`, each taken on `days_back` distinct
    recent days, via real DST-aware local time (zoneinfo) -- always in the
    past relative to `now` (uses the prior day if today's occurrence of an
    hour hasn't happened yet).

    PERSISTED across calls (see _SESSION_PATH), keyed by `session_key`: the
    first call for a given key computes and saves the actual timestamps;
    every subsequent call -- including a resume after a killed/restarted
    process, possibly on a different calendar day -- reuses exactly those
    same timestamps instead of recomputing against a now-different "today".
    This is what makes run_collection.py resumable without redundant
    re-spend: without it, a restart after a day boundary silently added a
    fresh set of "today's" hours, re-charging heatmap/env_params for AOIs
    that already had a complete set from before the restart."""
    session: dict[str, list[str]] = {}
    if _SESSION_PATH.exists():
        try:
            session = json.loads(_SESSION_PATH.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            session = {}
    if session_key in session:
        return [datetime.fromisoformat(iso) for iso in session[session_key]]

    computed = _compute_local_hour_date_times(hours, days_back)
    session[session_key] = [dt.isoformat() for dt in computed]
    _SESSION_PATH.parent.mkdir(parents=True, exist_ok=True)
    _SESSION_PATH.write_text(json.dumps(session, indent=2), encoding="utf-8")
    return computed


def daytime_date_times(count: int = 3, days_back: int = 1) -> list[datetime]:
    """Distinct daytime (LA-local) hours -- see
    _persisted_local_hour_date_times() for the persistence/DST details."""
    return _persisted_local_hour_date_times(f"day:{count}:{days_back}", _DAYTIME_LOCAL_HOURS[:count], days_back)


def nighttime_date_times(count: int = 3, days_back: int = 1) -> list[datetime]:
    """Distinct nighttime (LA-local) hours -- added for the AOIs collected
    after the "add more AOIs, include night for them" decision. Urban heat
    island effects are often strongest at night (differential cooling rates
    between built-up and vegetated surfaces), so this is genuinely
    complementary signal to daytime_date_times(), not just more samples of
    the same phenomenon. See _persisted_local_hour_date_times() for the
    persistence/DST details."""
    return _persisted_local_hour_date_times(f"night:{count}:{days_back}", _NIGHTTIME_LOCAL_HOURS[:count], days_back)
