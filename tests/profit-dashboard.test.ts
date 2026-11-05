import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { schema } from "../lib/schema";
import { profitDashboard } from "../lib/profit-dashboard";
import { periodRange } from "../lib/validation";
import type { DB } from "../lib/db";

test("Ganancias resta el costo histórico y ambos gastos sin duplicar ventas y separa períodos",async()=>{
  const pg=new PGlite();
  try {
    await pg.exec(schema);
    const u=randomUUID(),p=randomUUID();
    await pg.query("INSERT INTO users(id,name,email,password_hash,role) VALUES($1,'Admin','admin@triunfoensidergroup','test','ADMIN')",[u]);
    await pg.query("INSERT INTO products(id,code,name,stock,sale_price,purchase_price) VALUES($1,'P1','Producto',0,1000,800)",[p]);
    for(const date of ["2026-11-05","2026-11-09","2026-12-01"]) {
      const sale=randomUUID();
      await pg.query("INSERT INTO sales(id,date,cash,digital,debt,method,total,user_id) VALUES($1,$2,3000,0,0,'NONE',3000,$3)",[sale,date,u]);
      await pg.query("INSERT INTO sale_items(id,sale_id,product_id,code,name,quantity,unit_price,purchase_price) VALUES($1,$2,$3,'P1','Producto',3,1000,500)",[randomUUID(),sale,p]);
    }
    for(const [date,kind,amount] of [["2026-11-05","OPERATING",200],["2026-11-05","OPERATING",100],["2026-11-05","FIXED",400],["2026-11-06","FIXED",2000],["2026-12-01","FIXED",9999]]) {
      await pg.query("INSERT INTO expenses(id,date,kind,detail,amount,user_id) VALUES($1,$2,$3,'Prueba',$4,$5)",[randomUUID(),date,kind,amount,u]);
    }
    const read=(date:string,period:string)=>{const {start,end}=periodRange(date,period);return profitDashboard(pg as DB,start,end);};
    const day=await read("2026-11-05","day");
    assert.equal(day.sold,3000);assert.equal(day.investment,1500);
    assert.equal(day.operating,300);assert.equal(day.fixed,400);
    assert.equal(day.result,800);assert.equal(day.gain,800);assert.equal(day.loss,0);
    await pg.query("UPDATE products SET purchase_price=9999 WHERE id=$1",[p]);
    assert.equal((await read("2026-11-05","day")).result,800);
    const week=await read("2026-11-05","week");
    assert.equal(week.sold,3000);assert.equal(week.result,-1200);assert.equal(week.loss,1200);
    assert.equal(week.daily.length,7);
    const month=await read("2026-11-05","month");
    assert.equal(month.sold,6000);assert.equal(month.result,300);
    assert.equal(month.daily.length,30);
    assert.equal((await read("2026-11-07","day")).result,0);
    await pg.query("UPDATE sale_items SET purchase_price=NULL WHERE sale_id IN (SELECT id FROM sales WHERE date='2026-11-05')");
    const pending=await read("2026-11-05","day");
    assert.equal(pending.missingCosts,1);assert.equal(pending.result,null);assert.equal(pending.loss,null);assert.equal(pending.gain,null);
  } finally {await pg.close();}
});
