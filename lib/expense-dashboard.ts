import type { DB } from "./db";

export async function expenseDashboard(c: DB, start: string, end: string) {
  const { rows } = await c.query(`SELECT date::text,
    COALESCE(sum(amount) FILTER (WHERE kind='OPERATING'),0) AS operating,
    COALESCE(sum(amount) FILTER (WHERE kind='FIXED'),0) AS fixed,
    count(*)::int AS count FROM expenses WHERE date BETWEEN $1 AND $2
    GROUP BY date ORDER BY date`, [start, end]);
  const byDate = new Map(rows.map(row => [row.date, row]));
  const daily = [];
  const cursor = new Date(start + "T12:00:00Z");
  while (cursor.toISOString().slice(0,10) <= end) {
    const date = cursor.toISOString().slice(0,10);
    const row = byDate.get(date);
    daily.push({ date, operating: Number(row?.operating ?? 0), fixed: Number(row?.fixed ?? 0), count: Number(row?.count ?? 0) });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  const totals = daily.reduce((sum, row) => ({ operating: sum.operating + row.operating, fixed: sum.fixed + row.fixed, count: sum.count + row.count }), { operating: 0, fixed: 0, count: 0 });
  return { start, end, daily, ...totals, total: totals.operating + totals.fixed };
}
