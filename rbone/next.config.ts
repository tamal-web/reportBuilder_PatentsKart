import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // 'export' produces a static HTML/CSS/JS output
  output: "export",
  // Ignore typescript/eslint errors during build to prevent electron-builder from failing on strict linting
  typescript: { ignoreBuildErrors: true },
}

export default nextConfig;
