import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Avoid Next picking a parent-folder lockfile as root (e.g. pnpm-lock.yaml above this app).
  outputFileTracingRoot: path.join(process.cwd()),
  webpack: (config, { dev }) => {
    // Dev OOM fix on Windows: persistent pack cache can throw "Array buffer allocation failed"
    if (dev) {
      config.cache = false;
    }
    return config;
  },
};

export default nextConfig;
