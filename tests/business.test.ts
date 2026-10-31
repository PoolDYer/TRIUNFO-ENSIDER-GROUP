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
test("Venta descuenta stock, conserva precio y registra auditoría", async () => {
  const f = await fixture();
  try {
    await f.run("sale", {
      ...sale(f.productId, 3),
      digital: 5,
      method: "YAPE",
      reference: "Y123",
    });
    assert.equal(
      (await f.c.query("SELECT stock FROM products")).rows[0].stock,
      7,
    );
    const r = await report(f.c, "2026-10-30", "2026-10-30", "day");
    assert.equal(r.totals.billing, 3000);
    assert.equal(r.totals.digital, 500);
    assert.equal(r.totals.netCash, 2500);
    await f.c.query("UPDATE products SET sale_price=9999");
    assert.equal(
      (await report(f.c, "2026-10-30", "2026-10-30", "day")).totals.billing,
      3000,
    );
    assert.equal(
      (await f.c.query("SELECT count(*)::int AS n FROM audit_log")).rows[0].n,
      1,
    );
  } finally {
    await f.pg.close();
  }
});
test("Venta con stock insuficiente revierte todos los registros", async () => {
  const f = await fixture();
  try {
    await assert.rejects(
      f.run("sale", sale(f.productId, 11)),
      /Stock insuficiente/,
    );
    assert.equal(
      (await f.c.query("SELECT stock FROM products")).rows[0].stock,
      10,
    );
    assert.equal(
      (await f.c.query("SELECT count(*)::int AS n FROM sales")).rows[0].n,
      0,
    );
  } finally {
    await f.pg.close();
  }
});
test("Diez intentos simultáneos no venden más de lo disponible", async () => {
  const f = await fixture();
  try {
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => f.run("sale", sale(f.productId, 2))),
    );
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 5);
    assert.equal(
      (await f.c.query("SELECT stock FROM products")).rows[0].stock,
      0,
    );
    assert.equal(
      (await f.c.query("SELECT count(*)::int AS n FROM sales")).rows[0].n,
      5,
    );
  } finally {
    await f.pg.close();
  }
});
test("Mismo identificador no duplica ventas ni descuenta dos veces", async () => {
  const f = await fixture();
  try {
    const s = sale(f.productId);
    await f.run("sale", s);
    await assert.rejects(f.run("sale", s));
    assert.equal(
      (await f.c.query("SELECT stock FROM products")).rows[0].stock,
      9,
    );
  } finally {
    await f.pg.close();
  }
});
test("Pago excesivo o digital sin referencia no se registra", async () => {
  const f = await fixture();
  try {
    await assert.rejects(
      f.run("sale", { ...sale(f.productId), digital: 20 }),
      /superar/,
    );
    await assert.rejects(
      f.run("sale", { ...sale(f.productId), digital: 5, method: "YAPE" }),
      /código/,
    );
  } finally {
    await f.pg.close();
  }
});

test("Entradas suman stock y validan el saldo al contado y crédito", async () => {
  const f = await fixture();
  try {
    const input = {
      id: randomUUID(),
      date: "2026-10-30",
      productId: f.productId,
      quantity: 20,
      supplier: "Proveedor",
      orderCost: 100,
      paid: 40,
      modality: "CREDIT",
    };
    await f.run("receipt", input);
    assert.equal(
      (await f.c.query("SELECT stock FROM products")).rows[0].stock,
      30,
    );
    assert.equal(
      Number(
        (await f.c.query("SELECT order_cost-paid AS balance FROM receipts"))
          .rows[0].balance,
      ),
      6000,
    );
    await assert.rejects(
      f.run("receipt", { ...input, id: randomUUID(), modality: "CASH" }),
      /Al contado/,
    );
  } finally {
    await f.pg.close();
  }
});



