import type { NextConfig } from "next";
import { productionRedirects } from "./lib/canonical-redirects";
const config: NextConfig = {
  serverExternalPackages: ["pg", "@electric-sql/pglite"],
  poweredByHeader: false,
  devIndicators: false,
  turbopack: { root: process.cwd() },
  async redirects() {
    return productionRedirects(process.env.APP_URL, process.env.VERCEL_ENV);
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "same-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value: `default-src 'self'; manifest-src 'self'; script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`,
          },
        ],
      },
    ];
  },
};
export default config;
