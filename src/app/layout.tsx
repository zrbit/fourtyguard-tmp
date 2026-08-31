import type { Metadata } from "next";
import { InlineScript } from "@/components/ui/InlineScript";
import "./globals.css";

export const metadata: Metadata = {
  title: "Thermal Reasoning Agent",
  description:
    "An evidence-based investigator for urban heat anomalies — why a block runs hotter or cooler than the blocks around it.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
      suppressHydrationWarning
    >
      <head>
        <InlineScript
          html={`(() => { try { const saved = localStorage.getItem("heat-lens-theme"); const theme = saved === "light" || saved === "dark" ? saved : matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"; document.documentElement.dataset.theme = theme; } catch { document.documentElement.dataset.theme = "dark"; } })();`}
        />
      </head>
      <body
        className="min-h-full flex flex-col bg-ground text-paper font-sans"
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
