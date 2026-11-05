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
  ), spent AS (
    SELECT date,sum(amount) FILTER (WHERE kind='OPERATING') AS operating,
      sum(amount) FILTER (WHERE kind='FIXED') AS fixed FROM expenses
    WHERE date BETWEEN $1 AND $2 GROUP BY date
  ) SELECT d.date::date::text AS date,COALESCE(s.sold,0) AS sold,
    COALESCE(s.sales_count,0) AS sales_count,COALESCE(c.investment,0) AS investment,
    COALESCE(c.missing_costs,0) AS missing_costs,COALESCE(e.operating,0) AS operating,
    COALESCE(e.fixed,0) AS fixed
    FROM generate_series($1::date,$2::date,interval '1 day') d(date)
    LEFT JOIN sold s ON s.date=d.date LEFT JOIN costs c ON c.date=d.date
    LEFT JOIN spent e ON e.date=d.date ORDER BY d.date`, [start,end]);
  const daily = rows.map(row => {
    const sold = Number(row.sold), investment = Number(row.investment);
    const operating = Number(row.operating), fixed = Number(row.fixed);
    const missingCosts = Number(row.missing_costs);
    return { date: String(row.date), sold, investment, operating, fixed,
      salesCount: Number(row.sales_count), missingCosts,
      result: missingCosts ? null : sold-investment-operating-fixed };
  });
  const totals = daily.reduce((s,d) => ({ sold: s.sold+d.sold,
    investment: s.investment+d.investment,operating:s.operating+d.operating,
    fixed:s.fixed+d.fixed,missingCosts:s.missingCosts+d.missingCosts,
    salesCount:s.salesCount+d.salesCount }),
    {sold:0,investment:0,operating:0,fixed:0,missingCosts:0,salesCount:0});
  const result = totals.missingCosts ? null : totals.sold-totals.investment-totals.operating-totals.fixed;
  return {start,end,daily,...totals,result,
    gain:result === null ? null : Math.max(result,0),
    loss:result === null ? null : Math.max(-result,0)};
}
