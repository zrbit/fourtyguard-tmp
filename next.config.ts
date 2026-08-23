import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every viewport corner is real UI here (top bar, block-picker strip,
  // docked panel) — the floating dev indicator collides with something
  // wherever it sits, so switch it off rather than pick a "least bad"
  // corner. Dev-only; has no effect on production builds.
  devIndicators: false,
};

export default nextConfig;
