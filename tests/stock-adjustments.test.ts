import {test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {PGlite} from "@electric-sql/pglite";
import {schema} from "../lib/schema";
import {operate} from "../lib/operations";
import {stockNotificationHistory} from "../lib/stock-notifications";
import type {DB} from "../lib/db";
import type {User} from "../lib/auth";

async function fixture(){
 const pg=new PGlite();await pg.exec(schema);const user:User={id:randomUUID(),name:'Dueño',email:'dueno@triunfoensidergroup',role:'ADMIN',must_change_password:false};
 await pg.query("INSERT INTO users(id,name,email,password_hash,role) VALUES($1,$2,$3,'test','ADMIN')",[user.id,user.name,user.email]);
 const productId=randomUUID();await pg.query("INSERT INTO products(id,code,name,stock,min_stock,sale_price,purchase_price) VALUES($1,'P1','Producto',20,10,1000,500)",[productId]);
 const c=pg as DB;const run=(input:unknown,u=user)=>pg.transaction(tx=>operate(tx as DB,u,'productStock',input));
 const input=(stock=5)=>({id:randomUUID(),productId,stock,expectedStock:20,reason:'Conteo físico'});
 return {pg,c,user,productId,run,input};
}
test("Solo el Dueño ajusta el total; registra valores previos, motivo, auditoría y alertas sin generar ventas o entradas",async()=>{
 const f=await fixture();try{
  const p=f.input();await assert.rejects(f.run(p,{...f.user,role:'SELLER'}),/Solo el dueño/);
  await f.run(p);
  const product=(await f.c.query('SELECT * FROM products WHERE id=$1',[f.productId])).rows[0];
  assert.equal(product.stock,5);assert.equal(Number(product.sale_price),1000);assert.equal(Number(product.purchase_price),500);
  const row=(await f.c.query('SELECT * FROM stock_adjustments')).rows[0];assert.equal(row.previous_stock,20);assert.equal(row.new_stock,5);assert.equal(row.reason,p.reason);assert.equal(row.user_id,f.user.id);assert.ok(row.created_at);
  assert.equal((await stockNotificationHistory(f.c)).active,1);
  await f.run({...f.input(15),expectedStock:5});assert.equal((await stockNotificationHistory(f.c)).active,0);
  for(const table of ['sales','receipts','expenses','treasury'])assert.equal((await f.c.query(`SELECT id FROM ${table}`)).rows.length,0);
  assert.equal((await f.c.query("SELECT id FROM audit_log WHERE action='productStock'")).rows.length,2);
 }finally{await f.pg.close();}
});
test("Admite cero y rechaza vacíos, negativos, fracciones, cambios sin motivo y stock desactualizado",async()=>{
 const f=await fixture();try{
  for(const stock of ['',null,true,-1,1.5,1000001])await assert.rejects(f.run({...f.input(),stock}));
  await assert.rejects(f.run({...f.input(),reason:' '}));
  await assert.rejects(f.run(f.input(20)),/distinta/);
  await f.c.query('UPDATE products SET stock=19 WHERE id=$1',[f.productId]);
  await assert.rejects(f.run(f.input()),/stock cambió/);
  await f.run({...f.input(0),expectedStock:19});assert.equal((await f.c.query('SELECT stock FROM products')).rows[0].stock,0);
 }finally{await f.pg.close();}
});
test("Los reintentos no duplican ajustes y dos cambios simultáneos no sobrescriben el stock nuevo",async()=>{
 const f=await fixture();try{
  const p=f.input();await f.run(p);await f.run(p);
  assert.equal((await f.c.query('SELECT id FROM stock_adjustments')).rows.length,1);
  assert.equal((await f.c.query("SELECT id FROM audit_log WHERE action='productStock'")).rows.length,1);
  await assert.rejects(f.run({...p,stock:6}),/otro ajuste/);
  const result=await Promise.allSettled([f.run({...f.input(6),expectedStock:5}),f.run({...f.input(7),expectedStock:5})]);
  assert.equal(result.filter(r=>r.status==='fulfilled').length,1);
 }finally{await f.pg.close();}
});
test("Un fallo de auditoría revierte el ajuste completo y su historial",async()=>{
 const f=await fixture();try{
  await assert.rejects(f.pg.transaction(tx=>operate({query:async(sql,params)=>{if(sql.includes('INSERT INTO audit_log'))throw Error('Fallo simulado');return (tx as DB).query(sql,params);}},f.user,'productStock',f.input())),/Fallo simulado/);
  assert.equal((await f.c.query('SELECT stock FROM products')).rows[0].stock,20);
  assert.equal((await f.c.query('SELECT id FROM stock_adjustments')).rows.length,0);
 }finally{await f.pg.close();}
});
