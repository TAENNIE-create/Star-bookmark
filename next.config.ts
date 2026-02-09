import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  images: {
    unoptimized: true,
    localPatterns: [
      { pathname: "/icons/**" },
    ],
  },
};

export default nextConfig;
