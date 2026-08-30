export function MapLegend({ scale }: { scale: number }) {
  return (
    <div
      // Same bottom-sheet collision as BlockList below lg (see its comment)
      // — shift up to clear the sheet's peek height there.
      className="pointer-events-none absolute bottom-[calc(42dvh+12px)] left-4 z-10 hidden w-56 rounded-md border px-3.5 py-3 backdrop-blur-sm sm:block lg:bottom-4"
      style={{ borderColor: "var(--border)", background: "var(--overlay)" }}
    >
      <div
        className="h-2 rounded-full"
        style={{
          background:
            "linear-gradient(90deg, var(--thermal-cold-deep), var(--thermal-cold), var(--thermal-neutral), var(--thermal-hot), var(--thermal-hot-deep))",
        }}
      />
      <div className="mt-1.5 flex justify-between font-mono text-[10px] text-slate">
        <span>−{scale.toFixed(2)}°F</span>
        <span>nearby mean</span>
        <span>+{scale.toFixed(2)}°F</span>
      </div>
    </div>
  );
}
