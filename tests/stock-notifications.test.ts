import {test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {PGlite} from "@electric-sql/pglite";
import {schema} from "../lib/schema";
import {operate} from "../lib/operations";
import {stockNotificationHistory,syncStockNotifications} from "../lib/stock-notifications";
import type {User} from "../lib/auth";
import type {DB} from "../lib/db";

test("Las alertas respetan el mínimo, conservan historia y no se repiten hasta reponer stock",async()=>{
 const pg=new PGlite();try {
   await pg.exec(schema);
   const u:User={id:randomUUID(),name:"Dueño",role:"ADMIN",email:"dueno@triunfoensidergroup",must_change_password:false};
   await pg.query("INSERT INTO users(id,name,email,password_hash,role) VALUES($1,$2,$3,'test','ADMIN')",[u.id,u.name,u.email]);
   const p=randomUUID();await pg.query("INSERT INTO products(id,code,name,stock,sale_price,purchase_price,min_stock) VALUES($1,'S1','Producto',10,1000,500,5)",[p]);
   const c=pg as DB;
   const run=(action:string,input:unknown)=>pg.transaction(tx=>operate(tx as DB,u,action,input));
   const sale=(quantity:number)=>run("sale",{id:randomUUID(),date:"2026-11-05",items:[{productId:p,quantity,unitPrice:10}],digital:0,method:"NONE",reference:""});
   await sale(5);assert.equal((await stockNotificationHistory(c)).notifications.length,0);
   await sale(1);let data=await stockNotificationHistory(c);
   assert.equal(data.unread,1);assert.equal(data.active,1);assert.equal(data.notifications[0].stock,4);
   const first=data.notifications[0].id;
   await sale(1);data=await stockNotificationHistory(c);
   assert.equal(data.notifications.length,1);assert.equal(data.notifications[0].current_stock,3);
   await c.query("UPDATE stock_notifications SET read_at=now()");
   assert.equal((await stockNotificationHistory(c)).unread,0);
   await run("receiptOrder",{id:randomUUID(),date:"2026-11-05",items:[{productId:p,quantity:10}],modality:"CASH",expectedOrderCost:50});
   data=await stockNotificationHistory(c);assert.equal(data.active,0);assert.ok(data.notifications[0].resolved_at);
   await sale(9);data=await stockNotificationHistory(c);
   assert.equal(data.notifications.length,2);assert.equal(data.active,1);assert.equal(data.unread,1);
   assert.ok(data.notifications.some(n=>n.id===first&&n.read_at&&n.resolved_at));
   await run("productStatus",{id:p,active:false});assert.equal((await stockNotificationHistory(c)).active,0);
   await c.query("DELETE FROM sale_items");await c.query("DELETE FROM receipts");await c.query("DELETE FROM products WHERE id=$1",[p]);
   await syncStockNotifications(c);assert.equal((await stockNotificationHistory(c)).notifications.length,2);
 }finally{await pg.close();}
});
