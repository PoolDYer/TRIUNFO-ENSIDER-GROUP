import type { PoolConfig } from "pg";

/** Supabase se conecta exclusivamente desde el servidor, mediante PostgreSQL. */
export function postgresConfig(connectionString: string): PoolConfig {
  const url = new URL(connectionString);
  if (!["postgres:", "postgresql:"].includes(url.protocol))
    throw new Error("DATABASE_URL debe ser una conexión PostgreSQL.");
  const supabase = /\.(supabase\.com|supabase\.co)$/.test(url.hostname);
  if (supabase) {
    if (url.searchParams.has("sslmode") && !["require", "verify-ca", "verify-full"].includes(url.searchParams.get("sslmode")!))
      throw new Error("La conexión con Supabase debe usar TLS: sslmode=require.");
    if (!url.searchParams.has("sslmode")) url.searchParams.set("sslmode", "require");
  }
  return {
    connectionString: url.toString(),
    max: supabase ? 1 : 3,
    idleTimeoutMillis: 5000,
    connectionTimeoutMillis: 10000,
  };
}
