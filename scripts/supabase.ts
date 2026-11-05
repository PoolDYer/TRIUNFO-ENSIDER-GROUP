import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { Pool } from "pg";
import { postgresConfig } from "../lib/postgres-config";
import { schema } from "../lib/schema";
import { applicationTables, supabaseSecurity } from "../lib/supabase-security";

async function main() {
  // Archivo separado: no reemplaza ni carga las credenciales del sistema local.
  if (!existsSync(".env.supabase.local"))
    throw new Error("Configura DATABASE_URL en .env.supabase.local.");
  const connection = parseEnv(readFileSync(".env.supabase.local", "utf8")).DATABASE_URL ?? "";
  if (!connection || connection.includes("YOUR-PASSWORD") || connection.includes("PROJECT-REF"))
    throw new Error("Completa la URI privada de Supabase en .env.supabase.local.");
  const config = postgresConfig(connection);
  const url = new URL(config.connectionString!);
  if (!/\.(supabase\.com|supabase\.co)$/.test(url.hostname))
    throw new Error("Este comando requiere una conexión a Supabase.");
  const prepare = process.argv.includes("--prepare");
  if (prepare && url.port === "6543")
    throw new Error("Para preparar tablas utiliza Session pooler (5432); en Vercel usa Transaction pooler (6543).");
  const pool = new Pool(config);
  try {
    const client = await pool.connect();
    try {
      const { rows } = await client.query("SELECT current_user AS role, rolsuper OR rolbypassrls AS privileged FROM pg_roles WHERE rolname=current_user");
      if (!rows[0]?.privileged)
        throw new Error("Usa la URI del usuario postgres del proyecto para conservar el acceso privado del servidor.");
      console.log("Conexión PostgreSQL con Supabase verificada.");
      if (prepare) {
        await client.query("BEGIN");
        try {
          await client.query(schema);
          await client.query(supabaseSecurity);
          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        }
        console.log(`Esquema preparado y ${applicationTables.length} tablas protegidas. No se importaron ni reemplazaron datos.`);
      }
    } finally { client.release(); }
  } finally { await pool.end(); }
}

main().catch(error => {
  // Nunca imprimir errores del driver que puedan contener host, usuario o URI.
  if (error instanceof Error && !('code' in error)) console.error(error.message.startsWith("Invalid URL") ? "La URI PostgreSQL no es válida." : error.message);
  else console.error("No se pudo completar la conexión o preparación. Revisa la URI, contraseña, estado y acceso de red del proyecto.");
  process.exitCode = 1;
});
