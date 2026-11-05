export function productionRedirects(appUrl: string | undefined, vercelEnvironment: string | undefined) {
  if (vercelEnvironment !== "production" || !appUrl) return [];
  const canonical = new URL(appUrl);
  if (canonical.protocol !== "https:" || canonical.username || canonical.password || canonical.pathname !== "/" || canonical.search || canonical.hash)
    throw new Error("APP_URL debe ser el origen HTTPS público, sin rutas ni credenciales.");
  return [{
    source: "/:path*",
    destination: `${canonical.origin}/:path*`,
    permanent: false,
    missing: [{ type: "host" as const, value: canonical.host.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") }],
  }];
}
