import type { profitDashboard } from "@/lib/profit-dashboard";
import ProfitDetails from "./profit-details";
import ProfitBars from "./profit-bars";

type Data = Awaited<ReturnType<typeof profitDashboard>>;
const money = (cents: number | null) => cents === null ? "Pendiente" : new Intl.NumberFormat("es-PE", {style:"currency",currency:"PEN"}).format(cents/100);
const dateLabel = (date: string) => new Date(date+"T12:00:00").toLocaleDateString("es-PE");

export default function ProfitDashboard({data,period}:{data:Data;period:string}) {
  const cards = [
    ["Total vendido",money(data.sold),`${data.salesCount} ventas del período`],
    ["Inversión de lo vendido",money(data.missingSaleCosts ? null : data.investment),"Cantidad vendida × costo histórico de compra"],
    ["Gastos operativos",money(data.operating),"Gastos registrados en el período"],
    ["Gastos fijos",money(data.fixed),"Gastos registrados en el período"],
    ["Pérdida de productos (costo)",money(data.missingLossCosts ? null : data.productLossCost),`Valor de venta de lo perdido: ${money(data.productLossAmount)}`],
    ["Ganancia neta",money(data.gain),"Resultado positivo después de costos y gastos"],
    ["Pérdida",money(data.loss),"Resultado negativo después de costos y gastos"],
  ];
  return <>
    <p className="period-caption">{dateLabel(data.start)} al {dateLabel(data.end)} · Montos en soles</p>
    {data.missingCosts > 0 && <p role="alert" className="info-message">Hay {data.missingCosts} líneas de venta o pérdida sin costo de compra histórico. La ganancia y la pérdida quedan pendientes para no mostrar resultados incorrectos. Cambiar el precio actual del catálogo no modifica esos movimientos anteriores.</p>}
    {data.inconsistentSales>0 && <p role="alert" className="error-message">Hay {data.inconsistentSales} ventas cuyo total no coincide con sus productos registrados. El resultado queda pendiente para evitar una ganancia incorrecta.</p>}
    <div className="stats three">{cards.map(([label,value,note])=><article className="stat" key={label}><div className="stat-label">{label}</div><strong>{value}</strong><small>{note}</small></article>)}</div>
    <ProfitBars daily={data.daily} period={period} />
    <ProfitDetails data={data} />
    <section className="panel"><div className="panel-heading"><h2>Detalle por fecha</h2></div>
      <div className="table-scroll"><table><thead><tr>{["Fecha","Vendido","Inversión de lo vendido","Gastos operativos","Gastos fijos","Pérdida de productos (costo)","Resultado neto"].map(h=><th key={h}>{h}</th>)}</tr></thead>
      <tbody>{data.daily.map(d=><tr key={d.date}><td>{dateLabel(d.date)}</td><td>{money(d.sold)}</td><td>{money(d.missingSaleCosts ? null : d.investment)}</td><td>{money(d.operating)}</td><td>{money(d.fixed)}</td><td>{money(d.missingLossCosts ? null : d.productLossCost)}</td><td><strong>{money(d.result)}</strong></td></tr>)}</tbody></table></div>
    </section>
  </>;
}
