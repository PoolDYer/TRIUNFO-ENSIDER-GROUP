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
    assert.equal(day.complete,true);
    assert.equal(day.grossProfit,1500);
    assert.equal(day.totalDeductions,2200);
    assert.ok(Math.abs(day.marginPercent!-26.6666666667)<0.000001);
    assert.equal(day.soldItems.reduce((sum,i)=>sum+i.revenue,0),day.sold);
    assert.equal(day.soldItems.reduce((sum,i)=>sum+(i.cost??0),0),day.investment);
    assert.equal(day.expenseItems.reduce((sum,i)=>sum+i.amount,0),day.operating+day.fixed);
    assert.equal(day.expenseItems.length,3);
    await pg.query("UPDATE products SET purchase_price=9999 WHERE id=$1",[p]);
    assert.equal((await read("2026-11-05","day")).result,800);
    const week=await read("2026-11-05","week");
    assert.equal(week.sold,3000);assert.equal(week.result,-1200);assert.equal(week.loss,1200);
    assert.equal(week.daily.length,7);
    const month=await read("2026-11-05","month");
    assert.equal(month.sold,6000);assert.equal(month.result,300);
    assert.equal(month.daily.length,30);
    assert.equal(month.daily.reduce((sum,d)=>sum+(d.result??0),0),month.result);
    assert.equal(month.expenseItems.length,4);
    assert.equal((await read("2026-11-07","day")).result,0);
    await pg.query("UPDATE sale_items SET purchase_price=NULL WHERE sale_id IN (SELECT id FROM sales WHERE date='2026-11-05')");
    const pending=await read("2026-11-05","day");
    assert.equal(pending.missingCosts,1);assert.equal(pending.result,null);assert.equal(pending.loss,null);assert.equal(pending.gain,null);
    assert.equal(pending.missingSaleCosts,1);assert.equal(pending.missingLossCosts,0);
    assert.equal(pending.complete,false);assert.equal(pending.soldItems[0].cost,null);
    assert.equal(pending.marginPercent,null);
  } finally {await pg.close();}
});

test("Ganancias detecta ventas inconsistentes y distingue un costo de pérdida faltante de la inversión conocida",async()=>{
  const pg=new PGlite();try {
    await pg.exec(schema);
    const u=randomUUID(),p=randomUUID(),s=randomUUID();
    await pg.query("INSERT INTO users(id,name,email,password_hash,role) VALUES($1,'Admin','admin@triunfoensidergroup','test','ADMIN')",[u]);
    await pg.query("INSERT INTO products(id,code,name,stock,sale_price,purchase_price) VALUES($1,'P1','Producto',0,1000,500)",[p]);
    await pg.query("INSERT INTO sales(id,date,cash,digital,debt,method,total,user_id) VALUES($1,'2026-11-05',2000,0,0,'NONE',2000,$2)",[s,u]);
    await pg.query("INSERT INTO sale_items(id,sale_id,product_id,code,name,quantity,unit_price,purchase_price) VALUES($1,$2,$3,'P1','Producto',2,1000,500)",[randomUUID(),s,p]);
    await pg.query("INSERT INTO sale_losses(sale_id,product_id,code,name,quantity,unit_price,purchase_price) VALUES($1,$2,'P1','Producto',1,1000,NULL)",[s,p]);
    let d=await profitDashboard(pg as DB,"2026-11-05","2026-11-05");
    assert.equal(d.missingSaleCosts,0);assert.equal(d.missingLossCosts,1);
    assert.equal(d.investment,1000);assert.equal(d.grossProfit,1000);assert.equal(d.result,null);
    assert.equal(d.lostItems[0].cost,null);assert.equal(d.lostItems[0].value,1000);
    await pg.query("UPDATE sale_losses SET purchase_price=500 WHERE sale_id=$1",[s]);
    d=await profitDashboard(pg as DB,"2026-11-05","2026-11-05");
    assert.equal(d.result,500);assert.equal(d.totalDeductions,1500);
    assert.equal(d.lostItems.reduce((sum,i)=>sum+(i.cost??0),0),d.productLossCost);
    await pg.query("UPDATE sales SET total=3000,cash=3000 WHERE id=$1",[s]);
    d=await profitDashboard(pg as DB,"2026-11-05","2026-11-05");
    assert.equal(d.inconsistentSales,1);assert.equal(d.complete,false);
    assert.equal(d.result,null);assert.equal(d.gain,null);assert.equal(d.loss,null);
    const empty=await profitDashboard(pg as DB,"2026-11-06","2026-11-06");
    assert.equal(empty.result,0);assert.equal(empty.marginPercent,null);assert.equal(empty.complete,true);
    await pg.query("INSERT INTO expenses(id,date,kind,detail,amount,user_id) VALUES($1,'2026-11-06','FIXED','Alquiler',5000,$2)",[randomUUID(),u]);
    const expenseOnly=await profitDashboard(pg as DB,"2026-11-06","2026-11-06");
    assert.equal(expenseOnly.sold,0);assert.equal(expenseOnly.result,-5000);assert.equal(expenseOnly.loss,5000);
  }finally{await pg.close();}
});
