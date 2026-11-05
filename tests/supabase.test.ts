import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { schema } from "../lib/schema";
import { postgresConfig } from "../lib/postgres-config";
import { applicationTables, supabaseSecurity } from "../lib/supabase-security";

test("Supabase exige TLS y limita conexiones por instancia", () => {
  const config = postgresConfig("postgresql://postgres.ref:example@aws-0-test.pooler.supabase.com:6543/postgres");
  assert.equal(config.max, 1);
  assert.equal(new URL(config.connectionString!).searchParams.get("sslmode"), "require");
  assert.throws(() => postgresConfig("postgres://a:b@db.ref.supabase.co/postgres?sslmode=disable"), /TLS/);
  assert.equal(postgresConfig("postgres://a:b@localhost/test").max, 3);
});

test("La protección bloquea la API pública y conserva acceso privado e información", async () => {
  const pg = new PGlite();
  try {
    await pg.exec("CREATE ROLE anon; CREATE ROLE authenticated;");
    await pg.exec(schema);
    await pg.exec("INSERT INTO initial_reference VALUES ('test', 'test', '{}'); GRANT SELECT ON initial_reference TO anon, authenticated;");
    await pg.exec(supabaseSecurity);
    await pg.exec(supabaseSecurity);
    const secured = await pg.query<{ n: number }>("SELECT count(*)::int n FROM pg_class WHERE relnamespace='public'::regnamespace AND relname=ANY($1) AND relrowsecurity", [applicationTables]);
    assert.equal(secured.rows[0].n, applicationTables.length);
    assert.equal((await pg.query("SELECT * FROM initial_reference")).rows.length, 1);
    for (const role of ["anon", "authenticated"]) {
      await pg.exec(`SET ROLE ${role}`);
      await assert.rejects(pg.query("SELECT * FROM initial_reference"), /permission denied/);
      await pg.exec("RESET ROLE");
    }
  } finally { await pg.close(); }
});
