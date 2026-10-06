import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  ...(process.env.VETRA_DEPLOY_TARGET === 'node' ? { output: 'standalone' } : {}),
};

export default nextConfig;
