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
  const u: User = {
    id: randomUUID(),
    role: "SELLER",
    name: "Administrador",
    email: "ventas@triunfoensidergroup",
    must_change_password: false,
  };
  await pg.query(
    "INSERT INTO users(id,role,name,email,password_hash) VALUES($1,$2,$3,$4,'test')",
    [u.id, u.role, u.name, u.email],
  );
  const ids = [randomUUID(), randomUUID()];
  await pg.query(
    "INSERT INTO products(id,code,name,stock,sale_price,purchase_price) VALUES($1,'A','Producto A',0,5000,815),($2,'B','Producto B',0,9000,1020)",
    ids,
  );
  const order = {
    id: randomUUID(),
    date: "2026-11-04",
    modality: "CREDIT",
    expectedOrderCost: 44.85,
    items: [
      { productId: ids[0], quantity: 3 },
      { productId: ids[1], quantity: 2 },
    ],
  };
  const run = (action: string, data: unknown) =>
    pg.transaction((tx) => operate(tx as DB, u, action, data));
  return { pg, ids, order, run };
}

test("Un pedido de varios productos actualiza ambos stocks y crea una sola deuda al 2 % fijo", async () => {
  const { pg, order, run } = await fixture();
  try {
    await run("receiptOrder", {
      ...order,
      supplier: "Otro",
      interestPercent: 10,
      paid: 44.85,
      creditPrincipal: 1,
    });
    const history = await financingReport(pg as DB);
    assert.equal(history.credits.length, 1);
    const credit = history.credits[0];
    assert.equal(credit.name, "Producto A · Producto B");
    assert.equal(credit.code, "A / B");
    assert.equal(credit.supplier, "CORP. G.S. S.A.");
    assert.equal(Number(credit.credit_principal), 4485);
    assert.equal(Number(credit.interest_bps), 200);
    assert.equal(Number(credit.total), 4575);
    assert.equal(Number(credit.paid), 0);
    const stock = (await pg.query("SELECT stock FROM products ORDER BY code"))
      .rows;
    assert.deepEqual(stock, [{ stock: 3 }, { stock: 2 }]);
    const lines = (
      await pg.query<{ quantity: number; unit_purchase_price: string }>(
        "SELECT quantity,unit_purchase_price FROM receipt_items ORDER BY code",
      )
    ).rows;
    assert.equal(lines.length, 2);
    assert.equal(Number(lines[0].unit_purchase_price), 815);
    await run("financingPayment", {
      id: randomUUID(),
      receiptId: order.id,
      date: order.date,
      amount: 45.75,
    });
    assert.equal((await financingReport(pg as DB)).payable.length, 0);
  } finally {
    await pg.close();
  }
});

test("Los pedidos rechazan totales desactualizados, productos repetidos y precios pendientes sin cambiar stock", async () => {
  const { pg, ids, order, run } = await fixture();
  try {
    await assert.rejects(
      run("receiptOrder", { ...order, expectedOrderCost: 1 }),
      /precio de compra cambió/,
    );
    await assert.rejects(
      run("receiptOrder", {
        ...order,
        items: [order.items[0], order.items[0]],
      }),
      /una sola línea/,
    );
    await assert.rejects(
      run("receiptOrder", { ...order, items: [] }),
      /al menos un producto/,
    );
    await pg.query("UPDATE products SET purchase_price=NULL WHERE id=$1", [
      ids[1],
    ]);
    await assert.rejects(run("receiptOrder", order), /Confirma el precio/);
    assert.deepEqual(
      (await pg.query("SELECT stock FROM products ORDER BY code")).rows,
      [{ stock: 0 }, { stock: 0 }],
    );
    assert.equal((await financingReport(pg as DB)).credits.length, 0);
    await pg.query("UPDATE products SET purchase_price=1020 WHERE id=$1", [
      ids[1],
    ]);
    await run("receiptOrder", { ...order, modality: "CASH" });
    const cash = (await pg.query<{ paid: string; credit_principal: string | null }>("SELECT paid,credit_principal FROM receipts"))
      .rows[0];
    assert.equal(Number(cash.paid), 4485);
    assert.equal(cash.credit_principal, null);
  } finally {
    await pg.close();
  }
});
