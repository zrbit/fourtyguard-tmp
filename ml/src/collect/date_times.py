"""date_time payload construction, matching the pattern already proven in
src/app/api/fortyguard/investigate/route.ts and .../heatmap/route.ts: always
request the most recently *completed* UTC hour, never the current one --
sending the current minute is known to be accepted as a job but produce zero
cells (see data/debug/fortyguard-empty-heatmap*.json)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone


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
