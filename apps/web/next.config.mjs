import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// OpenNext's dev helper can keep the process alive; only enable it locally.
if (process.env.NODE_ENV !== "production") {
  initOpenNextCloudflareForDev();
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  compress: true,
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  // A no-op webpack hook opts Next out of the build worker path, which avoids
  // sandbox-unfriendly helper processes during production builds.
  webpack: (config) => config,
  compiler: {
    removeConsole: process.env.NODE_ENV === "production",
  },
  experimental: {
    optimizePackageImports: ["react-bootstrap-icons"],
  },
};

export default nextConfig;
