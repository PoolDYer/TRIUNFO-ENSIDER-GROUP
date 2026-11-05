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
    name: "Dueño",
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
    "INSERT INTO products(id,code,name,stock,sale_price,purchase_price) VALUES($1,'P001','Afeitador',10,1000,500)",
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

test("Eliminar un administrador cierra sesiones, preserva ventas y permite reutilizar su correo", async () => {
  const f = await fixture();
  try {
    const sellerId = randomUUID();
    await f.c.query(
      "INSERT INTO users(id,name,email,password_hash,role) VALUES($1,'Administrador','nuevo@triunfoensidergroup','unused','SELLER')",
      [sellerId],
    );
    await f.c.query(
      "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES('test-session',$1,now()+interval '1 hour')",
      [sellerId],
    );
    await f.run("sale", sale(f.productId), {
      ...f.user,
      id: sellerId,
      role: "SELLER",
    });
    await f.run("userDelete", { id: sellerId });
    const deleted = (
      await f.c.query("SELECT active,deleted_at FROM users WHERE id=$1", [
        sellerId,
      ])
    ).rows[0];
    assert.equal(deleted.active, false);
    assert.ok(deleted.deleted_at);
    assert.equal(
      (
        await f.c.query(
          "SELECT count(*)::int AS n FROM sessions WHERE user_id=$1",
          [sellerId],
        )
      ).rows[0].n,
      0,
    );
    assert.equal(
      (
        await f.c.query(
          "SELECT s.user_id,u.name FROM sales s JOIN users u ON u.id=s.user_id",
        )
      ).rows[0].name,
      "Administrador",
    );
    assert.equal(
      (await report(f.c, "2026-10-30", "2026-10-30", "day")).totals.billing,
      1000,
    );
    assert.equal(
      (
        await f.c.query(
          "SELECT count(*)::int AS n FROM audit_log WHERE action='userDelete' AND entity_id=$1",
          [sellerId],
        )
      ).rows[0].n,
      1,
    );
    await f.run("user", {
      name: "Nuevo administrador",
      email: "nuevo@triunfoensidergroup",
      password: "Temporary-12345",
    });
    assert.equal(
      (
        await f.c.query(
          "SELECT count(*)::int AS n FROM users WHERE email='nuevo@triunfoensidergroup' AND deleted_at IS NULL",
        )
      ).rows[0].n,
      1,
    );
    await assert.rejects(f.run("userDelete", { id: sellerId }), /ya no existe/);
    await assert.rejects(
      f.run("userStatus", { id: sellerId, active: true }),
      /ya no existe/,
    );
    await assert.rejects(
      f.run("resetPassword", { id: sellerId, password: "Temporary-12345" }),
      /ya no existe/,
    );
  } finally {
    await f.pg.close();
  }
});

test("Solo el dueño puede eliminar administradores y no puede eliminar dueños", async () => {
  const f = await fixture();
  try {
    await assert.rejects(
      f.run("userDelete", { id: f.user.id }),
      /propia cuenta/,
    );
    await assert.rejects(
      f.run("userDelete", { id: randomUUID() }, { ...f.user, role: "SELLER" }),
      /dueño/,
    );
    const otherAdmin = randomUUID();
    await f.c.query(
      "INSERT INTO users(id,name,email,password_hash,role) VALUES($1,'Otro admin','otro@triunfoensidergroup','unused','ADMIN')",
      [otherAdmin],
    );
    await assert.rejects(
      f.run("userDelete", { id: otherAdmin }),
      /cuenta de dueño/,
    );
    await assert.rejects(
      f.run("userDelete", { id: randomUUID() }),
      /ya no existe/,
    );
  } finally {
    await f.pg.close();
  }
});

test("Eliminar un administrador libera un cupo cuando ya existen diez cuentas", async () => {
  const f = await fixture();
  try {
    await f.c.query(
      "INSERT INTO users(id,name,email,password_hash,role) SELECT gen_random_uuid(),'Administrador','v'||n||'@triunfoensidergroup','unused','SELLER' FROM generate_series(1,9) n",
    );
    const sellerId = (
      await f.c.query("SELECT id FROM users WHERE role='SELLER' LIMIT 1")
    ).rows[0].id;
    await assert.rejects(
      f.run("user", {
        name: "Nuevo",
        email: "ultimo@triunfoensidergroup",
        password: "Temporary-12345",
      }),
      /máximo/,
    );
    await f.run("userDelete", { id: sellerId });
    await f.run("user", {
      name: "Nuevo",
      email: "ultimo@triunfoensidergroup",
      password: "Temporary-12345",
    });
    assert.equal(
      (
        await f.c.query(
          "SELECT count(*)::int AS n FROM users WHERE deleted_at IS NULL",
        )
      ).rows[0].n,
      10,
    );
  } finally {
    await f.pg.close();
  }
});

