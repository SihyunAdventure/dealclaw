import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "thumbnail.coupangcdn.com",
      },
      {
        protocol: "https",
        hostname: "image.coupangcdn.com",
      },
    ],
  },
};

export default nextConfig;
