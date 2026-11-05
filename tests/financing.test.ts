import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { schema } from "../lib/schema";
import { operate } from "../lib/operations";
import { financingReport } from "../lib/financing";
import type { User } from "../lib/auth";
import type { DB } from "../lib/db";

async function fixture() {
  const pg = new PGlite();
  await pg.exec(schema);
  const user: User = {
    id: randomUUID(),
    name: "Administrador",
    email: "administrador@triunfoensidergroup",
    role: "SELLER",
    must_change_password: false,
  };
  const productId = randomUUID();
  await pg.query(
    "INSERT INTO users(id,name,email,password_hash,role) VALUES($1,$2,$3,'test','SELLER')",
    [user.id, user.name, user.email],
  );
  await pg.query(
    "INSERT INTO products(id,code,name,stock,sale_price,purchase_price) VALUES($1,'F1','Producto',0,1000,20000)",
    [productId],
  );
  const wrap = (tx: any): DB => ({
    query: async (sql, params = []) => {
      const r = await tx.query(sql, params);
      return { rows: r.rows as any[] };
    },
  });
  const c = wrap(pg);
  const run = (action: string, data: any, u = user) =>
    pg.transaction((tx) => operate(wrap(tx), u, action, data));
  const receipt = (date = "2026-11-03", extra = {}) => ({
    id: randomUUID(),
    date,
    productId,
    quantity: 1,
    supplier: "Proveedor",
    orderCost: 200,
    paid: 0,
    modality: "CREDIT",
    creditPrincipal: 200,
    ...extra,
  });
  const pay = (receiptId: string, date: string, amount: number) =>
    run("financingPayment", { id: randomUUID(), receiptId, date, amount });
  const read = (_date?: string) => financingReport(c);
  return { pg, c, user, productId, run, receipt, pay, read };
}

test("Crédito de 200 al 2 % genera 204, permite editar el interés y no lo capitaliza", async () => {
  const f = await fixture();
  try {
    const r = f.receipt();
    await f.run("receipt", r);
    let d = await f.read(r.date);
    assert.equal(Number(d.credits[0].total), 20400);
    await f.pay(r.id, r.date, 50);
    d = await f.read(r.date);
    assert.equal(Number(d.credits[0].total), 20400);
    assert.equal(Number(d.credits[0].paid), 5000);
    await f.run("receipt", f.receipt(r.date, { interestPercent: 5 }));
    d = await f.read(r.date);
    assert.ok(d.credits.some((r) => Number(r.total) === 21000));
    await f.run("receipt", f.receipt(r.date, { modality: "CASH", paid: 200 }));
    assert.equal((await f.read(r.date)).credits.length, 2);
  } finally {
    await f.pg.close();
  }
});

test("El historial incluye automáticamente todos los créditos y pagos de cualquier fecha", async () => {
  const f = await fixture();
  try {
    const old = f.receipt("2026-10-31"),
      current = f.receipt("2026-11-03"),
      next = f.receipt("2026-12-09");
    for (const r of [old, current, next]) await f.run("receipt", r);
    await f.pay(old.id, "2026-11-03", 20);
    await f.pay(current.id, "2026-12-01", 50);
    const history = await f.read();
    assert.equal(history.credits.length, 3);
    assert.equal(history.payments.length, 2);
    assert.equal(
      Number(history.credits.find((r) => r.id === old.id).paid),
      2000,
    );
    assert.equal(
      Number(history.credits.find((r) => r.id === current.id).paid),
      5000,
    );
    assert.equal(
      Number(
        history.payments.find((r) => r.receipt_id === current.id).paid_total,
      ),
      5000,
    );
    assert.equal(
      history.credits.find((r) => r.id === next.id).date,
      "2026-12-09",
    );
    assert.equal(
      history.payments.find((r) => r.receipt_id === current.id).date,
      "2026-12-01",
    );
  } finally {
    await f.pg.close();
  }
});

