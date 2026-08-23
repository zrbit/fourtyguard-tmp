import { round } from "@/lib/utils";
import type { BlockMetrics } from "@/types/thermal";

type Row = {
  label: string;
  a: number;
  b: number;
  unit: string;
  max: number; // heuristic normalization range, for the delta bar only
};

function buildRows(a: BlockMetrics, b: BlockMetrics): Row[] {
  return [
    { label: "Temperature", a: a.temperature, b: b.temperature, unit: "°F", max: 20 },
    { label: "Surface temp", a: a.surfaceTemperature, b: b.surfaceTemperature, unit: "°F", max: 40 },
    { label: "Tree canopy", a: a.treeCanopyPct, b: b.treeCanopyPct, unit: "%", max: 40 },
    { label: "Impervious", a: a.imperviousSurfacePct, b: b.imperviousSurfacePct, unit: "%", max: 50 },
    { label: "Wind", a: a.windMph, b: b.windMph, unit: " mph", max: 8 },
    {
      label: "Building density",
      a: round(a.buildingDensity * 100, 0),
      b: round(b.buildingDensity * 100, 0),
      unit: "%",
      max: 30,
    },
  ];
}

export function CompareTable({ a, b }: { a: BlockMetrics; b: BlockMetrics }) {
  const rows = buildRows(a, b);

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse font-mono text-[13px]">
        <thead>
          <tr>
            <th className="px-0 py-2 text-left font-sans text-[11px] font-semibold tracking-wide text-slate uppercase">
              Metric
            </th>
            <th
              className="px-3 py-2 text-left font-sans text-[11px] font-semibold tracking-wide uppercase"
              style={{ color: "var(--accent-strong)" }}
            >
              A · {a.id}
            </th>
            <th className="px-3 py-2 text-left font-sans text-[11px] font-semibold tracking-wide text-ash uppercase">
              B · {b.id}
            </th>
            <th className="w-28 px-3 py-2 text-left font-sans text-[11px] font-semibold tracking-wide text-slate uppercase">
              Δ
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const diff = Math.abs(r.a - r.b);
            const width = Math.min(100, (diff / r.max) * 100);
            const left = Math.max(0, 50 - width / 2);
            return (
              <tr key={r.label} style={{ borderTop: "1px solid var(--border)" }}>
                <td className="px-0 py-2.5 font-sans text-[12.5px] text-ash">{r.label}</td>
                <td className="px-3 py-2.5 text-paper">
                  {r.a}
                  {r.unit}
                </td>
                <td className="px-3 py-2.5 text-paper">
                  {r.b}
                  {r.unit}
                </td>
                <td className="px-3 py-2.5">
                  <div className="relative h-[5px] rounded-full" style={{ background: "var(--border-strong)" }}>
                    <span
                      className="absolute top-0 bottom-0 rounded-full"
                      style={{ left: `${left}%`, width: `${width}%`, background: "var(--accent)" }}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
