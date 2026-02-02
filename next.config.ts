import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    localPatterns: [
      { pathname: "/icons/**" },
    ],
  },
};

export default nextConfig;
