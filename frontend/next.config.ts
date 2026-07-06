import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    const serverUrl = process.env.SERVER_URL ?? "http://localhost:4000";
    return [
      {
        source: "/api/:path*",
        destination: `${serverUrl}/api/:path*`,
      },
      {
        source: "/socket.io",
        destination: `${serverUrl}/socket.io`,
      },
      {
        source: "/socket.io/:path*",
        destination: `${serverUrl}/socket.io/:path*`,
      },
    ];
  },
};

export default nextConfig;
