import {test} from "node:test";
import assert from "node:assert/strict";
import {PGlite} from "@electric-sql/pglite";
import {schema} from "../lib/schema";
import {snapshotDatabase,restoreDatabase} from "../lib/database-transfer";
import type {DB} from "../lib/db";

test("La transferencia conserva identificadores, bigint, contraseñas y referencias; rechaza destinos ocupados",async()=>{
 const source=new PGlite(),target=new PGlite();
 try{
  await source.exec(schema);await target.exec(schema);
  await source.query("INSERT INTO users(id,name,email,password_hash,role) VALUES('00000000-0000-0000-0000-000000000001','Dueño','test@triunfoensidergroup','hash-existente','ADMIN')");
  await source.query("INSERT INTO products(id,code,name,stock,sale_price,purchase_price) VALUES('00000000-0000-0000-0000-000000000002','P1','Producto',4,9007199254740993,250)");
  await source.query("INSERT INTO sales(id,date,cash,digital,debt,method,total,user_id) VALUES('00000000-0000-0000-0000-000000000003','2026-11-05',100,0,0,'NONE',100,'00000000-0000-0000-0000-000000000001')");
  const data=await source.transaction(async tx=>{await tx.query("SET LOCAL TIME ZONE 'UTC'");return snapshotDatabase(tx as DB);});
  assert.ok(data.find(t=>t.table==='products')!.rows[0].includes('9007199254740993'));
  const copied=await target.transaction(async tx=>{await tx.query("SET LOCAL TIME ZONE 'UTC'");return restoreDatabase(tx as DB,data);});
  assert.equal(copied.find(t=>t.table==='sales')!.count,1);
  assert.equal((await target.query<{password_hash:string}>('SELECT password_hash FROM users')).rows[0].password_hash,'hash-existente');
  await assert.rejects(target.transaction(tx=>restoreDatabase(tx as DB,data)),/ya contiene datos/);
  assert.equal((await target.query('SELECT * FROM sales')).rows.length,1);
 }finally{await source.close();await target.close();}
});

test("Una verificación fallida revierte toda la transferencia",async()=>{
 const source=new PGlite(),target=new PGlite();
 try{
  await source.exec(schema);await target.exec(schema);
  await source.query("INSERT INTO initial_reference VALUES('test','origen','{}')");
  const data=await snapshotDatabase(source as DB);
  data.find(t=>t.table==='initial_reference')!.fingerprint='incorrecto';
  await assert.rejects(target.transaction(tx=>restoreDatabase(tx as DB,data)),/no coincide/);
  assert.equal((await target.query('SELECT * FROM initial_reference')).rows.length,0);
 }finally{await source.close();await target.close();}
});
