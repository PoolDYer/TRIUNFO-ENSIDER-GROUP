import type { DB } from "./db";

export async function profitDashboard(c: DB, start: string, end: string) {
  const { rows } = await c.query(`WITH sold AS (
    SELECT date,sum(total) AS sold,count(*) AS sales_count FROM sales
    WHERE date BETWEEN $1 AND $2 GROUP BY date
  ), costs AS (
    SELECT s.date,sum(i.quantity*i.purchase_price) AS investment,
      count(*) FILTER (WHERE i.purchase_price IS NULL) AS missing_costs
    FROM sales s JOIN sale_items i ON i.sale_id=s.id
    WHERE s.date BETWEEN $1 AND $2 GROUP BY s.date
  ), lost AS (
    SELECT s.date,sum(l.quantity*l.purchase_price) AS loss_cost,
      sum(l.quantity*l.unit_price) AS loss_amount,
      count(*) FILTER (WHERE l.purchase_price IS NULL) AS missing_costs
    FROM sales s JOIN sale_losses l ON l.sale_id=s.id
    WHERE s.date BETWEEN $1 AND $2 GROUP BY s.date
  ), checks AS (
    SELECT s.date,count(*) FILTER (WHERE s.total <> (SELECT COALESCE(sum(i.quantity*i.unit_price),0) FROM sale_items i WHERE i.sale_id=s.id)) AS inconsistent_sales
    FROM sales s WHERE s.date BETWEEN $1 AND $2 GROUP BY s.date
  ), spent AS (
    SELECT date,sum(amount) FILTER (WHERE kind='OPERATING') AS operating,
      sum(amount) FILTER (WHERE kind='FIXED') AS fixed FROM expenses
    WHERE date BETWEEN $1 AND $2 GROUP BY date
  ) SELECT d.date::date::text AS date,COALESCE(s.sold,0) AS sold,
    COALESCE(s.sales_count,0) AS sales_count,COALESCE(c.investment,0) AS investment,
    COALESCE(c.missing_costs,0)+COALESCE(l.missing_costs,0) AS missing_costs,COALESCE(e.operating,0) AS operating,
    COALESCE(c.missing_costs,0) AS missing_sale_costs,COALESCE(l.missing_costs,0) AS missing_loss_costs,
    COALESCE(a.inconsistent_sales,0) AS inconsistent_sales,
    COALESCE(l.loss_cost,0) AS loss_cost,COALESCE(l.loss_amount,0) AS loss_amount,
    COALESCE(e.fixed,0) AS fixed
    FROM generate_series($1::date,$2::date,interval '1 day') d(date)
    LEFT JOIN sold s ON s.date=d.date LEFT JOIN costs c ON c.date=d.date
    LEFT JOIN spent e ON e.date=d.date LEFT JOIN lost l ON l.date=d.date
    LEFT JOIN checks a ON a.date=d.date ORDER BY d.date`, [start,end]);
  const daily = rows.map(row => {
    const sold = Number(row.sold), investment = Number(row.investment);
    const operating = Number(row.operating), fixed = Number(row.fixed);
    const missingCosts = Number(row.missing_costs);
    const productLossCost = Number(row.loss_cost), productLossAmount = Number(row.loss_amount);
    const missingSaleCosts=Number(row.missing_sale_costs),missingLossCosts=Number(row.missing_loss_costs),inconsistentSales=Number(row.inconsistent_sales);
    return { date: String(row.date), sold, investment, operating, fixed,
      salesCount: Number(row.sales_count), missingCosts,
      productLossCost,productLossAmount,missingSaleCosts,missingLossCosts,inconsistentSales,
      result: missingCosts || inconsistentSales ? null : sold-investment-operating-fixed-productLossCost };
  });
  const totals = daily.reduce((s,d) => ({ sold: s.sold+d.sold,
    investment: s.investment+d.investment,operating:s.operating+d.operating,
    fixed:s.fixed+d.fixed,missingCosts:s.missingCosts+d.missingCosts,
    salesCount:s.salesCount+d.salesCount,productLossCost:s.productLossCost+d.productLossCost,productLossAmount:s.productLossAmount+d.productLossAmount,
    missingSaleCosts:s.missingSaleCosts+d.missingSaleCosts,missingLossCosts:s.missingLossCosts+d.missingLossCosts,inconsistentSales:s.inconsistentSales+d.inconsistentSales }),
    {sold:0,investment:0,operating:0,fixed:0,missingCosts:0,salesCount:0,productLossCost:0,productLossAmount:0,missingSaleCosts:0,missingLossCosts:0,inconsistentSales:0});
  const complete = totals.missingCosts===0 && totals.inconsistentSales===0;
  const grossProfit = totals.missingSaleCosts || totals.inconsistentSales ? null : totals.sold-totals.investment;
  const result = complete ? totals.sold-totals.investment-totals.operating-totals.fixed-totals.productLossCost : null;
  const soldItems=(await c.query(`SELECT i.code,i.name,i.unit_price,i.purchase_price,sum(i.quantity) AS quantity
    FROM sale_items i JOIN sales s ON s.id=i.sale_id WHERE s.date BETWEEN $1 AND $2
    GROUP BY i.product_id,i.code,i.name,i.unit_price,i.purchase_price ORDER BY i.code,i.name,i.unit_price`,[start,end])).rows.map(row=>({
      code:String(row.code),name:String(row.name),quantity:Number(row.quantity),unitPrice:Number(row.unit_price),
      purchasePrice:row.purchase_price===null?null:Number(row.purchase_price),
      revenue:Number(row.quantity)*Number(row.unit_price),
      cost:row.purchase_price===null?null:Number(row.quantity)*Number(row.purchase_price)
    }));
  const lostItems=(await c.query(`SELECT l.code,l.name,l.unit_price,l.purchase_price,sum(l.quantity) AS quantity
    FROM sale_losses l JOIN sales s ON s.id=l.sale_id WHERE s.date BETWEEN $1 AND $2
    GROUP BY l.product_id,l.code,l.name,l.unit_price,l.purchase_price ORDER BY l.code,l.name,l.unit_price`,[start,end])).rows.map(row=>({
      code:String(row.code),name:String(row.name),quantity:Number(row.quantity),unitPrice:Number(row.unit_price),
      purchasePrice:row.purchase_price===null?null:Number(row.purchase_price),
      value:Number(row.quantity)*Number(row.unit_price),
      cost:row.purchase_price===null?null:Number(row.quantity)*Number(row.purchase_price)
    }));
  const expenseItems=(await c.query("SELECT id,date::text,kind,detail,amount FROM expenses WHERE date BETWEEN $1 AND $2 ORDER BY date,created_at,id",[start,end])).rows.map(row=>({id:String(row.id),date:String(row.date),kind:String(row.kind),detail:String(row.detail),amount:Number(row.amount)}));
  return {start,end,daily,...totals,result,grossProfit,complete,soldItems,lostItems,expenseItems,
    totalDeductions:complete?totals.investment+totals.operating+totals.fixed+totals.productLossCost:null,
    marginPercent:result!==null && totals.sold>0 ? result/totals.sold*100 : null,
    gain:result === null ? null : Math.max(result,0),
    loss:result === null ? null : Math.max(-result,0)};
}
