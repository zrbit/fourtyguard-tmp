"use client";

import { useEffect, useId, useState } from "react";
import { Search, X, LoaderCircle, Maximize, Radar } from "lucide-react";

type GeocodeResult = { label: string; lat: number; lng: number };
type AreaSearchPayload = { bbox: [number, number, number, number]; bboxKey: string; label: string; center: [number, number] };

// Full box side length in meters, user-entered directly rather than a
// small/medium/large preset. Bounds are a HARD client-side ceiling/floor,
// not just cosmetic input-attribute hints -- clamped in `clampSize()` below
// so the value sent to the server can never exceed them regardless of how
// it's typed in.
//
// MAX_SIZE_M is chosen to stay safely inside the API route's own
// MAX_BOX_DEG=0.03 validation (src/app/api/fortyguard/heatmap/route.ts)
// even at the worst-case latitude the geocoder is allowed to return
// (continental US, up to ~50N): a degree of longitude is narrowest there
// (cos(50deg) ~= 0.643), so the same meter distance eats more of the 0.03deg
// budget than it would in LA. At 2000m, width_deg = 2000/(111320*0.643) ~=
// 0.028 -- inside the 0.03 ceiling with margin. MIN_SIZE_M=200 stays clear
// of the route's MIN_BOX_DEG=0.0015 floor (~150-165m depending on latitude)
// with margin too.
const MIN_SIZE_M = 200;
const MAX_SIZE_M = 2000;
const DEFAULT_SIZE_M = 800;

const METERS_PER_DEG_LAT = 111_320;

function clampSize(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SIZE_M;
  return Math.min(MAX_SIZE_M, Math.max(MIN_SIZE_M, Math.round(value)));
}

function bboxAround(lat: number, lng: number, halfWidthM: number): [number, number, number, number] {
  const dLat = halfWidthM / METERS_PER_DEG_LAT;
  const dLng = halfWidthM / (METERS_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180));
  return [lng - dLng, lat - dLat, lng + dLng, lat + dLat];
}

/**
 * Address + area-size search for the live map. Unlike the earlier version,
 * this doesn't just fly to and pick the nearest cell in whatever's already
 * loaded -- it triggers a genuinely new FortyGuard live scan of the chosen
 * address at the chosen size (via `onAreaSearch`, handled in page.tsx),
 * since there's no longer a fixed "current scan area" to be limited to.
 * Geocoding itself still goes through /api/geocode (server-side Nominatim
 * proxy, submit-triggered not live-as-you-type -- see that route).
 */
