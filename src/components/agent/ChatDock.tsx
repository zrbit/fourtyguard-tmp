"use client";

import { useState, type FormEvent } from "react";
import { ArrowUp } from "lucide-react";
import type { ThermalAnalysis } from "@/types/thermal";

type Message = { role: "user" | "agent"; text: string };

const CHIPS = [
  "What's the strongest evidence?",
  "Is this persistent?",
  "What's uncertain?",
  "What could cool it?",
] as const;

function scriptedAnswer(question: string, analysis: ThermalAnalysis): string {
  const top = analysis.hypotheses[0];
  switch (question) {
    case "What's the strongest evidence?":
      return top
        ? `${top.title} — ${top.confidence} confidence. ${top.explanation}`
        : "No hypothesis cleared the confidence bar for this block.";
    case "Is this persistent?": {
      const history = analysis.evidence.find((e) => e.category === "history");
      return history
        ? history.explanation
        : "No historical comparison is available for this block yet.";
    }
    case "What's uncertain?":
      return analysis.limitations.join(" ");
    case "What could cool it?":
      return "Intervention simulation (tree canopy, cool roofs, reflective pavement) is planned for a later phase — this build only reasons about the current state, it doesn't model changes to it.";
    default:
      return "Open-ended chat connects to the full reasoning agent in Phase 5 — for now, try one of the suggested questions above.";
  }
}

export function ChatDock({ analysis, blockLabel }: { analysis: ThermalAnalysis; blockLabel: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [value, setValue] = useState("");

  function ask(question: string) {
    setMessages((m) => [
      ...m,
      { role: "user", text: question },
      { role: "agent", text: scriptedAnswer(question, analysis) },
    ]);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const q = value.trim();
    if (!q) return;
    ask(q);
    setValue("");
  }

  return (
    <div className="rounded-md border p-4" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      <div className="mb-3 font-mono text-[10.5px] tracking-wider text-slate uppercase">
        Ask about {blockLabel}
      </div>

      {messages.length > 0 && (
        <div className="mb-3 flex max-h-56 flex-col gap-3 overflow-y-auto pr-1">
          {messages.map((m, i) => (
            <div
              key={i}
              className="text-[12.5px] leading-relaxed"
              style={{ color: m.role === "user" ? "var(--text-primary)" : "var(--text-secondary)" }}
            >
              <span className="mr-1.5 font-mono text-[10px] tracking-wide text-slate uppercase">
                {m.role === "user" ? "You" : "Agent"}
              </span>
              {m.text}
            </div>
          ))}
        </div>
      )}

      <div className="mb-3 flex flex-wrap gap-2">
        {CHIPS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => ask(c)}
            className="cursor-pointer rounded-full border px-3 py-1.5 font-sans text-xs text-ash transition-colors duration-150 hover:text-paper"
            style={{ borderColor: "var(--border-strong)" }}
          >
            {c}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="flex items-center gap-2 rounded-lg border px-3.5 py-2.5" style={{ borderColor: "var(--border)", background: "var(--surface-sunken)" }}>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={`Ask about ${blockLabel}…`}
          className="min-w-0 flex-1 bg-transparent text-[13px] text-paper placeholder:text-slate focus:outline-none"
        />
        <button
          type="submit"
          aria-label="Send"
          className="flex h-6 w-6 flex-none cursor-pointer items-center justify-center rounded-full"
          style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
        >
          <ArrowUp className="h-3.5 w-3.5" />
        </button>
      </form>
    </div>
  );
}
