import type { NextConfig } from "next";

const isCapacitor = process.env.NEXT_PUBLIC_IS_CAPACITOR === "true";

const nextConfig: NextConfig = {
  ...(isCapacitor ? { output: "export" as const } : {}),
  images: {
    unoptimized: true,
    localPatterns: [
      { pathname: "/icons/**" },
    ],
  },
};

export default nextConfig;
