const money = (value: number) => new Intl.NumberFormat("es-PE", {
  style: "currency", currency: "PEN",
}).format(value / 100);

export default function FinancialGroups({ totals: t, period }: {
  totals: Record<string, number>;
  period: string;
}) {
  const periodLabel = period === "week" ? "semanal" : period === "month" ? "mensual" : "diario";
  const groups: { title: string; rows: [string, number][] }[] = [
    { title: "Ventas y cobros", rows: [
      [period === "week" ? "Facturación semanal" : "Subtotal facturación", t.billing],
      ["Ingresos en efectivo", t.cashReceipts],
      ["Yape / transferencias", t.digital],
    ] },
    { title: "Gastos y deudas", rows: [
      ["Gastos operativos", t.operating],
      ["Gastos fijos", t.fixed],
      ["Deudas de ventas y descuentos de caja", t.debt],
      ["Pérdida de productos (valor de venta)", t.productLossAmount],
    ] },
    { title: "Saldos de caja", rows: [
      ["Total de caja según ejemplo", t.excelCash],
      ["Caja neta (después de gastos fijos y deudas)", t.netCash],
    ] },
    { title: "Movimientos de efectivo", rows: [
      ["Aperturas de caja registradas", t.opening],
      ["Depositado", t.deposits],
      ["Entregado", t.deliveries],
      ["Disponible en caja (físico calculado)", t.available],
    ] },
    { title: "Cuenta corriente", rows: [
      ["Ingresos del período", t.bankIncome],
      ["Retiros / disposiciones", t.bankWithdrawals],
      [`Saldo neto ${periodLabel}`, t.bankNet],
      ["Saldo acumulado", t.bankAccumulated],
    ] },
  ];
  return <div className="report-ledger financial-groups">
    {groups.map((group, index) => <section className="financial-group" key={group.title} aria-label={group.title}>
      <h3><span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>{group.title}</h3>
      <dl>{group.rows.map(([label, value]) => <div className="financial-row" key={label}>
        <dt>{label}</dt><dd>{money(value)}</dd>
      </div>)}</dl>
    </section>)}
  </div>;
}
