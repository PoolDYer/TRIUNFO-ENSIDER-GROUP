import {test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {PGlite} from "@electric-sql/pglite";
import {schema} from "../lib/schema";
import {operate} from "../lib/operations";
import {profitDashboard} from "../lib/profit-dashboard";
import {report} from "../lib/reports";
import type {DB} from "../lib/db";
import type {User} from "../lib/auth";

async function fixture() {
 const pg=new PGlite();await pg.exec(schema);
 const u:User={id:randomUUID(),name:"Administrador",email:"administrador@triunfoensidergroup",role:"SELLER",must_change_password:false};
 await pg.query("INSERT INTO users(id,name,email,password_hash,role) VALUES($1,$2,$3,'test','SELLER')",[u.id,u.name,u.email]);
 const p=randomUUID(),q=randomUUID();
 await pg.query("INSERT INTO products(id,code,name,stock,sale_price,purchase_price) VALUES($1,'P1','Producto 1',10,1000,500),($2,'P2','Producto 2',10,2000,800)",[p,q]);
 const run=(data:any)=>pg.transaction(tx=>operate(tx as DB,u,"sale",data));
 const sale=()=>({id:randomUUID(),date:"2026-11-05",detail:"Unidades dañadas",items:[{productId:p,quantity:2,unitPrice:10}],digital:5,debt:0,method:"YAPE",reference:"test",losses:[{productId:p,quantity:1},{productId:q,quantity:2}]});
 return {pg,p,q,run,sale};
}

test("La pérdida adicional descuenta stock, calcula su monto y afecta ganancias sin cobrarla al cliente",async()=>{
 const {pg,p,run,sale}=await fixture();try {
   const data=sale();await run(data);
   assert.deepEqual((await pg.query("SELECT stock FROM products ORDER BY code")).rows,[{stock:7},{stock:8}]);
   const stored=(await pg.query<{cash:string;total:string;debt:string}>("SELECT cash,total,debt FROM sales")).rows[0];
   assert.equal(Number(stored.total),2000);assert.equal(Number(stored.cash),1500);assert.equal(Number(stored.debt),0);
   const summary=await report(pg as DB,data.date,data.date,"day");
   assert.equal(summary.totals.productLossAmount,5000);
   assert.equal(summary.totals.cashReceipts,1500);
   assert.equal(summary.items.reduce((s,i)=>s+Number(i.quantity),0),2);
   const profit=await profitDashboard(pg as DB,data.date,data.date);
   assert.equal(profit.productLossCost,2100);assert.equal(profit.result,-1100);
   await pg.query("UPDATE products SET sale_price=9900,purchase_price=9000 WHERE id=$1",[p]);
   assert.equal((await report(pg as DB,data.date,data.date,"day")).totals.productLossAmount,5000);
   assert.equal((await profitDashboard(pg as DB,data.date,data.date)).result,-1100);
   await assert.rejects(run(data));
   assert.deepEqual((await pg.query("SELECT stock FROM products ORDER BY code")).rows,[{stock:7},{stock:8}]);
 }finally{await pg.close();}
});

test("Valida stock combinado, motivo, pagos excesivos y cantidades sin dejar movimientos parciales",async()=>{
 const {pg,p,run,sale}=await fixture();try {
   await assert.rejects(run({...sale(),losses:[{productId:p,quantity:9}]}),/Stock insuficiente/);
   await assert.rejects(run({...sale(),digital:500}),/superar/);
   await assert.rejects(run({...sale(),detail:""}),/motivo/);
   await assert.rejects(run({...sale(),losses:[{productId:p,quantity:0}]}));
   await assert.rejects(run({...sale(),debt:1}),/producto y la cantidad/);
   assert.deepEqual((await pg.query("SELECT stock FROM products ORDER BY code")).rows,[{stock:10},{stock:10}]);
   assert.equal((await pg.query<{n:number}>("SELECT count(*)::int AS n FROM sales")).rows[0].n,0);
   const results=await Promise.allSettled([run({...sale(),losses:[{productId:p,quantity:5}]}),run({...sale(),losses:[{productId:p,quantity:5}]})]);
   assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
   assert.equal((await pg.query<{stock:number}>("SELECT stock FROM products WHERE id=$1",[p])).rows[0].stock,3);
 }finally{await pg.close();}
});

test("El código de operación es opcional en Yape y transferencias, pero el medio digital sigue siendo obligatorio",async()=>{
 const {pg,run,sale}=await fixture();try {
   const yape={...sale(),losses:[],reference:""};
   await run(yape);
   const transfer={...sale(),losses:[],method:"TRANSFER"};
   delete (transfer as {reference?:string}).reference;
   await run(transfer);
   const rows=(await pg.query<{reference:string;method:string}>("SELECT reference,method FROM sales ORDER BY method")).rows;
   assert.deepEqual(rows,[{reference:"",method:"TRANSFER"},{reference:"",method:"YAPE"}]);
   await assert.rejects(run({...sale(),method:"NONE",reference:""}),/medio digital/);
 }finally{await pg.close();}
});
