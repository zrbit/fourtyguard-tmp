from __future__ import annotations

import unittest

from cooling_deficit.compute_deficit import compute


def make_row(index: int, cooling: float, day_anomaly: float = 0.5) -> dict:
    return {
        "night_id": "same-night",
        "aoi": f"aoi-{index}",
        "cell_id": f"cell-{index}",
        "cooling_raw_c": str(cooling),
        "nlcd_fractional_impervious_pct": "55",
        "distance_to_coast_m": "10000",
        "elevation_m": "100",
        "day_peak_anomaly_c": str(day_anomaly),
    }


class CoolingDeficitTests(unittest.TestCase):
    def test_positive_deficit_means_less_cooling_than_leave_one_out_peers(self) -> None:
        rows = [make_row(index, 5.0) for index in range(15)]
        rows[0] = make_row(0, 2.0)
        results = compute(rows)
        focal = results[0]
        self.assertEqual(focal["peer_group_size"], "15")
        self.assertAlmostEqual(focal["peer_mean_cooling_c"], 5.0)
        self.assertAlmostEqual(focal["cooling_deficit_c"], 3.0)
        self.assertEqual(focal["typology"], "hot-day-high-deficit")

    def test_uses_same_night_only(self) -> None:
        rows = [make_row(index, 5.0) for index in range(15)]
        other_night = [make_row(index + 20, 99.0) for index in range(15)]
        for row in other_night:
            row["night_id"] = "other-night"
        results = compute(rows + other_night)
        self.assertAlmostEqual(results[0]["peer_mean_cooling_c"], 5.0)

    def test_insufficient_group_is_not_globalized(self) -> None:
        results = compute([make_row(index, 5.0) for index in range(14)])
        self.assertEqual(results[0]["typology"], "insufficient-peers")
        self.assertEqual(results[0]["cooling_deficit_c"], "")


if __name__ == "__main__":
    unittest.main()
