import {test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {PGlite} from "@electric-sql/pglite";
import {schema} from "../lib/schema";
import {operate} from "../lib/operations";
import {previewUserRecords} from "../lib/user-records";
import {financingReport} from "../lib/financing";
import type {DB} from "../lib/db";
import type {User} from "../lib/auth";

async function fixture(){
 const pg=new PGlite();await pg.exec(schema);
 const owner:User={id:randomUUID(),name:'Dueño',email:'dueno@triunfoensidergroup',role:'ADMIN',must_change_password:false};
 const admin:User={id:randomUUID(),name:'Administrador',email:'admin1@triunfoensidergroup',role:'SELLER',must_change_password:false};
 const other:User={id:randomUUID(),name:'Otro administrador',email:'otro@triunfoensidergroup',role:'SELLER',must_change_password:false};
 for(const u of [owner,admin,other])await pg.query("INSERT INTO users(id,name,email,password_hash,role,must_change_password) VALUES($1,$2,$3,'clave-original',$4,false)",[u.id,u.name,u.email,u.role]);
 const products=[randomUUID(),randomUUID()];
 for(const [i,id] of products.entries())await pg.query("INSERT INTO products(id,code,name,stock,sale_price,purchase_price) VALUES($1,$2,$3,$4,1000,500)",[id,'P'+i,'Producto '+i,i===0?20:10]);
 const sale=randomUUID(),otherSale=randomUUID(),receipt=randomUUID(),ownerReceipt=randomUUID();
 for(const [id,user] of [[sale,admin.id],[otherSale,other.id]])await pg.query("INSERT INTO sales(id,date,cash,digital,debt,method,total,user_id) VALUES($1,'2020-01-01',1000,1000,0,'YAPE',2000,$2)",[id,user]);
 await pg.query("INSERT INTO sale_items(id,sale_id,product_id,code,name,quantity,unit_price,purchase_price) VALUES($1,$2,$3,'P0','Producto 0',2,1000,500)",[randomUUID(),sale,products[0]]);
 await pg.query("INSERT INTO sale_losses(sale_id,product_id,code,name,quantity,unit_price,purchase_price) VALUES($1,$2,'P0','Producto 0',1,1000,500)",[sale,products[0]]);
 await pg.query("INSERT INTO sale_items(id,sale_id,product_id,code,name,quantity,unit_price,purchase_price) VALUES($1,$2,$3,'P1','Producto 1',2,1000,500)",[randomUUID(),otherSale,products[1]]);
 for(const [id,user,quantity] of [[receipt,admin.id,4],[ownerReceipt,owner.id,1]])await pg.query("INSERT INTO receipts(id,date,product_id,quantity,supplier,order_cost,modality,paid,user_id,credit_principal) VALUES($1,'2020-01-01',$2,$3,'Proveedor',2000,'CREDIT',0,$4,2000)",[id,products[0],quantity,user]);
 for(const [id,quantity] of [[products[0],3],[products[1],1]])await pg.query("INSERT INTO receipt_items(receipt_id,product_id,code,name,quantity,unit_purchase_price) VALUES($1,$2,'P','Producto',$3,500)",[receipt,id,quantity]);
 await pg.query("INSERT INTO financing_payments(id,receipt_id,date,amount,user_id) VALUES($1,$2,'2020-01-02',200,$3)",[randomUUID(),ownerReceipt,admin.id]);
 for(const u of [owner,admin]){
  await pg.query("INSERT INTO expenses(id,date,kind,detail,amount,user_id) VALUES($1,'2020-01-01','FIXED','Gasto',100,$2)",[randomUUID(),u.id]);
  await pg.query("INSERT INTO bank_movements(id,date,kind,detail,amount,user_id) VALUES($1,'2020-01-01','WITHDRAWAL','Retiro',100,$2)",[randomUUID(),u.id]);
  await pg.query("INSERT INTO audit_log(id,user_id,action,entity_id) VALUES($1,$2,'sale','prueba')",[randomUUID(),u.id]);
 }
 await pg.query("INSERT INTO cash_openings VALUES('2020-01-01',100,$1),('2020-01-02',200,$2)",[admin.id,owner.id]);
 const treasury=randomUUID();
 await pg.query("INSERT INTO treasury(id,date,kind,detail,amount,user_id) VALUES($1,'2020-01-02','DELIVERY','Entrega',50,$2)",[treasury,admin.id]);
 await pg.query("INSERT INTO cash_handoffs(id,date,cash_amount,yape_amount,cash_available_before,yape_available_before,treasury_id,user_id) VALUES($1,'2020-01-02',50,20,100,100,$2,$3)",[randomUUID(),treasury,admin.id]);
 await pg.query("INSERT INTO google_exports(id,user_id,date,period,status) VALUES($1,$2,'2020-01-01','day','READY')",[randomUUID(),admin.id]);
 const c=pg as DB;
 const preview=(id=admin.id)=>pg.transaction(tx=>previewUserRecords(tx as DB,id));
 const run=(action:string,input:unknown,u=owner)=>pg.transaction(tx=>operate(tx as DB,u,action,input));
 const payload=async()=>({id:admin.id,confirmation:admin.email,version:(await preview()).version});
 return {pg,c,owner,admin,other,products,sale,otherSale,receipt,ownerReceipt,treasury,preview,run,payload};
}

test("El Dueño elimina todos los registros del administrador y revierte ventas, pérdidas y entradas sin tocar otras cuentas",async()=>{
 const f=await fixture();try{
  const preview=await f.preview();assert.deepEqual(preview.blockers,[]);assert.equal(preview.counts.cashHandoffs,1);
  assert.equal(preview.stock.find(p=>p.id===f.products[0])!.afterStock,20);assert.equal(preview.stock.find(p=>p.id===f.products[1])!.afterStock,9);
  await f.run('userRecordsDelete',await f.payload());
  const empty=await f.preview();assert.equal(empty.totalRecords,0);
  const account=(await f.c.query('SELECT * FROM users WHERE id=$1',[f.admin.id])).rows[0];
  assert.equal(account.password_hash,'clave-original');assert.equal(account.active,true);assert.equal(account.deleted_at,null);
  assert.equal((await f.c.query('SELECT stock FROM products WHERE id=$1',[f.products[1]])).rows[0].stock,9);
  assert.equal((await f.c.query('SELECT id FROM sales WHERE id=$1',[f.otherSale])).rows.length,1);
  assert.equal((await f.c.query('SELECT id FROM receipts WHERE id=$1',[f.ownerReceipt])).rows.length,1);
  assert.equal((await f.c.query('SELECT id FROM expenses WHERE user_id=$1',[f.owner.id])).rows.length,1);
  assert.equal((await f.c.query('SELECT id FROM audit_log WHERE user_id=$1',[f.owner.id])).rows.length,2);
  assert.equal((await f.c.query("SELECT id FROM audit_log WHERE action='userRecordsDelete' AND entity_id=$1",[f.admin.id])).rows.length,1);
  const credit=(await financingReport(f.c)).credits.find(r=>r.id===f.ownerReceipt)!;assert.equal(Number(credit.paid),0);
 }finally{await f.pg.close();}
});

test("Bloquea a administradores, cuentas de Dueño, confirmación incorrecta y revisiones desactualizadas",async()=>{
 const f=await fixture();try{
  await assert.rejects(f.run('userRecordsDelete',{},f.admin),/Solo el dueño/);
  await assert.rejects(f.preview(f.owner.id),/cuenta de Administrador/);
  const input=await f.payload();
  await assert.rejects(f.run('userRecordsDelete',{...input,confirmation:'otro@triunfoensidergroup'}),/correo/);
  await f.c.query('UPDATE products SET stock=stock+1 WHERE id=$1',[f.products[1]]);
  await assert.rejects(f.run('userRecordsDelete',input),/registros cambiaron/);
  assert.equal((await f.c.query('SELECT id FROM sales WHERE id=$1',[f.sale])).rows.length,1);
 }finally{await f.pg.close();}
});

test("No borra datos de otros usuarios ni permite retirar entradas que dejarían stock negativo",async()=>{
 const f=await fixture();try{
  await f.c.query('UPDATE products SET stock=0 WHERE id=$1',[f.products[1]]);
  assert.ok((await f.preview()).blockers.some(b=>b.includes('stock')));
  await assert.rejects(f.run('userRecordsDelete',await f.payload()),/stock/);
  await f.c.query('UPDATE products SET stock=10 WHERE id=$1',[f.products[1]]);
  await f.c.query("INSERT INTO financing_payments(id,receipt_id,date,amount,user_id) VALUES($1,$2,'2020-01-02',100,$3)",[randomUUID(),f.receipt,f.owner.id]);
  assert.ok((await f.preview()).blockers.some(b=>b.includes('otros usuarios')));
  await assert.rejects(f.run('userRecordsDelete',await f.payload()),/otros usuarios/);
  assert.equal((await f.c.query('SELECT id FROM receipts WHERE id=$1',[f.receipt])).rows.length,1);
 }finally{await f.pg.close();}
});

test("Un fallo durante el borrado revierte datos y stock; dos solicitudes no aplican el ajuste dos veces",async()=>{
 const f=await fixture();try{
  const input=await f.payload();
  await assert.rejects(f.pg.transaction(tx=>operate({query:async(sql,params)=>{
    if(sql.includes('INSERT INTO audit_log'))throw new Error('Fallo simulado de auditoría');return (tx as DB).query(sql,params);
  }},f.owner,'userRecordsDelete',input)),/Fallo simulado/);
  assert.equal((await f.c.query('SELECT stock FROM products WHERE id=$1',[f.products[1]])).rows[0].stock,10);
  assert.equal((await f.c.query('SELECT id FROM sales WHERE id=$1',[f.sale])).rows.length,1);
  const results=await Promise.allSettled([f.run('userRecordsDelete',input),f.run('userRecordsDelete',input)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal((await f.c.query('SELECT stock FROM products WHERE id=$1',[f.products[1]])).rows[0].stock,9);
 }finally{await f.pg.close();}
});

test("Se conserva la entrega y se bloquea el borrado si está vinculada a otro usuario o hay una exportación pendiente",async()=>{
 const f=await fixture();try{
  await f.c.query('UPDATE cash_handoffs SET user_id=$1 WHERE treasury_id=$2',[f.other.id,f.treasury]);
  await assert.rejects(f.run('userRecordsDelete',await f.payload()),/otro usuario/);
  await f.c.query('UPDATE cash_handoffs SET user_id=$1 WHERE treasury_id=$2',[f.admin.id,f.treasury]);
  await f.c.query("UPDATE google_exports SET status='PENDING' WHERE user_id=$1",[f.admin.id]);
  await assert.rejects(f.run('userRecordsDelete',await f.payload()),/en proceso/);
  assert.equal((await f.c.query('SELECT id FROM cash_handoffs')).rows.length,1);
 }finally{await f.pg.close();}
});
