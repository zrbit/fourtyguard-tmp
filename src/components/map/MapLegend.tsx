export function MapLegend() {
  return (
    <div
      className="pointer-events-none absolute bottom-4 left-4 z-10 hidden w-56 rounded-md border px-3.5 py-3 backdrop-blur-sm sm:block"
      style={{ borderColor: "var(--border)", background: "rgba(13,15,19,0.72)" }}
    >
      <div
        className="h-2 rounded-full"
        style={{
          background:
            "linear-gradient(90deg, var(--thermal-cold-deep), var(--thermal-cold), var(--thermal-neutral), var(--thermal-hot), var(--thermal-hot-deep))",
        }}
      />
      <div className="mt-1.5 flex justify-between font-mono text-[10px] text-slate">
        <span>−6°F</span>
        <span>nearby median</span>
        <span>+6°F</span>
      </div>
    </div>
  );
}
