import {test} from "node:test";
import assert from "node:assert/strict";
import {reportForRole} from "../lib/report-access";
import type {report} from "../lib/reports";

test("Los administradores no reciben ganancias, costos ni márgenes aunque se incorporen a los reportes",()=>{
 const summary={start:'2026-11-05',end:'2026-11-05',period:'day',
  profits:{result:950},
  totals:{billing:1000,digital:0,operating:50,fixed:20,debt:0,opening:0,deposits:0,deliveries:0,
   excelCash:950,netCash:930,available:930,productLossAmount:0,cashReceipts:1000,salesCount:1,
   bankIncome:0,bankWithdrawals:0,bankNet:0,bankAccumulated:0,
   profit:600,grossProfit:650,marginPercent:60,investment:350,productLossCost:100},
  items:[{code:'P1',name:'Producto',stock:3,quantity:1,unit_price:1000,total:1000,purchase_price:350,profit:650}],
  daily:[{date:'2026-11-05',total:1000,digital:0,investment:350,result:600}],
 } as unknown as Awaited<ReturnType<typeof report>>;
 const original=JSON.stringify(summary);
 const administrator=reportForRole(summary,'SELLER');
 const json=JSON.stringify(administrator);
 for(const key of ['profits','profit','grossProfit','marginPercent','investment','productLossCost','purchase_price','result'])
  assert.equal(new RegExp('"'+key+'":').test(json),false,key);
 assert.equal(administrator.totals.billing,1000);
 assert.equal(administrator.totals.netCash,930);
 assert.equal(administrator.items[0].unit_price,1000);
 assert.equal(JSON.stringify(summary),original);
 assert.equal(reportForRole(summary,'ADMIN'),summary);
});
