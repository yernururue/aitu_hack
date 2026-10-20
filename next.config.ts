import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  outputFileTracingIncludes: {
    "/*": ["./data/catalog/places.json"],
    "/api/recommend": ["./data/index/places.json"],
  },
  outputFileTracingExcludes: {
    "/*": [
      "./data/raw/**/*",
      "./data/private/**/*",
      "./data/index/cache*.json",
      "./data/index/query*.json",
      "./data/index/cache/**/*",
      "./data/index/queries/**/*",
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
