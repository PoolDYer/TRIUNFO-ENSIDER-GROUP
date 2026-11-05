import type { expenseDashboard } from "@/lib/expense-dashboard";

type Data = Awaited<ReturnType<typeof expenseDashboard>>;
const money = (cents: number) => new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(cents/100);
const dateLabel = (date: string) => new Date(date + "T12:00:00").toLocaleDateString("es-PE", {day:"2-digit",month:"short"});

export default function ExpenseDashboard({ data, period }: { data: Data; period: string }) {
  const max = Math.max(1,...data.daily.map(d => d.operating+d.fixed));
  const cards = [
    ["Total de gastos", money(data.total)],
    ["Gastos operativos", money(data.operating)],
    ["Gastos fijos", money(data.fixed)],
    ["Gastos registrados", String(data.count)],
  ];
  return <section aria-label="Dashboard de gastos">
    <p className="period-caption">Gastos {{day:"del día",week:"de la semana",month:"del mes"}[period]} · {dateLabel(data.start)} al {dateLabel(data.end)}</p>
    <div className="stats">
      {cards.map(([label,value]) => <article className="stat" key={label}><div className="stat-label">{label}</div><strong>{value}</strong><small>Solo el período seleccionado</small></article>)}
    </div>
    <section className="panel expense-chart">
      <div className="panel-heading"><h2>Gastos por fecha</h2></div>
      <div className="expense-legend"><span><i className="operating" />Operativos</span><span><i className="fixed" />Fijos</span></div>
      {data.count === 0 && <p className="panel-hint">No hay gastos registrados en este período.</p>}
      <div className="expense-days">
        {data.daily.map(row => <div className="expense-day" key={row.date}>
          <span>{dateLabel(row.date)}</span>
          <div className="expense-track" role="img" aria-label={`${dateLabel(row.date)}: operativos ${money(row.operating)}, fijos ${money(row.fixed)}`}>
            <span className="operating" style={{width:`${row.operating/max*100}%`}} /><span className="fixed" style={{width:`${row.fixed/max*100}%`}} />
          </div>
          <strong>{money(row.operating+row.fixed)}</strong>
          <small>Operativos {money(row.operating)} · Fijos {money(row.fixed)}</small>
        </div>)}
      </div>
      <p className="panel-hint">Incluye todos los gastos del período, incluso si la tabla muestra solo los 200 más recientes. Los depósitos, entregas y pagos de financiamiento se registran por separado.</p>
    </section>
  </section>;
}
