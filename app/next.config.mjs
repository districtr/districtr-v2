/** @type {import('next').NextConfig} */

// Adapted from
// https://github.com/pgzmnk/nextjs-typescript/blob/main/next.config.js
const nextConfig = {
  transpilePackages: ["@duckdb/duckdb-wasm", "xterm"],
  reactStrictMode: false,
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  webpack(config, { isServer, dev }) {
    config.output.webassemblyModuleFilename =
      isServer && !dev
        ? "..static/wasm/[name].[moduleHash].wasm"
        : "static/wasm/[name].[moduleHash].wasm";
    config.experiments = { ...config.experiments, asyncWebAssembly: true };

    config.module.rules.push({
      test: /.*\.wasm$/,
      type: "asset/resource",
      generator: {
        filename: "static/wasm/[name].[contenthash][ext]",
      },
    });

    return config;
  },
};

export default nextConfig;
