import { Pool } from "pg";
import { postgresConfig } from "./postgres-config";
import { attachDatabasePool } from "@vercel/functions";
import { PGlite } from "@electric-sql/pglite";
export type DB = {
  query: (
    sql: string,
    params?: any[],
  ) => Promise<{ rows: any[]; rowCount?: number | null }>;
};
const g = globalThis as unknown as {
  triunfoPool?: Pool;
  triunfoLocal?: PGlite;
};
function local() {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL)
    throw new Error("La base local no está permitida en producción.");
  return (g.triunfoLocal ??= new PGlite(".local-db"));
}
function pool() {
  if (!process.env.DATABASE_URL)
    throw new Error("Falta configurar DATABASE_URL.");
  if (!g.triunfoPool) {
    g.triunfoPool = new Pool(postgresConfig(process.env.DATABASE_URL));
    attachDatabasePool(g.triunfoPool);
  }
  return g.triunfoPool;
}
export const db: DB = {
  async query(sql, params = []) {
    if (process.env.LOCAL_DATABASE === "true") {
      if (!params.length && sql.includes(";")) {
        const result = await local().exec(sql);
        const last = result.at(-1);
        return {
          rows: (last?.rows ?? []) as any[],
          rowCount: last?.affectedRows,
        };
      }
      const result = await local().query(sql, params);
      return { rows: result.rows as any[], rowCount: result.affectedRows };
    }
    return pool().query(sql, params);
  },
};
export async function transaction<T>(
  fn: (client: DB) => Promise<T>,
): Promise<T> {
  if (process.env.LOCAL_DATABASE === "true")
    return local().transaction(async (tx) =>
      fn({
        query: async (s, p = []) => {
          const r = await tx.query(s, p);
          return { rows: r.rows as any[], rowCount: r.affectedRows };
        },
      }),
    );
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    const r = await fn(client);
    await client.query("COMMIT");
    return r;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
export async function closeDB() {
  await g.triunfoPool?.end();
  await g.triunfoLocal?.close();
}
