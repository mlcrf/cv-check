import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf.js loads its worker at runtime, so it must stay out of the server bundle (bundled, the API
  // route fails with "Setting up fake worker failed"). The build then warns that
  // "pdfjs-dist can't be external" because the browser preview code also references the worker;
  // that warning is harmless.
  serverExternalPackages: ["pdfjs-dist"],
};

export default nextConfig;
