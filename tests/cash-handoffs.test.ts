import {test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {PGlite} from "@electric-sql/pglite";
import {schema} from "../lib/schema";
import {operate} from "../lib/operations";
import {cashHandoffBalances,cashHandoffReport} from "../lib/cash-handoffs";
import {report} from "../lib/reports";
import {today} from "../lib/validation";
import type {DB} from "../lib/db";
import type {User} from "../lib/auth";

async function fixture(){
 const pg=new PGlite();await pg.exec(schema);
 const user:User={id:randomUUID(),role:"SELLER",name:"Administrador",email:"caja@triunfoensidergroup",must_change_password:false};
 await pg.query("INSERT INTO users(id,name,email,password_hash,role) VALUES($1,$2,$3,'test','SELLER')",[user.id,user.name,user.email]);
 const sale=async(date:string,cash:number,digital:number,method:string)=>pg.query("INSERT INTO sales(id,date,cash,digital,debt,total,method,user_id) VALUES($1,$2,$3,$4,0,$5,$6,$7)",[randomUUID(),date,cash,digital,cash+digital,method,user.id]);
 await sale('2020-01-01',4000,6000,'YAPE');await sale('2020-01-02',6000,4000,'TRANSFER');await sale('9999-12-31',9000,10000,'YAPE');
 await pg.query("INSERT INTO cash_openings VALUES('2020-01-01',3000,$1)",[user.id]);
 await pg.query("INSERT INTO expenses(id,date,kind,detail,amount,user_id) VALUES($1,'2020-01-01','FIXED','Gasto',1000,$2)",[randomUUID(),user.id]);
 for(const [kind,amount] of [['DEBT',200],['DEPOSIT',300],['DELIVERY',500]])
  await pg.query("INSERT INTO treasury(id,date,kind,detail,amount,user_id) VALUES($1,'2020-01-01',$2,'Histórico',$3,$4)",[randomUUID(),kind,amount,user.id]);
 const c=pg as DB;
 const run=(action:string,input:unknown,u=user)=>pg.transaction(tx=>operate(tx as DB,u,action,input));
 const input=(cashAmount:number,yapeAmount:number,expectedCashAvailable=110,expectedYapeAvailable=60)=>({id:randomUUID(),cashAmount,yapeAmount,expectedCashAvailable:expectedCashAvailable*100,expectedYapeAvailable:expectedYapeAvailable*100,detail:'Entrega de prueba'});
 return {pg,user,c,run,input};
}

test("Acumula días pendientes, separa Yape de transferencias y registra entregas parciales y totales sin descontar dos veces",async()=>{
 const f=await fixture();try{
  let b=await cashHandoffBalances(f.c);assert.equal(b.cashAvailable,11000);assert.equal(b.yapeAvailable,6000);assert.equal(b.cashDelivered,500);
  const first=f.input(40,20);await f.run('cashHandoff',first);
  b=await cashHandoffBalances(f.c);assert.equal(b.cashAvailable,7000);assert.equal(b.yapeAvailable,4000);assert.equal(b.cashDelivered,4500);
  let history=await cashHandoffReport(f.c);assert.equal(history.total,2);
  const row=history.history.find(h=>h.id===first.id)!;assert.equal(row.user_name,f.user.name);assert.equal(Number(row.cash_available_before),11000);assert.equal(Number(row.yape_available_before),6000);assert.equal(row.date,today());assert.ok(row.created_at);
  const totals=(await report(f.c,'2020-01-01',today(),'day')).totals;assert.equal(totals.available,7000);
  await f.run('cashHandoff',f.input(70,40,70,40));
  b=await cashHandoffBalances(f.c);assert.equal(b.cashAvailable,0);assert.equal(b.yapeAvailable,0);assert.equal(b.yapeDelivered,6000);
  history=await cashHandoffReport(f.c);assert.equal(history.total,3);
 }finally{await f.pg.close();}
});

test("Rechaza excesos, valores vacíos, saldos desactualizados y la vía antigua de entregas; reintentar no duplica registros",async()=>{
 const f=await fixture();try{
  await assert.rejects(f.run('cashHandoff',f.input(110.01,0)),/físico supera/);
  await assert.rejects(f.run('cashHandoff',f.input(0,60.01)),/Yape supera/);
  await assert.rejects(f.run('cashHandoff',f.input(0,0)),/mayor a cero/);
  await assert.rejects(f.run('cashHandoff',{...f.input(1,0),cashAmount:''}));
  await assert.rejects(f.run('cashHandoff',f.input(1,0,109,60)),/saldos cambiaron/);
  await assert.rejects(f.run('treasury',{id:randomUUID(),date:today(),kind:'DELIVERY',detail:'Intento anterior',amount:1}),/Movimientos de la caja/);
  const input=f.input(10,15);await f.run('cashHandoff',input);await f.run('cashHandoff',input);
  assert.equal((await f.c.query('SELECT id FROM cash_handoffs')).rows.length,1);
  assert.equal((await f.c.query("SELECT id FROM audit_log WHERE action='cashHandoff'")).rows.length,1);
  await assert.rejects(f.run('cashHandoff',{...input,yapeAmount:16}),/otro registro/);
  const treasury=(await f.c.query('SELECT treasury_id FROM cash_handoffs')).rows[0].treasury_id;
  await assert.rejects(f.run('treasuryDelete',{id:treasury},{...f.user,role:'ADMIN'}),/historial/);
 }finally{await f.pg.close();}
});

test("Dos entregas simultáneas no pueden exceder los saldos y una entrega de Yape no reduce el efectivo",async()=>{
 const f=await fixture();try{
  const results=await Promise.allSettled([f.run('cashHandoff',f.input(80,40)),f.run('cashHandoff',f.input(80,40))]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  let b=await cashHandoffBalances(f.c);assert.equal(b.cashAvailable,3000);assert.equal(b.yapeAvailable,2000);
  await f.run('cashHandoff',f.input(0,20,30,20));
  b=await cashHandoffBalances(f.c);assert.equal(b.cashAvailable,3000);assert.equal(b.yapeAvailable,0);
  assert.equal((await f.c.query("SELECT id FROM treasury WHERE kind='DELIVERY'")).rows.length,2);
 }finally{await f.pg.close();}
});

test("El historial se pagina sin perder registros antiguos",async()=>{
 const f=await fixture();try{
  for(let i=0;i<51;i++)await f.c.query("INSERT INTO cash_handoffs(id,date,cash_amount,yape_amount,cash_available_before,yape_available_before,user_id) VALUES($1,$2,0,1,11000,6000,$3)",[randomUUID(),today(),f.user.id]);
  const first=await cashHandoffReport(f.c,1),second=await cashHandoffReport(f.c,2);
  assert.equal(first.total,52);assert.equal(first.history.length,50);assert.equal(second.history.length,2);assert.equal(first.pages,2);
  assert.equal(new Set([...first.history,...second.history].map(h=>h.id)).size,52);
 }finally{await f.pg.close();}
});
