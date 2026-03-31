const withBundleAnalyzer = require("@next/bundle-analyzer")({ // eslint-disable-line @typescript-eslint/no-require-imports
  enabled: process.env.ANALYZE === "true",
});
const { withSentryConfig } = require("@sentry/nextjs"); // eslint-disable-line @typescript-eslint/no-require-imports

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  compress: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
  compiler: {
    removeConsole: process.env.NODE_ENV === "production",
  },
  serverExternalPackages: ["next-mdx-remote"],
  experimental: {
    optimizePackageImports: ["react-bootstrap-icons"],
  },
  async redirects() {
    return [
      {
        source: "/news",
        destination: "/blog",
        permanent: true,
      },
      {
        source: "/news/:path*",
        destination: "/blog",
        permanent: true,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/rss.xml",
        destination: "/feed/rss.xml",
      },
      {
        source: "/atom.xml",
        destination: "/feed/atom.xml",
      },
      {
        source: "/feed.json",
        destination: "/feed/feed.json",
      },
      {
        source: "/rss",
        destination: "/feed/rss.xml",
      },
      {
        source: "/feed",
        destination: "/feed/rss.xml",
      },
      {
        source: "/atom",
        destination: "/feed/atom.xml",
      },
      {
        source: "/json",
        destination: "/feed/feed.json",
      },
    ];
  },
};

module.exports = withSentryConfig(withBundleAnalyzer(nextConfig), {
  silent: true,
  disableLogger: true,
  hideSourceMaps: true,
  automaticVercelMonitors: false,
  telemetry: false,
});
