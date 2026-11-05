import type { report } from "./reports";
import type { roleLabels } from "./roles";

type Summary = Awaited<ReturnType<typeof report>>;

// Los administradores reciben únicamente datos operativos. Cualquier campo nuevo
// de costos, inversión, margen o ganancias queda privado hasta autorizarlo aquí.
export function reportForRole(summary: Summary, role: keyof typeof roleLabels): Summary {
  if (role === "ADMIN") return summary;
  const t = summary.totals;
  return {
    start: summary.start,
    end: summary.end,
    period: summary.period,
    totals: {
      billing: t.billing, digital: t.digital, operating: t.operating, fixed: t.fixed,
      debt: t.debt, opening: t.opening, deposits: t.deposits, deliveries: t.deliveries,
      excelCash: t.excelCash, netCash: t.netCash, available: t.available,
      productLossAmount: t.productLossAmount, cashReceipts: t.cashReceipts,
      salesCount: t.salesCount, bankIncome: t.bankIncome,
      bankWithdrawals: t.bankWithdrawals, bankNet: t.bankNet, bankAccumulated: t.bankAccumulated,
    },
    items: summary.items.map(i => ({ code:i.code, name:i.name, stock:i.stock,
      quantity:i.quantity, unit_price:i.unit_price, total:i.total })),
    daily: summary.daily.map(d => ({ date:d.date, total:d.total, digital:d.digital })),
  };
}
