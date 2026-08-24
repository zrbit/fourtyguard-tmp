"use client";

import { useEffect, useRef, useState } from "react";
import { Map as MaplibreMap, NavigationControl } from "maplibre-gl";
import { LoaderCircle } from "lucide-react";
import type { City } from "@/types/thermal";

const CENTERS: Record<City, [number, number]> = {
  "Los Angeles": [-118.245, 34.054],
  Chicago: [-87.631, 41.883],
  "New York City": [-73.987, 40.713],
};

export default function LiveMapLoading({ city, status }: { city: City; status: string }) {
  const element = useRef<HTMLDivElement>(null);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!element.current) return;
    const map = new MaplibreMap({
      container: element.current,
      style: "https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json",
      center: CENTERS[city],
      zoom: 14,
      attributionControl: { compact: true },
    });
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    return () => map.remove();
  }, [city]);
  useEffect(() => { setElapsed(0); const timer = window.setInterval(() => setElapsed(value => value + 1), 1000); return () => window.clearInterval(timer); }, [city]);
  return <div className="relative flex flex-1"><div ref={element} className="h-full w-full" /><div className="pointer-events-none absolute inset-0 flex items-center justify-center"><div className="w-72 rounded-md border px-4 py-3 shadow-lg" style={{ borderColor: "var(--border-strong)", background: "rgba(18,21,26,0.9)" }}><div className="flex items-center gap-2 font-mono text-xs tracking-wide text-paper"><LoaderCircle className="h-4 w-4 animate-spin text-accent" />{status}</div><div className="mt-2 font-mono text-[10px] tracking-wide text-slate">This tab · {elapsed}s</div></div></div></div>;
}
