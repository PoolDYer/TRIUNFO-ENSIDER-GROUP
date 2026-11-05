import {profitSeries} from "@/lib/profit-series";
const money=(cents:number)=>new Intl.NumberFormat("es-PE",{style:"currency",currency:"PEN"}).format(cents/100);
const dateLabel=(date:string)=>new Date(date+"T12:00:00").toLocaleDateString("es-PE",{day:"2-digit",month:"short"});

export default function ProfitBars({daily,period}:{daily:{date:string;result:number|null}[];period:string}) {
  if(period==="day")return null;
  const data=profitSeries(daily);
  return <section className="panel profit-bar-panel" aria-label={`Dashboard ${period==="month"?"mensual":"semanal"} de ganancias y pérdidas`}>
    <div className="panel-heading"><h2>Dashboard {period==="month"?"mensual":"semanal"}: ganancias y pérdidas</h2></div>
    <div className="profit-bar-totals">
      <div><span>Ganancias acumuladas por día</span><strong>{money(data.gain)}</strong></div>
      <div><span>Pérdidas acumuladas por día</span><strong>{money(data.loss)}</strong></div>
    </div>
    <div className="expense-legend"><span><i className="profit-gain-color"/>Ganancia</span><span><i className="profit-loss-color"/>Pérdida</span></div>
    {data.pending>0&&<p className="info-message">Hay {data.pending} fechas pendientes de cálculo. Las barras y los acumulados incluyen solo los días con resultado calculado.</p>}
    <div className="profit-bar-scroll" tabIndex={0} role="region" aria-label="Gráfico de barras por fecha; desplázate horizontalmente para ver todas las fechas">
      <div className="profit-bar-grid" style={{gridTemplateColumns:`repeat(${Math.max(data.points.length,1)},minmax(100px,1fr))`}}>
        {data.points.map(p=><div className="profit-bar-day" key={p.date}>
          <div className="profit-bar-pair" role="img" aria-label={`${dateLabel(p.date)}: ${p.pending?"resultado pendiente":`ganancia ${money(p.gain!)}, pérdida ${money(p.loss!)}`}`}>
            <div className="profit-bar-column"><span className="profit-gain-color" style={{height:`${(p.gain??0)/data.maximum*100}%`}}/></div>
            <div className="profit-bar-column"><span className="profit-loss-color" style={{height:`${(p.loss??0)/data.maximum*100}%`}}/></div>
          </div>
          <strong>{dateLabel(p.date)}</strong>
          {p.pending?<small>Pendiente</small>:<><small>Ganancia: {money(p.gain!)}</small><small>Pérdida: {money(p.loss!)}</small></>}
        </div>)}
      </div>
    </div>
    <p className="panel-hint">Cada fecha tiene una barra de ganancia y otra de pérdida, con la misma escala. La diferencia entre los acumulados corresponde al resultado neto del período cuando todos los días están calculados.</p>
  </section>;
}
