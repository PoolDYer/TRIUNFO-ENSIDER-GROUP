import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { schema } from "../lib/schema";
import { operate } from "../lib/operations";
import { report, calculateTotals } from "../lib/reports";
import {
  periodRange,
  moneySchema,
  dateSchema,
  emailSchema,
} from "../lib/validation";
import { hashPassword, verifyPassword } from "../lib/password";
import type { User } from "../lib/auth";
import { checkOrigin } from "../lib/auth";
import type { DB } from "../lib/db";
async function fixture() {
  const pg = new PGlite();
  await pg.exec(schema);
  const user: User = {
    id: randomUUID(),
    name: "Administrador",
    email: "admin@triunfoensidergroup",
    role: "ADMIN",
    must_change_password: false,
  };
  await pg.query(
    "INSERT INTO users(id,name,email,password_hash,role) VALUES($1,$2,$3,'unused','ADMIN')",
    [user.id, user.name, user.email],
  );
  const productId = randomUUID();
  await pg.query(
    "INSERT INTO products(id,code,name,stock,sale_price) VALUES($1,'P001','Afeitador',10,1000)",
    [productId],
  );
  const wrap = (c: any): DB => ({
    query: async (s, p = []) => {
      const r = await c.query(s, p);
      return { rows: r.rows as any[], rowCount: r.affectedRows };
    },
  });
  const c = wrap(pg);
  return {
    pg,
    c,
    user,
    productId,
    run: (action: string, data: any, u = user) =>
      pg.transaction((tx) => operate(wrap(tx), u, action, data)),
  };
}
const sale = (productId: string, quantity = 1) => ({
  id: randomUUID(),
  date: "2026-10-30",
  detail: "Venta",
  items: [{ productId, quantity, unitPrice: 10 }],
  digital: 0,
  debt: 0,
  method: "NONE",
  reference: "",
});
test("Origen valida el Host externo incluso detrás del proxy de Next", () => {
  assert.doesNotThrow(() =>
    checkOrigin(
      new Request("http://localhost:3000/api/operations", {
        headers: { Host: "127.0.0.1:3000", Origin: "http://127.0.0.1:3000" },
      }),
    ),
  );
  assert.throws(
    () =>
      checkOrigin(
        new Request("http://localhost:3000/api/operations", {
          headers: { Host: "127.0.0.1:3000", Origin: "https://otro.test" },
        }),
      ),
    /Origen/,
  );
});

test("Fechas de Lima, semanas lunes-domingo y fin de mes bisiesto", () => {
  assert.deepEqual(periodRange("2026-11-01", "week"), {
    start: "2026-10-26",
    end: "2026-11-01",
  });
  assert.deepEqual(periodRange("2024-02-15", "month"), {
    start: "2024-02-01",
    end: "2024-02-29",
  });
  assert.equal(dateSchema.safeParse("2026-02-30").success, false);
  assert.equal(moneySchema.safeParse(1.001).success, false);
  assert.equal(
    emailSchema.safeParse("vendedor@triunfoensidergroup").success,
    true,
  );
});
test("Contraseñas usan salt y rechazan credenciales equivocadas", async () => {
  const a = await hashPassword("Password-12345"),
    b = await hashPassword("Password-12345");
  assert.notEqual(a, b);
  assert.equal(await verifyPassword("Password-12345", a), true);
  assert.equal(await verifyPassword("incorrecta", a), false);
});










