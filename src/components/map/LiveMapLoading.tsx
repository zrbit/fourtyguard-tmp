"use client";

import { useEffect, useRef, useState } from "react";
import { Map as MaplibreMap, NavigationControl } from "maplibre-gl";
import { LoaderCircle } from "lucide-react";
import type { City } from "@/types/thermal";

const CENTERS: Record<City, [number, number]> = {
  "Los Angeles": [-118.4654, 34.1867], // San Fernando Valley (Van Nuys + Lake Balboa/Sepulveda Basin)
  Chicago: [-87.631, 41.883],
  "New York City": [-73.987, 40.713],
};
const BASEMAP_STYLE = "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json";

export default function LiveMapLoading({ city, status, center: centerOverride }: { city: City; status: string; center?: [number, number] }) {
  const element = useRef<HTMLDivElement>(null);
  const [elapsed, setElapsed] = useState(0);
  const center = centerOverride ?? CENTERS[city];
  useEffect(() => {
    if (!element.current) return;
    const map = new MaplibreMap({
      container: element.current,
      style: BASEMAP_STYLE,
      center,
      zoom: centerOverride ? 15.5 : 14,
      attributionControl: { compact: true },
    });
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    return () => map.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, center[0], center[1]]);
  useEffect(() => {
    const reset = window.setTimeout(() => setElapsed(0), 0);
    const timer = window.setInterval(() => setElapsed(value => value + 1), 1000);
    return () => { window.clearTimeout(reset); window.clearInterval(timer); };
  }, [city]);
  return <div className="relative flex flex-1"><div ref={element} className="h-full w-full" /><div className="pointer-events-none absolute inset-0 flex items-center justify-center"><div className="w-72 rounded-md border px-4 py-3 shadow-lg" style={{ borderColor: "var(--border-strong)", background: "var(--loading-overlay)" }}><div className="flex items-center gap-2 font-mono text-xs tracking-wide text-paper"><LoaderCircle className="h-4 w-4 animate-spin text-accent" />{status}</div><div className="mt-2 font-mono text-[10px] tracking-wide text-slate">This tab · {elapsed}s</div></div></div></div>;
}
