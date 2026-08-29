"""Tracks estimated FortyGuard credit spend and hard-stops at a configured cap.

Only Satellite Segmentation's cost is confirmed going in (~14,400/call, per
project memory). /heatmap and /env_params costs are NOT confirmed -- the
placeholders below are conservative guesses and MUST be updated (or at least
sanity-checked) after the pilot call in ml/README.md step 2, before running
the full batch.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

LEDGER_PATH = Path(__file__).resolve().parents[2] / "data" / "raw" / "_ledger.json"

# kind -> (estimated credits per call, confirmed?)
COST_ESTIMATES: dict[str, tuple[int, bool]] = {
    "satellite": (14_400, True),  # confirmed via project memory
    "heatmap": (2_000, False),  # UNCONFIRMED placeholder -- verify with the pilot call
    "env_params": (500, False),  # UNCONFIRMED placeholder -- verify with the pilot call
}


class CreditCapExceeded(RuntimeError):
    pass


@dataclass
class CreditLedger:
    cap: int
    spent: int = 0
    calls: list[dict] = field(default_factory=list)

    @classmethod
    def load(cls, cap: int) -> "CreditLedger":
        if LEDGER_PATH.exists():
            data = json.loads(LEDGER_PATH.read_text(encoding="utf-8"))
            return cls(cap=cap, spent=data.get("spent", 0), calls=data.get("calls", []))
        return cls(cap=cap)

    def save(self) -> None:
        LEDGER_PATH.parent.mkdir(parents=True, exist_ok=True)
        LEDGER_PATH.write_text(
            json.dumps({"spent": self.spent, "calls": self.calls}, indent=2), encoding="utf-8"
        )

    def estimate(self, kind: str) -> int:
        cost, confirmed = COST_ESTIMATES.get(kind, (0, False))
        if not confirmed:
            print(f"  [ledger] WARNING: '{kind}' cost is an unconfirmed estimate ({cost} credits).")
        return cost

    def reserve(self, kind: str, aoi_name: str, note: str = "") -> None:
        """Raise CreditCapExceeded if this call would exceed the cap; else record it."""
        cost = self.estimate(kind)
        if self.spent + cost > self.cap:
            raise CreditCapExceeded(
                f"Refusing '{kind}' call for {aoi_name}: would bring spend to "
                f"{self.spent + cost}, over the {self.cap} cap ({self.spent} already spent)."
            )
        self.spent += cost
        self.calls.append({"kind": kind, "aoi": aoi_name, "estimated_cost": cost, "note": note})
        self.save()
        print(f"  [ledger] {kind} for {aoi_name}: ~{cost} credits (running total: {self.spent}/{self.cap})")

    def release(self, kind: str, aoi_name: str) -> None:
        """Undo the most recent reservation for (kind, aoi_name) -- call this
        when the actual API call raised, since a Failed job has been
        confirmed (manually, via the FortyGuard dashboard) to NOT deduct
        real credits. Without this, repeated failed attempts while debugging
        a payload shape would eventually exhaust the budget for nothing."""
        for i in range(len(self.calls) - 1, -1, -1):
            if self.calls[i]["kind"] == kind and self.calls[i]["aoi"] == aoi_name:
                self.spent -= self.calls[i]["estimated_cost"]
                del self.calls[i]
                self.save()
                print(f"  [ledger] refunded failed {kind} call for {aoi_name} (running total: {self.spent}/{self.cap})")
                return

    def summary(self) -> str:
        return f"{self.spent}/{self.cap} credits estimated spent across {len(self.calls)} paid calls."

    def can_afford(self, additional_cost: int) -> bool:
        return self.spent + additional_cost <= self.cap
