import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  outputFileTracingIncludes: {
    "/*": ["./data/catalog/places.json"],
  },
  outputFileTracingExcludes: {
    "/*": [
      "./data/raw/**/*",
      "./data/private/**/*",
      "./data/normalized/**/*",
      "./data/collection/**/*",
      "./data/catalog/import-report.json",
      "./scripts/**/*",
      "./.env",
      "./.env.*",
    ],
  },
};

export default nextConfig;
