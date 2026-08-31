"""Tracks estimated FortyGuard credit spend and hard-stops at a configured cap.

All three unit costs below are CONFIRMED against the real account via
POST /v1/system/fetch-api-key-usage (discovered by reading the docs site's
JS bundle -- not documented on the docs pages themselves): 56 heatmap calls
cost 236,320 credits (4,220 each), 39 env_params calls cost 113,100 (2,900
each), 3 satellite calls cost 43,200 (14,400 each, matching what project
memory already had right). Also confirmed via that same endpoint: credits
reset once at the end of the Hackathon billing cycle (2026-09-26), NOT
daily -- there is no "N calls per day" quota on any of these endpoints.
An earlier version of this pipeline mistakenly built a workaround around
what was actually just a run of ordinary failures.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

# v2: separate file, since FORTYGUARD_TRAINING_API_KEY (added later in the
# project) is a distinct key/budget from whatever _ledger.json tracked.
LEDGER_PATH = Path(__file__).resolve().parents[2] / "data" / "raw" / "_ledger_v2.json"

# kind -> (credits per call, confirmed?) -- all three confirmed, see module docstring.
COST_ESTIMATES: dict[str, tuple[int, bool]] = {
    "satellite": (14_400, True),
    "heatmap": (4_220, True),
    "env_params": (2_900, True),
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
