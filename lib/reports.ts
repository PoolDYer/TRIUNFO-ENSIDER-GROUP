import { DB } from "./db";
export function calculateTotals(
  input: {
    billing: number;
    digital: number;
    operating: number;
    fixed: number;
    debt: number;
    opening: number;
    deposits: number;
    deliveries: number;
  },
  period: string,
) {
  const excelCash =
    input.billing -
    input.digital -
    input.operating -
    (period === "day" ? input.debt : 0);
  const netCash =
    input.billing - input.digital - input.operating - input.debt - input.fixed;
  return {
    ...input,
    excelCash,
    netCash,
    available: input.opening + netCash - input.deposits - input.deliveries,
  };
}
export async function report(
  c: DB,
  start: string,
  end: string,
  period: string,
) {
  const p = [start, end];
  // Aggregate each ledger independently to avoid multiplying sales by expense rows.
  const sales = await c.query(
    "SELECT COALESCE(sum(total),0) AS billing,COALESCE(sum(digital),0) AS digital,COALESCE(sum(debt),0) AS debt,count(*)::int AS count FROM sales WHERE date BETWEEN $1 AND $2",
    p,
  );
  const exp = await c.query(
    "SELECT COALESCE(sum(amount) FILTER(WHERE kind='OPERATING'),0) AS operating,COALESCE(sum(amount) FILTER(WHERE kind='FIXED'),0) AS fixed FROM expenses WHERE date BETWEEN $1 AND $2",
    p,
  );
  const tre = await c.query(
    "SELECT COALESCE(sum(amount) FILTER(WHERE kind='DEBT'),0) AS debt,COALESCE(sum(amount) FILTER(WHERE kind='DEPOSIT'),0) AS deposits,COALESCE(sum(amount) FILTER(WHERE kind='DELIVERY'),0) AS deliveries FROM treasury WHERE date BETWEEN $1 AND $2",
    p,
  );
  const opening = await c.query(
    "SELECT COALESCE(sum(amount),0) AS opening FROM cash_openings WHERE date BETWEEN $1 AND $2",
    p,
  );
  const bank = await c.query(
    "SELECT COALESCE(sum(amount) FILTER(WHERE kind='INCOME'),0) AS income,COALESCE(sum(amount) FILTER(WHERE kind='WITHDRAWAL'),0) AS withdrawals FROM bank_movements WHERE date BETWEEN $1 AND $2",
    p,
  );
  const accumulated = await c.query(
    "SELECT COALESCE(sum(CASE WHEN kind='INCOME' THEN amount ELSE -amount END),0) AS balance FROM bank_movements WHERE date <= $1",
    [end],
  );
  const items = await c.query(
    "SELECT i.code,i.name,p.stock AS stock,sum(i.quantity)::int AS quantity, i.unit_price, sum(i.quantity*i.unit_price) AS total FROM sale_items i JOIN sales s ON s.id=i.sale_id JOIN products p ON p.id=i.product_id WHERE s.date BETWEEN $1 AND $2 GROUP BY i.code,i.name,i.unit_price,p.stock ORDER BY total DESC",
    p,
  );
  const daily = await c.query(
    "SELECT date::text, sum(total) AS total,sum(digital) AS digital FROM sales WHERE date BETWEEN $1 AND $2 GROUP BY date ORDER BY date",
    p,
  );
  const toNum = (o: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Number(v)]));
  const s = toNum(sales.rows[0]),
    e = toNum(exp.rows[0]),
    t = toNum(tre.rows[0]);
  const totals = calculateTotals(
    {
      billing: s.billing,
      digital: s.digital,
      debt: s.debt + t.debt,
      operating: e.operating,
      fixed: e.fixed,
      opening: Number(opening.rows[0].opening),
      deposits: t.deposits,
      deliveries: t.deliveries,
    },
    period,
  );
  return {
    start,
    end,
    period,
    totals: {
      ...totals,
      cashReceipts: s.billing - s.digital - s.debt,
      salesCount: s.count,
      bankIncome: Number(bank.rows[0].income),
      bankWithdrawals: Number(bank.rows[0].withdrawals),
      bankNet: Number(bank.rows[0].income) - Number(bank.rows[0].withdrawals),
      bankAccumulated: Number(accumulated.rows[0].balance),
    },
    items: items.rows,
    daily: daily.rows,
  };
}
