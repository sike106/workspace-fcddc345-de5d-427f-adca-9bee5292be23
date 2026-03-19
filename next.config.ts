import type { NextConfig } from "next";
import path from "path";

const basePathEnv = (process.env.NEXT_PUBLIC_BASE_PATH || "").trim();
const normalizedBasePath = basePathEnv
  ? basePathEnv.startsWith("/") ? basePathEnv : `/${basePathEnv}`
  : "";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath: normalizedBasePath || undefined,
  assetPrefix: normalizedBasePath || undefined,
  images: {
    unoptimized: true,
  },
  turbopack: {
    root: path.resolve(__dirname),
  },
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
