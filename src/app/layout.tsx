import type { Metadata } from "next";
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
    >
      <body
        className="min-h-full flex flex-col bg-ground text-paper font-sans"
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