test("La migración conserva los usuarios existentes y se puede repetir", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(
      "CREATE TABLE users (id uuid PRIMARY KEY,name text NOT NULL,email text UNIQUE NOT NULL,password_hash text NOT NULL,role text NOT NULL,active boolean NOT NULL DEFAULT true,must_change_password boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL DEFAULT now())",
    );
    const id = randomUUID();
    await pg.query(
      "INSERT INTO users(id,name,email,password_hash,role) VALUES($1,'Dueño','admin@triunfoensidergroup','preservar','ADMIN')",
      [id],
    );
    await pg.exec(schema);
    await pg.exec(schema);
    const user = (
      await pg.query(
        "SELECT id,password_hash,deleted_at FROM users WHERE id=$1",
        [id],
      )
    ).rows[0] as any;
    assert.equal(user.id, id);
    assert.equal(user.password_hash, "preservar");
    assert.equal(user.deleted_at, null);
  } finally {
    await pg.close();
  }
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
test("Fórmulas del ejemplo: diario 1947 y semanal 7792; neto semanal 7637", () => {
  const base = {
    billing: 222500,
    digital: 23500,
    operating: 3300,
    fixed: 0,
    debt: 1000,
    opening: 0,
    deposits: 0,
    deliveries: 0,
  };
  assert.equal(calculateTotals(base, "day").excelCash, 194700);
  const weekly = calculateTotals(
    { ...base, billing: 806000, fixed: 15500, debt: 0 },
    "week",
  );
  assert.equal(weekly.excelCash, 779200);
  assert.equal(weekly.netCash, 763700);
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
    emailSchema.safeParse("administrador@triunfoensidergroup").success,
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
test("Pago excesivo o pago digital sin medio no se registra", async () => {
  const f = await fixture();
  try {
    await assert.rejects(
      f.run("sale", { ...sale(f.productId), digital: 20 }),
      /superar/,
    );
    await assert.rejects(
      f.run("sale", { ...sale(f.productId), digital: 5, method: "NONE" }),
      /medio digital/,
    );
  } finally {
    await f.pg.close();
  }
});
test("Administrador no puede editar productos, usuarios ni ingresar cuenta corriente", async () => {
  const f = await fixture();
  try {
    const u = { ...f.user, role: "SELLER" } as User;
    await assert.rejects(f.run("product", {}, u), /dueño/);
    await assert.rejects(f.run("user", {}, u), /dueño/);
    await assert.rejects(
      f.run(
        "bank",
        {
          id: randomUUID(),
          date: "2026-10-30",
          kind: "INCOME",
          detail: "Cuenta",
          amount: 200,
        },
        u,
      ),
      /dueño/,
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
      creditPrincipal: 60,
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
    await f.run("receipt", { ...input, id: randomUUID(), modality: "CASH" });
    const cash = (await f.c.query("SELECT order_cost,paid FROM receipts WHERE modality='CASH'")).rows[0];
    assert.equal(Number(cash.order_cost),10000);
    assert.equal(Number(cash.paid),10000);
  } finally {
    await f.pg.close();
  }
});
test("Cuenta corriente del ejemplo: 2800 - 130 = 2670, dos semanas = 5340", async () => {
  const f = await fixture();
  try {
    for (const date of ["2026-10-19", "2026-10-26"]) {
      for (const amount of [200, 500, 300, 400, 600, 500, 300])
        await f.run("bank", {
          id: randomUUID(),
          date,
          kind: "INCOME",
          detail: "Cuenta corriente diario",
          amount,
        });
      for (const amount of [20, 50, 60])
        await f.run("bank", {
          id: randomUUID(),
          date,
          kind: "WITHDRAWAL",
          detail: "Disposición",
          amount,
        });
    }
    const r = await report(f.c, "2026-10-26", "2026-11-01", "week");
    assert.equal(r.totals.bankIncome, 280000);
    assert.equal(r.totals.bankWithdrawals, 13000);
    assert.equal(r.totals.bankNet, 267000);
    assert.equal(r.totals.bankAccumulated, 534000);
  } finally {
    await f.pg.close();
  }
});
test("Gastos, deudas, apertura y entregas no multiplican la facturación", async () => {
  const f = await fixture();
  try {
    await f.run("sale", sale(f.productId, 10));
    for (const amount of [10, 5, 8, 10])
      await f.run("expense", {
        id: randomUUID(),
        date: "2026-10-30",
        kind: "OPERATING",
        detail: "Comida / pasaje",
        amount,
      });
    await f.run("expense", {
      id: randomUUID(),
      date: "2026-10-30",
      kind: "FIXED",
      detail: "Servicio",
      amount: 15,
    });
    await f.run("treasury", {
      id: randomUUID(),
      date: "2026-10-30",
      kind: "DEBT",
      detail: "Deuda",
      amount: 10,
    });
    await f.run("treasury", {
      id: randomUUID(),
      date: "2026-10-30",
      kind: "DELIVERY",
      detail: "Entrega",
      amount: 5,
    });
    await f.run("opening", { date: "2026-10-30", amount: 20 });
    await assert.rejects(
      f.run("opening", { date: "2026-10-30", amount: 20 }),
      /apertura/,
    );
    const r = await report(f.c, "2026-10-30", "2026-10-30", "day");
    assert.equal(r.totals.billing, 10000);
    assert.equal(r.totals.excelCash, 5700);
    assert.equal(r.totals.netCash, 4200);
    assert.equal(r.totals.available, 5700);
  } finally {
    await f.pg.close();
  }
});
test("Máximo 10 cuentas incluso con creaciones simultáneas", async () => {
  const f = await fixture();
  try {
    await f.c.query(
      "INSERT INTO users(id,name,email,password_hash,role) SELECT gen_random_uuid(),'Administrador','v'||n||'@triunfoensidergroup','unused','SELLER' FROM generate_series(1,8) n",
    );
    const results = await Promise.allSettled(
      [1, 2].map((n) =>
        f.run("user", {
          name: "Nuevo",
          email: `nuevo${n}@triunfoensidergroup`,
          password: "Temporary-12345",
        }),
      ),
    );
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(
      (await f.c.query("SELECT count(*)::int AS n FROM users")).rows[0].n,
      10,
    );
  } finally {
    await f.pg.close();
  }
});
test("Eliminar venta devuelve el stock al producto y elimina el registro", async () => {
  const f = await fixture();
  try {
    const saleId = randomUUID();
    await f.run("sale", {
      id: saleId,
      date: "2026-10-30",
      detail: "Venta a eliminar",
      items: [{ productId: f.productId, quantity: 4, unitPrice: 10 }],
      digital: 0,
      debt: 0,
      method: "NONE",
      reference: "",
    });
    let prod = await f.c.query("SELECT stock FROM products WHERE id=$1", [f.productId]);
    assert.equal(prod.rows[0].stock, 6);

    await f.run("saleDelete", { id: saleId });
    prod = await f.c.query("SELECT stock FROM products WHERE id=$1", [f.productId]);
    assert.equal(prod.rows[0].stock, 10);

    const salesCount = await f.c.query("SELECT count(*)::int AS n FROM sales WHERE id=$1", [saleId]);
    assert.equal(salesCount.rows[0].n, 0);
  } finally {
    await f.pg.close();
  }
});
test("Eliminar entrada descuenta stock y rechaza si ya se vendió parte de la mercadería", async () => {
  const f = await fixture();
  try {
    const receiptId = randomUUID();
    await f.run("receipt", {
      id: receiptId,
      date: "2026-10-30",
      productId: f.productId,
      quantity: 5,
      supplier: "Proveedor",
      orderCost: 100,
      paid: 100,
      modality: "CASH",
    });
    let prod = await f.c.query("SELECT stock FROM products WHERE id=$1", [f.productId]);
    assert.equal(prod.rows[0].stock, 15);

    // Vender 12 unidades para dejar stock en 3 (menor a las 5 ingresadas)
    await f.run("sale", sale(f.productId, 12));
    prod = await f.c.query("SELECT stock FROM products WHERE id=$1", [f.productId]);
    assert.equal(prod.rows[0].stock, 3);

    // Debe rechazar porque el stock actual es 3 < 5
    await assert.rejects(
      f.run("receiptDelete", { id: receiptId }),
      /menor a la cantidad ingresada/,
    );

    // Devolvemos la venta anulándola
    const saleId = (await f.c.query("SELECT id FROM sales LIMIT 1")).rows[0].id;
    await f.run("saleDelete", { id: saleId });

    // Ahora el stock vuelve a 15, y receiptDelete debe funcionar
    await f.run("receiptDelete", { id: receiptId });
    prod = await f.c.query("SELECT stock FROM products WHERE id=$1", [f.productId]);
    assert.equal(prod.rows[0].stock, 10);
  } finally {
    await f.pg.close();
  }
});
test("Eliminar gastos, movimientos de tesorería, cuenta corriente y apertura", async () => {
  const f = await fixture();
  try {
    const expId = randomUUID();
    await f.run("expense", {
      id: expId,
      date: "2026-10-30",
      kind: "OPERATING",
      detail: "Gasto de prueba",
      amount: 50,
    });
    await f.run("expenseDelete", { id: expId });
    assert.equal(
      (await f.c.query("SELECT count(*)::int AS n FROM expenses")).rows[0].n,
      0,
    );

    const treasId = randomUUID();
    await f.run("treasury", {
      id: treasId,
      date: "2026-10-30",
      kind: "DEPOSIT",
      detail: "Depósito de prueba",
      amount: 100,
    });
    await f.run("treasuryDelete", { id: treasId });
    assert.equal(
      (await f.c.query("SELECT count(*)::int AS n FROM treasury")).rows[0].n,
      0,
    );

    const bankId = randomUUID();
    await f.run("bank", {
      id: bankId,
      date: "2026-10-30",
      kind: "INCOME",
      detail: "Ingreso bancario",
      amount: 500,
    });
    await f.run("bankDelete", { id: bankId });
    assert.equal(
      (await f.c.query("SELECT count(*)::int AS n FROM bank_movements")).rows[0].n,
      0,
    );

    await f.run("opening", { date: "2026-10-30", amount: 120 });
    await f.run("openingDelete", { date: "2026-10-30" });
    assert.equal(
      (await f.c.query("SELECT count(*)::int AS n FROM cash_openings")).rows[0].n,
      0,
    );
  } finally {
    await f.pg.close();
  }
});
test("Eliminar producto y reinicio total de datos del sistema", async () => {
  const f = await fixture();
  try {
    const newProdId = randomUUID();
    await f.run("product", {
      id: newProdId,
      code: "P999",
      name: "Producto a borrar",
      salePrice: 25,
      purchasePrice: 15,
      minStock: 5,
      stock: 20,
    });
    await f.run("productDelete", { id: newProdId });
    assert.equal(
      (await f.c.query("SELECT count(*)::int AS n FROM products WHERE id=$1", [newProdId])).rows[0].n,
      0,
    );

    // Crear varias operaciones y luego llamar a resetAllData
    await f.run("sale", sale(f.productId, 2));
    await f.run("expense", {
      id: randomUUID(),
      date: "2026-10-30",
      kind: "FIXED",
      detail: "Alquiler",
      amount: 200,
    });
    await f.run("resetAllData", { confirm: true });

    assert.equal((await f.c.query("SELECT count(*)::int AS n FROM sales")).rows[0].n, 0);
    assert.equal((await f.c.query("SELECT count(*)::int AS n FROM sale_items")).rows[0].n, 0);
    assert.equal((await f.c.query("SELECT count(*)::int AS n FROM receipts")).rows[0].n, 0);
    assert.equal((await f.c.query("SELECT count(*)::int AS n FROM expenses")).rows[0].n, 0);
    assert.equal((await f.c.query("SELECT count(*)::int AS n FROM treasury")).rows[0].n, 0);
    assert.equal((await f.c.query("SELECT count(*)::int AS n FROM bank_movements")).rows[0].n, 0);
    assert.equal((await f.c.query("SELECT count(*)::int AS n FROM cash_openings")).rows[0].n, 0);
    assert.equal((await f.c.query("SELECT count(*)::int AS n FROM products")).rows[0].n, 0);
    // Usuarios conservados
    assert.equal((await f.c.query("SELECT count(*)::int AS n FROM users")).rows[0].n, 1);
  } finally {
    await f.pg.close();
  }
});
