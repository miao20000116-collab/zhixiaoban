import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Hide Next.js bottom-left DevTools ("N" / Route / Turbopack / Preferences).
  // It is framework UI in English only — not part of the product, and not localizable.
  devIndicators: false,
  // Same-origin proxy → avoids browser CORS / Failed to fetch when calling the API.
  async rewrites() {
    const backend = process.env.BACKEND_PROXY_URL || "http://127.0.0.1:8000";
    return [
      {
        source: "/backend-api/:path*",
        destination: `${backend.replace(/\/$/, "")}/:path*`,
      },
    ];
  },
};

export default nextConfig;
