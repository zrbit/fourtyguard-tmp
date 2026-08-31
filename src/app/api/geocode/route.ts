import { NextRequest, NextResponse } from "next/server";

/**
 * Server-side proxy to OpenStreetMap's Nominatim geocoder for the live map's
 * address search. Server-side (not called directly from the browser) for
 * two reasons: Nominatim's usage policy requires a valid identifying
 * User-Agent on every request (a bare browser fetch either can't set one or
 * sends a generic one), and it's the same "proxy through our own route"
 * convention already used for FortyGuard (src/lib/fortyguard/client.ts).
 *
 * Free, no key. Usage policy (https://operations.osmfoundation.org/policies/nominatim/):
 * max ~1 req/sec, no autocomplete-per-keystroke, must identify the app.
 * The search box this backs is submit-triggered, not live-as-you-type, so
 * normal usage stays far under that on its own.
 */

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "heatlens-hackathon-demo/0.1 (thermal reasoning agent; hackathon research use)";

// Biases (not hard-bounds) results toward the live study area (Van Nuys +
// Sepulveda Basin, see STUDY_AREAS["Los Angeles"] in the heatmap route) so
// "Van Nuys Blvd" resolves to the right one without excluding a real match
// slightly outside the box.
const BIAS_VIEWBOX = "-118.492,34.1957,-118.4387,34.1777"; // left,top,right,bottom

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim();
  if (!q) {
    return NextResponse.json({ error: "Missing q" }, { status: 400 });
  }

  const params = new URLSearchParams({
    q,
    format: "jsonv2",
    limit: "5",
    viewbox: BIAS_VIEWBOX,
    bounded: "0",
  });

  let response: Response;
  try {
    response = await fetch(`${NOMINATIM_URL}?${params.toString()}`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
  } catch {
    return NextResponse.json({ error: "Geocoding service unreachable" }, { status: 502 });
  }

  if (!response.ok) {
    return NextResponse.json({ error: `Geocoding service returned ${response.status}` }, { status: 502 });
  }

  const results = (await response.json()) as Array<{ display_name: string; lat: string; lon: string }>;
  return NextResponse.json({
    results: results.map((r) => ({ label: r.display_name, lat: Number(r.lat), lng: Number(r.lon) })),
  });
}
