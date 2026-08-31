"use client";

import { Moon, Sun } from "lucide-react";
import { useLayoutEffect, useState } from "react";

type Theme = "light" | "dark";

function activeTheme(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export function ThemeToggle() {
  // Always starts as "dark", matching the server-rendered HTML exactly, so
  // hydration never has to reconcile a mismatch: the <head> inline script
  // (see layout.tsx) already sets the real data-theme attribute on <html>
  // before paint, but it doesn't touch this icon -- only the layout effect
  // below does, which runs after hydration completes (so nothing to
  // compare against SSR output) but before the browser paints (so there's
  // no visible flash beyond this one icon, same trade-off the "Why not
  // useEffect" section of preventing-flash-before-hydration.md calls out).
  const [theme, setTheme] = useState<Theme>("dark");

  useLayoutEffect(() => {
    setTheme(activeTheme());
  }, []);

  function toggleTheme() {
    const nextTheme: Theme = activeTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem("heat-lens-theme", nextTheme);
    setTheme(nextTheme);
  }

  const isLight = theme === "light";
  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="flex h-8 w-8 items-center justify-center rounded-full border text-ash transition-colors hover:text-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      style={{ borderColor: "var(--border-strong)", background: "var(--surface-raised)" }}
      aria-label={`Switch to ${isLight ? "dark" : "light"} mode`}
      title={`Switch to ${isLight ? "dark" : "light"} mode`}
      suppressHydrationWarning
    >
      {isLight ? <Moon className="h-4 w-4" aria-hidden /> : <Sun className="h-4 w-4" aria-hidden />}
    </button>
  );
}
