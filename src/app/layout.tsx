import type { Metadata } from "next";
import { Archivo, Public_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

const publicSans = Public_Sans({
  variable: "--font-public-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Thermal Reasoning Agent",
  description:
    "An evidence-based investigator for urban heat anomalies — why a block runs hotter or cooler than the blocks around it.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${archivo.variable} ${publicSans.variable} ${plexMono.variable} h-full antialiased`}
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
