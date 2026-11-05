import { schema } from "./schema";

// Lista limitada a las tablas propias; nunca modifica auth/storage de Supabase.
export const applicationTables = Array.from(schema.matchAll(/CREATE TABLE IF NOT EXISTS ([a-z_]+)\s*\(/g), m => m[1]);

// El backend usa postgres; los roles de la API no necesitan acceso a estas tablas.
export const supabaseSecurity = applicationTables.map(table => `
ALTER TABLE public."${table}" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."${table}" FROM PUBLIC, anon, authenticated;
`).join("\n");