export function AddressSearch({
  areaLabel,
  onAreaSearch,
}: {
  areaLabel?: string | null;
  onAreaSearch?: (area: AreaSearchPayload) => void;
}) {
  const [query, setQuery] = useState("");
  const [sizeInput, setSizeInput] = useState(String(DEFAULT_SIZE_M));
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<GeocodeResult[]>([]);
  const sizeInputId = useId();
  const size = clampSize(Number(sizeInput));

  // Clears the typed query when the parent reports no custom area is active
  // any more (e.g. the user clicked back to one of the fixed named cities) --
  // otherwise the box keeps showing a stale address after the map has
  // already moved on. A truthy areaLabel from a just-completed search
  // matches what scanResult() already set, so this is a no-op then.
  useEffect(() => {
    if (!areaLabel) setQuery("");
  }, [areaLabel]);

  function scanResult(result: GeocodeResult) {
    setCandidates([]);
    setStatus("idle");
    const shortLabel = result.label.split(",")[0];
    setQuery(shortLabel);
    onAreaSearch?.({
      bbox: bboxAround(result.lat, result.lng, size / 2),
      bboxKey: `${result.lat.toFixed(5)},${result.lng.toFixed(5)},${size}`,
      label: shortLabel,
      center: [result.lng, result.lat],
    });
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q || status === "loading") return;
    setStatus("loading");
    setErrorMessage(null);
    setCandidates([]);
    try {
      const response = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "Geocoding failed");
      const results = (data.results ?? []) as GeocodeResult[];
      if (results.length === 0) {
        setStatus("error");
        setErrorMessage("No match found.");
      } else if (results.length === 1) {
        scanResult(results[0]);
      } else {
        setStatus("idle");
        setCandidates(results);
      }
    } catch {
      setStatus("error");
      setErrorMessage("Couldn't reach the geocoder — try again.");
    }
  }

  return (
    <div className="pointer-events-none absolute top-4 left-4 z-10 w-72 sm:w-80">
      <form
        onSubmit={handleSearch}
        className="pointer-events-auto overflow-hidden rounded-lg border shadow-sm backdrop-blur-sm"
        style={{ borderColor: "var(--border)", background: "var(--overlay)" }}
      >
        <div className="flex items-center gap-2 px-3 py-2.5">
          <Search className="h-3.5 w-3.5 shrink-0 text-slate" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search any US address…"
            className="w-full bg-transparent text-[12.5px] text-paper outline-none placeholder:text-slate"
            aria-label="Search an address to scan"
          />
          {status === "loading" && <LoaderCircle className="h-3.5 w-3.5 shrink-0 animate-spin text-slate" />}
          {query && status !== "loading" && (
            <button
              type="button"
              onClick={() => { setQuery(""); setCandidates([]); setStatus("idle"); setErrorMessage(null); }}
              aria-label="Clear search"
              className="shrink-0 text-slate hover:text-paper"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t px-3 py-2" style={{ borderColor: "var(--border)" }}>
          <label htmlFor={sizeInputId} className="flex items-center gap-1.5">
            <Maximize className="h-3 w-3 shrink-0 text-slate" aria-hidden />
            <span className="font-mono text-[10px] tracking-wide text-slate uppercase">Block size</span>
            <input
              id={sizeInputId}
              type="number"
              inputMode="numeric"
              min={MIN_SIZE_M}
              max={MAX_SIZE_M}
              step={50}
              value={sizeInput}
              onChange={(e) => setSizeInput(e.target.value)}
              onBlur={() => setSizeInput(String(clampSize(Number(sizeInput))))}
              className="w-14 rounded border bg-transparent px-1 py-0.5 text-right font-mono text-[11px] text-paper outline-none"
              style={{ borderColor: "var(--border-strong)" }}
              aria-label={`Area side length in meters, ${MIN_SIZE_M} to ${MAX_SIZE_M}`}
            />
            <span className="font-mono text-[10px] text-slate">m</span>
          </label>
          <button
            type="submit"
            disabled={!query.trim() || status === "loading"}
            className="flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 font-mono text-[10.5px] font-medium text-accent-strong transition-opacity disabled:opacity-40"
            style={{ background: "var(--accent-dim)", border: "1px solid var(--accent-border)" }}
          >
            <Radar className="h-3 w-3" aria-hidden />
            Scan
          </button>
        </div>
        {Number(sizeInput) !== size && sizeInput !== "" && (
          <p className="px-3 pb-2 font-mono text-[10px] text-slate">
            Clamped to {MIN_SIZE_M}–{MAX_SIZE_M}m — will scan a {size}m box.
          </p>
        )}
      </form>

      {candidates.length > 0 && (
        <div
          className="pointer-events-auto mt-1.5 flex flex-col overflow-hidden rounded-md border shadow-sm backdrop-blur-sm"
          style={{ borderColor: "var(--border)", background: "var(--overlay)" }}
        >
          {candidates.map((c) => (
            <button
              key={`${c.lat},${c.lng}`}
              type="button"
              onClick={() => scanResult(c)}
              className="border-b px-2.5 py-2 text-left text-[11.5px] text-ash last:border-b-0 hover:text-paper"
              style={{ borderColor: "var(--border)" }}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}

      {status === "error" && errorMessage && (
        <div className="pointer-events-none mt-1.5 rounded-md border px-2.5 py-1.5 text-[11px] text-slate backdrop-blur-sm" style={{ borderColor: "var(--border)", background: "var(--overlay)" }}>
          {errorMessage}
        </div>
      )}
      {!candidates.length && status !== "error" && areaLabel && (
        <div className="pointer-events-none mt-1.5 rounded-md border px-2.5 py-1.5 text-[11px] text-slate backdrop-blur-sm" style={{ borderColor: "var(--border)", background: "var(--overlay)" }}>
          Live scan of <span className="text-ash">{areaLabel}</span> — a new FortyGuard call, not the demo area.
        </div>
      )}
    </div>
  );
}
