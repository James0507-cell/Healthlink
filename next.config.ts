import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root so Turbopack does not walk up to the home directory.
  turbopack: { root: import.meta.dirname },
  experimental: {
    // Allow the FHIR facade to accept transaction bundles.
    serverActions: { bodySizeLimit: "8mb" },
  },
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
