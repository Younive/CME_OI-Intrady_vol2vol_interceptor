import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin Turbopack's workspace root to this app. A stray package-lock.json in a
  // parent dir (C:\Users\venna) otherwise makes Next infer the wrong root, which
  // breaks route resolution (every route 404s).
  turbopack: { root: "C:/Users/venna/Desktop/CME_OI-Intrady_vol2vol_interceptor/frontend" },
};

export default nextConfig;
