import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { schema } from "../lib/schema";
import { expenseDashboard } from "../lib/expense-dashboard";
import { periodRange } from "../lib/validation";
import type { DB } from "../lib/db";

test("El dashboard de gastos separa día, semana y mes e incluye más de 200 registros", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(schema);
    const userId = randomUUID();
    await pg.query("INSERT INTO users(id,name,email,password_hash,role) VALUES($1,'Admin','admin@triunfoensidergroup','test','ADMIN')",[userId]);
    for (const [date, kind, amount] of [
      ["2026-10-31","FIXED",9900],
      ["2026-11-02","OPERATING",1000],
      ["2026-11-05","FIXED",2000],
      ["2026-11-09","OPERATING",3000],
      ["2026-12-01","FIXED",9999],
    ]) await pg.query("INSERT INTO expenses(id,date,kind,detail,amount,user_id) VALUES($1,$2,$3,'Prueba',$4,$5)",[randomUUID(),date,kind,amount,userId]);
    await pg.query("INSERT INTO expenses(id,date,kind,detail,amount,user_id) SELECT md5('expense-test-'||g)::uuid,'2026-11-05','OPERATING','Prueba',100,$1 FROM generate_series(1,201) g",[userId]);
    const read = async (period: string) => {
      const {start,end} = periodRange("2026-11-05",period);
      return expenseDashboard(pg as DB,start,end);
    };
    const day = await read("day");
    assert.equal(day.total,22100);
    assert.equal(day.count,202);
    assert.equal(day.daily.length,1);
    const week = await read("week");
    assert.equal(week.total,23100);
    assert.equal(week.operating,21100);
    assert.equal(week.fixed,2000);
    assert.equal(week.daily.length,7);
    assert.equal(week.daily.find(d=>d.date==="2026-11-03")?.count,0);
    const month = await read("month");
    assert.equal(month.total,26100);
    assert.equal(month.daily.length,30);
    assert.equal(month.total,month.daily.reduce((s,d)=>s+d.operating+d.fixed,0));
    const empty = await expenseDashboard(pg as DB,"2026-09-01","2026-09-01");
    assert.equal(empty.total,0);
    assert.equal(empty.count,0);
    assert.equal(empty.daily.length,1);
  } finally { await pg.close(); }
});
