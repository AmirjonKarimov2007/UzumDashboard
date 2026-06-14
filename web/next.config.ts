import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle for Docker — emits .next/standalone with only
  // the files/deps needed to run, so the production image stays small.
  output: "standalone",
  // Keep `next build` deterministic in CI/Docker — lint is run separately.
  eslint: { ignoreDuringBuilds: true },
  poweredByHeader: false,
  compress: true,
};

export default nextConfig;
