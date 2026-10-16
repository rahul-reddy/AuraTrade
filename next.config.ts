import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle for the container image (see Dockerfile).
  output: "standalone",
  // The Prisma client lives in src/generated and loads its native query engine
  // by path at runtime, which file tracing can miss; include it explicitly.
  outputFileTracingIncludes: {
    "/**": ["./src/generated/prisma/**/*"],
  },
};

export default nextConfig;
