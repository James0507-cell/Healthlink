import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root so Turbopack does not walk up to the home directory.
  turbopack: { root: import.meta.dirname },

  // Keep the Postgres driver out of the bundle. It is CommonJS with optional
  // native bindings, so it must be required at runtime rather than bundled;
  // bundling it produces "Critical dependency: the request of a dependency is an
  // expression" warnings and can break the connection pool on a serverless host.
  // Next.js traces it into the deployment automatically.
  serverExternalPackages: ["pg"],

  experimental: {
    // Allow the FHIR facade to accept transaction bundles.
    serverActions: { bodySizeLimit: "8mb" },
  },

  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
