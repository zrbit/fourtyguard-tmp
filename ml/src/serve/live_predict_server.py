"""Minimal local HTTP server for the click-anywhere Tier 2 feature.

Plain http.server (no Flask/FastAPI dependency -- neither was already
installed, and one POST endpoint doesn't need a framework). The Next.js
app (a separate Node process) proxies to this over HTTP -- Tier 2's model
(XGBoost) and its enrichment pipeline (rasterio for Sentinel-2/NLCD) are
Python-only, no reasonable JS port, so this stays a second local process
rather than being folded into the Next.js server.

Run alongside `npm run dev` (a second terminal):
    python -m src.serve.live_predict_server

The Next.js route (src/app/api/reasoning/cell-attribution-live/route.ts)
calls this at http://127.0.0.1:8787/predict and falls back to the existing
nearest-AOI resolution if this isn't running -- this feature is additive,
never required for the app to work.
"""

from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, HTTPServer

from .live_predict import predict_live
from .live_satellite import LiveCreditCapExceeded

PORT = 8787


class Handler(BaseHTTPRequestHandler):
    def _send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, default=str).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:  # CORS preflight, harmless if unused
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self) -> None:
        if self.path == "/health":
            self._send_json(200, {"status": "ok"})
            return
        self._send_json(404, {"error": "Not found. POST /predict with {lat, lng}."})

    def do_POST(self) -> None:
        if self.path != "/predict":
            self._send_json(404, {"error": "Not found. POST /predict with {lat, lng}."})
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length) or b"{}")
            lat, lng = body.get("lat"), body.get("lng")
            if not isinstance(lat, (int, float)) or not isinstance(lng, (int, float)):
                self._send_json(400, {"error": "Provide numeric lat and lng."})
                return
            print(f"[live-predict] {lat}, {lng}")
            result = predict_live(float(lat), float(lng))
            self._send_json(200, result)
        except LiveCreditCapExceeded as exc:
            self._send_json(429, {"error": str(exc)})
        except Exception as exc:  # noqa: BLE001 -- always return JSON, never crash the server
            print(f"[live-predict] ERROR: {exc}")
            self._send_json(502, {"error": str(exc)})

    def log_message(self, format: str, *args) -> None:  # noqa: A002 -- quieter default logging
        pass


def main() -> None:
    server = HTTPServer(("127.0.0.1", PORT), Handler)
    print(f"Live prediction server listening on http://127.0.0.1:{PORT}")
    print("POST /predict {lat, lng} -> Tier 2 live per-click prediction (real FortyGuard satellite calls, billed to FORTYGUARD_API_KEY).")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down.")


if __name__ == "__main__":
    main()
