export function MapLegend({ scale, theme }: { scale: number; theme: "light" | "dark" }) {
  const gradient = theme === "light"
    ? "linear-gradient(90deg, #136fa9, #5aaed5, #dbcab9, #e46f5c, #b93730)"
    : "linear-gradient(90deg, #2677bf, #61addb, #50636c, #e76e5a, #bd3d35)";
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
          background: gradient,
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
