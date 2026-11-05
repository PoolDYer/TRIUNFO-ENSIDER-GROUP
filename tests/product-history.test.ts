import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { schema } from "../lib/schema";
import { operate } from "../lib/operations";
import { report } from "../lib/reports";
import type { DB } from "../lib/db";
import type { User } from "../lib/auth";

test("Eliminar productos con ventas se rechaza y conserva facturación, detalle y stock", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(schema);
    const user: User = { id: randomUUID(), name: "Admin", email: "admin@triunfoensidergroup", role: "ADMIN", must_change_password: false };
    const productId = randomUUID();
    await pg.query("INSERT INTO users(id,name,email,password_hash,role) VALUES($1,'Admin',$2,'test','ADMIN')",[user.id,user.email]);
    await pg.query("INSERT INTO products(id,code,name,stock,sale_price,purchase_price) VALUES($1,'T1','Producto',10,1000,500)",[productId]);
    const run = (action: string, input: unknown) => pg.transaction(tx => operate(tx as DB,user,action,input));
    await run("sale", { id: randomUUID(), date: "2026-11-05", detail: "", items: [{ productId, quantity: 2, unitPrice: 10 }], digital: 0, debt: 0, method: "NONE", reference: "" });
    await assert.rejects(run("productDelete",{id:productId}),/historial/);
    const result = await report(pg as DB,"2026-11-05","2026-11-05","day");
    assert.equal(result.totals.billing,2000);
    assert.equal(result.items.length,1);
    assert.equal(Number(result.items[0].stock),8);
    await run("productStatus",{id:productId,active:false});
    assert.equal((await report(pg as DB,"2026-11-05","2026-11-05","day")).items.length,1);
  } finally { await pg.close(); }
});
