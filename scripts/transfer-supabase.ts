import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve, relative, isAbsolute } from "node:path";
import { parseEnv } from "node:util";
import { Pool } from "pg";
import { PGlite } from "@electric-sql/pglite";
import { postgresConfig } from "../lib/postgres-config";
import { schema } from "../lib/schema";
import { supabaseSecurity } from "../lib/supabase-security";
import { snapshotDatabase, restoreDatabase } from "../lib/database-transfer";
import type { DB } from "../lib/db";

async function main() {
  const sourcePath = process.argv[2];
  if (!sourcePath) throw new Error("Indica una copia offline de PGlite dentro de .work; nunca la base activa.");
  const base = resolve(".work");
  const source = resolve(sourcePath);
  const within = relative(base, source);
  if (!within || within.startsWith("..") || isAbsolute(within) || !existsSync(source))
    throw new Error("La fuente debe ser una copia existente dentro de .work.");
  const env = parseEnv(readFileSync(".env.supabase.local", "utf8"));
  if (!env.DATABASE_URL) throw new Error("Configura DATABASE_URL en .env.supabase.local.");
  const url = new URL(env.DATABASE_URL);
  if (!url.hostname.endsWith(".pooler.supabase.com")) throw new Error("Se requiere el pooler de Supabase.");
  // Sesión persistente para la transferencia; la aplicación utiliza 6543.
  url.port = "5432";
  const ca = env.DATABASE_SSL_CA || readFileSync(env.DATABASE_SSL_CA_FILE || ".work/supabase-ca.crt", "utf8");
  const pool = new Pool(postgresConfig(url.toString(), ca));
  const pid = resolve(source, "postmaster.pid");
  if (existsSync(pid)) unlinkSync(pid); // Solo la copia offline de trabajo, nunca .local-db.
  const local = new PGlite(source);
  try {
    await local.exec(schema);
    const snapshots = await local.transaction(async tx => {
      await tx.query("SET LOCAL TIME ZONE 'UTC'");
      return snapshotDatabase(tx as DB);
    });
    writeFileSync(resolve(source, "../transferencia-privada.json"), JSON.stringify(snapshots), { flag: "wx" });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      try {
        await client.query("SET LOCAL TIME ZONE 'UTC'");
        await client.query("SET LOCAL lock_timeout = '10s'");
        const role = await client.query("SELECT rolsuper OR rolbypassrls AS privileged FROM pg_roles WHERE rolname=current_user");
        if (!role.rows[0]?.privileged) throw new Error("La conexión debe utilizar postgres del proyecto.");
        await client.query(schema);
        await client.query(supabaseSecurity);
        const verified = await restoreDatabase(client, snapshots);
        await client.query("COMMIT");
        writeFileSync(resolve(source, "../verificacion-transferencia.json"), JSON.stringify({ verifiedAt: new Date().toISOString(), tables: verified }, null, 2));
        console.log(JSON.stringify({ migrated: true, tables: verified.map(({ table, count }) => ({ table, count })) }));
      } catch (error) { await client.query("ROLLBACK"); throw error; }
    } finally { client.release(); }
  } finally { await local.close(); await pool.end(); }
}
main().catch(error => {
  // Los errores de PostgreSQL pueden incluir información privada: mostrar solo el código.
  console.error(error?.code ? `Transferencia detenida. Código PostgreSQL: ${error.code}.` : error.message);
  process.exitCode = 1;
});
