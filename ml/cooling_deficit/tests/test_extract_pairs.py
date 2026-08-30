from __future__ import annotations

import unittest

from cooling_deficit.extract_pairs import match_cells


class PairMatchingTests(unittest.TestCase):
    def test_matches_geometry_ids_not_response_order(self) -> None:
        evening = [
            {"cell_id": "34.00000:-118.00000", "temperature_c": 30.0},
            {"cell_id": "34.00100:-118.00000", "temperature_c": 31.0},
        ]
        predawn = [
            {"cell_id": "34.00100:-118.00000", "temperature_c": 20.0},
            {"cell_id": "34.00000:-118.00000", "temperature_c": 19.0},
        ]
        matches = match_cells(evening, predawn)
        self.assertEqual(matches[0][0]["cell_id"], "34.00000:-118.00000")
        self.assertEqual(matches[0][1]["temperature_c"], 19.0)


if __name__ == "__main__":
    unittest.main()