test("Pagos rechazan excesos, fechas anteriores, duplicados y abonos simultáneos que excedan el saldo", async () => {
  const f = await fixture();
  try {
    const r = f.receipt();
    await f.run("receipt", r);
    await assert.rejects(f.pay(r.id, "2026-11-02", 1), /anterior/);
    await assert.rejects(f.pay(r.id, r.date, 205), /supera/);
    await assert.rejects(f.pay(r.id, r.date, 0));
    const results = await Promise.allSettled([
      f.pay(r.id, r.date, 150),
      f.pay(r.id, r.date, 150),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    const payment = {
      id: randomUUID(),
      date: r.date,
      receiptId: r.id,
      amount: 54,
    };
    await f.run("financingPayment", payment);
    await assert.rejects(f.run("financingPayment", payment));
    const d = await f.read(r.date);
    assert.equal(Number(d.credits[0].paid), 20400);
    assert.equal(d.payable.length, 0);
    assert.equal(
      (
        await f.c.query(
          "SELECT count(*)::int AS n FROM audit_log WHERE action='financingPayment'",
        )
      ).rows[0].n,
      2,
    );
  } finally {
    await f.pg.close();
  }
});

test("La migración conserva créditos históricos sin interés y es repetible", async () => {
  const f = await fixture();
  try {
    const r = f.receipt();
    await f.c.query(
      "INSERT INTO receipts(id,date,product_id,quantity,supplier,order_cost,modality,paid,user_id) VALUES($1,$2,$3,1,'Anterior',20000,'CREDIT',5000,$4)",
      [r.id, r.date, f.productId, f.user.id],
    );
    await f.pg.exec(schema);
    await f.pg.exec(schema);
    const d = await f.read(r.date);
    assert.equal(Number(d.credits[0].credit_principal), 15000);
    assert.equal(Number(d.credits[0].total), 15000);
    await assert.rejects(
      f.run("receipt", f.receipt(r.date, { interestPercent: 101 })),
    );
    await assert.rejects(
      f.run("receipt", f.receipt(r.date, { creditPrincipal: undefined })),
      /monto a crédito/,
    );
  } finally {
    await f.pg.close();
  }
});

test("Entradas calculan costo y pago desde cantidad y precio de compra, ignorando importes manipulados", async () => {
  const f = await fixture();
  try {
    await f.c.query("UPDATE products SET purchase_price=815 WHERE id=$1", [
      f.productId,
    ]);
    const cash = f.receipt("2026-11-03", {
      quantity: 3,
      modality: "CASH",
      orderCost: 999,
      paid: 0,
    });
    await f.run("receipt", cash);
    let stored = (
      await f.c.query("SELECT order_cost,paid FROM receipts WHERE id=$1", [
        cash.id,
      ])
    ).rows[0];
    assert.equal(Number(stored.order_cost), 2445);
    assert.equal(Number(stored.paid), 2445);
    const credit = f.receipt("2026-11-03", {
      quantity: 10,
      creditPrincipal: 50,
      paid: 999,
    });
    await f.run("receipt", credit);
    stored = (
      await f.c.query("SELECT order_cost,paid FROM receipts WHERE id=$1", [
        credit.id,
      ])
    ).rows[0];
    assert.equal(Number(stored.order_cost), 8150);
    assert.equal(Number(stored.paid), 3150);
    const debt = (await f.read()).credits[0];
    assert.equal(Number(debt.total), 5100);
    await f.c.query("UPDATE products SET purchase_price=900 WHERE id=$1", [
      f.productId,
    ]);
    stored = (
      await f.c.query("SELECT order_cost FROM receipts WHERE id=$1", [cash.id])
    ).rows[0];
    assert.equal(Number(stored.order_cost), 2445);
    await assert.rejects(
      f.run("receipt", f.receipt("2026-11-03", { expectedOrderCost: 200 })),
      /precio de compra cambió/,
    );
    await assert.rejects(
      f.run("receipt", f.receipt("2026-11-03", { creditPrincipal: 10 })),
      /superar/,
    );
  } finally {
    await f.pg.close();
  }
});

test("Sin precio de compra confirmado se rechaza la entrada sin modificar stock", async () => {
  const f = await fixture();
  try {
    await f.c.query("UPDATE products SET purchase_price=NULL WHERE id=$1", [
      f.productId,
    ]);
    await assert.rejects(f.run("receipt", f.receipt()), /confirmar el precio/);
    assert.equal(
      (await f.c.query("SELECT stock FROM products WHERE id=$1", [f.productId]))
        .rows[0].stock,
      0,
    );
    assert.equal((await f.read()).credits.length, 0);
  } finally {
    await f.pg.close();
  }
});
