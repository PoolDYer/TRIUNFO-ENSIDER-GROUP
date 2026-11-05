import type { DB } from "./db";
import { applicationTables } from "./supabase-security";

export type TableSnapshot = { table: string; rows: string[]; fingerprint: string };
const tableName = (name: string) => {
  if (!applicationTables.includes(name)) throw new Error("Tabla de transferencia no permitida.");
  return `public."${name}"`;
};

export async function tableFingerprint(db: DB, table: string) {
  const result = await db.query(`SELECT count(*)::text AS count,
    md5(coalesce(string_agg(to_jsonb(t)::text, E'\\n' ORDER BY (to_jsonb(t)::text) COLLATE "C"),'')) AS fingerprint
    FROM ${tableName(table)} t`);
  return { count: String(result.rows[0].count), fingerprint: String(result.rows[0].fingerprint) };
}

/** Ejecutar sobre una instantánea consistente de la fuente, con zona horaria UTC. */
export async function snapshotDatabase(source: DB): Promise<TableSnapshot[]> {
  const result: TableSnapshot[] = [];
  for (const table of applicationTables) {
    // Mantener JSON como texto evita redondear bigint y perder precisión de fechas.
    const data = await source.query(`SELECT to_jsonb(t)::text AS row FROM ${tableName(table)} t ORDER BY (to_jsonb(t)::text) COLLATE "C"`);
    result.push({ table, rows: data.rows.map(r => r.row), fingerprint: (await tableFingerprint(source, table)).fingerprint });
  }
  return result;
}

/** El llamador debe abrir una transacción: todo se copia o todo se revierte. */
export async function restoreDatabase(target: DB, snapshots: TableSnapshot[]) {
  if (snapshots.length !== applicationTables.length || snapshots.some((s, i) => s.table !== applicationTables[i]))
    throw new Error("El respaldo no contiene el conjunto completo y ordenado de tablas.");
  await target.query(`LOCK TABLE ${applicationTables.map(tableName).join(",")} IN ACCESS EXCLUSIVE MODE`);
  for (const table of applicationTables) {
    const result = await target.query(`SELECT EXISTS(SELECT 1 FROM ${tableName(table)}) AS occupied`);
    if (result.rows[0].occupied) throw new Error(`La tabla ${table} ya contiene datos. No se sobrescribió el destino.`);
  }
  for (const snapshot of snapshots) {
    for (const row of snapshot.rows)
      await target.query(`INSERT INTO ${tableName(snapshot.table)} SELECT (jsonb_populate_record(NULL::${tableName(snapshot.table)}, $1::jsonb)).*`, [row]);
    const actual = await tableFingerprint(target, snapshot.table);
    if (actual.count !== String(snapshot.rows.length) || actual.fingerprint !== snapshot.fingerprint)
      throw new Error(`La verificación de ${snapshot.table} no coincide con el respaldo.`);
  }
  return snapshots.map(s => ({ table: s.table, count: s.rows.length, fingerprint: s.fingerprint }));
}
