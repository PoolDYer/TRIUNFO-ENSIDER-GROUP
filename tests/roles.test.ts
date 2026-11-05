import {test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {PGlite} from "@electric-sql/pglite";
import {schema} from "../lib/schema";
import {operate} from "../lib/operations";
import {roleLabels,canAccessSection,ownerOnlySections} from "../lib/roles";
import type {DB} from "../lib/db";
import type {User} from "../lib/auth";

test("Dueño conserva los privilegios exclusivos y las nuevas cuentas son Administradores",async()=>{
  assert.equal(roleLabels.ADMIN,"Dueño");
  assert.equal(roleLabels.SELLER,"Administrador");
  const pg=new PGlite();try {
    await pg.exec(schema);
    const owner:User={id:randomUUID(),name:"Dueño",email:"admin@triunfoensidergroup",role:"ADMIN",must_change_password:false};
    await pg.query("INSERT INTO users(id,name,email,password_hash,role) VALUES($1,$2,$3,'test','ADMIN')",[owner.id,owner.name,owner.email]);
    const run=(u:User,action:string,data:unknown)=>pg.transaction(tx=>operate(tx as DB,u,action,data));
    const created=await run(owner,"user",{name:"Administrador 1",email:"administrador1@triunfoensidergroup",password:"Temporal-Prueba-2026",role:"ADMIN"});
    const row=(await pg.query<{role:"ADMIN"|"SELLER"}>("SELECT role FROM users WHERE id=$1",[created.id])).rows[0];
    assert.equal(roleLabels[row.role],"Administrador");
    const administrator:User={...owner,id:created.id,role:row.role};
    await assert.rejects(run(administrator,"user",{}),/Solo el dueño/);
    await assert.rejects(run(administrator,"product",{}),/Solo el dueño/);
    for (const action of ["receiptOrder","receipt","financingPayment"])
      await assert.rejects(run(administrator,action,{}),error=>error instanceof Error && /Solo el dueño/.test(error.message) && (error as {status?:number}).status===403);
    await assert.rejects(run(owner,"userDelete",{id:owner.id}),/propia cuenta/);
    await run(owner,"userStatus",{id:created.id,active:false});
    assert.equal((await pg.query<{active:boolean}>("SELECT active FROM users WHERE id=$1",[created.id])).rows[0].active,false);
  } finally {await pg.close();}
});

test("Los cinco apartados indicados son exclusivos del Dueño y el resto operativo sigue accesible",()=>{
 for(const section of ownerOnlySections){
  assert.equal(canAccessSection("ADMIN",section),true);
  assert.equal(canAccessSection("SELLER",section),false);
 }
 for(const section of ["overview","sales","expenses","bank","reports"]){
  assert.equal(canAccessSection("ADMIN",section),true);
  assert.equal(canAccessSection("SELLER",section),true);
 }
});
