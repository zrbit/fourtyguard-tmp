"use client";

import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";

const STEP_MS = 420;

function steps(nearbyBlockCount: number): string[] {
  return [
    "Establishing temperature anomaly",
    `Comparing ${nearbyBlockCount} nearby blocks`,
    "Checking vegetation and surface coverage",
    "Checking atmospheric conditions",
    "Examining urban geometry",
    "Testing alternative explanations",
    "Ranking contributing factors",
  ];
}

/**
 * A user-facing activity log, not hidden chain-of-thought (§12). Items
 * reveal sequentially to show visible work; on prefers-reduced-motion the
 * whole list resolves immediately instead of animating.
 */
export function InvestigationTimeline({
  active,
  nearbyBlockCount,
  onComplete,
}: {
  active: boolean;
  nearbyBlockCount: number;
  onComplete: () => void;
}) {
  const items = steps(nearbyBlockCount);
  const [done, setDone] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!active) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduced) {
      timer.current = setTimeout(() => {
        setDone(items.length);
        onComplete();
      }, 0);
      return () => {
        if (timer.current) clearTimeout(timer.current);
      };
    }

    let i = 0;
    const tick = () => {
      i += 1;
      setDone(i);
      if (i < items.length) {
        timer.current = setTimeout(tick, STEP_MS);
      } else {
        onComplete();
      }
    };
    timer.current = setTimeout(tick, STEP_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  if (!active) return null;
  // `done` only ever advances while active (this component is remounted
  // per investigation, see AnalysisPanel), so no separate reset is needed.

  return (
    <div className="flex flex-col" role="status" aria-label="Investigation progress">
      {items.map((label, i) => {
        const complete = i < done;
        const pending = i >= done;
        return (
          <div key={label} className="relative flex items-start gap-3 py-[9px]">
            {i < items.length - 1 && (
              <span
                className="absolute top-[26px] bottom-[-9px] left-[7px] w-px"
                style={{ background: "var(--border-strong)" }}
              />
            )}
            <span
              className="relative z-10 mt-0.5 flex h-4 w-4 flex-none items-center justify-center rounded-full border"
              style={{
                background: complete ? "var(--accent-dim)" : "var(--surface)",
                borderColor: complete ? "var(--accent-border)" : "var(--border-strong)",
              }}
            >
              {complete && <Check className="h-2.5 w-2.5" style={{ color: "var(--accent-strong)" }} />}
            </span>
            <span
              className="text-[13.5px]"
              style={{ color: pending ? "var(--text-tertiary)" : "var(--text-primary)" }}
            >
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
