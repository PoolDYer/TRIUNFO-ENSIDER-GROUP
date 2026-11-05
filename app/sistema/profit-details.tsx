import type {profitDashboard} from "@/lib/profit-dashboard";
type Data=Awaited<ReturnType<typeof profitDashboard>>;
const money=(v:number|null)=>v===null?"Pendiente":new Intl.NumberFormat("es-PE",{style:"currency",currency:"PEN"}).format(v/100);
const dateLabel=(date:string)=>new Date(date+"T12:00:00").toLocaleDateString("es-PE");

function Grid({headers,children}:{headers:string[];children:React.ReactNode}) {
  return <div className="table-scroll"><table><thead><tr>{headers.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{children}</tbody></table></div>;
}

export default function ProfitDetails({data}:{data:Data}) {
  const investment=data.missingSaleCosts?null:data.investment;
  const lossCost=data.missingLossCosts?null:data.productLossCost;
  const steps:[string,number|null][]=[
    ["1. Total vendido",data.sold],
    ["2. Menos: inversión de los productos vendidos",investment===null?null:-investment],
    ["Margen bruto (ventas menos inversión)",data.grossProfit],
    ["3. Menos: gastos operativos",-data.operating],
    ["4. Menos: gastos fijos",-data.fixed],
    ["5. Menos: costo de los productos perdidos",lossCost===null?null:-lossCost],
    ["Resultado neto",data.result],
  ];
  return <>
    <section className="panel">
      <div className="panel-heading"><h2>Cómo se obtuvo el resultado</h2></div>
      <dl className="profit-calculation">{steps.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{money(value)}</dd></div>)}</dl>
      <p className="panel-hint">Total descontado: <strong>{money(data.totalDeductions)}</strong>. Margen neto sobre ventas: <strong>{data.marginPercent===null?"No calculable":new Intl.NumberFormat("es-PE",{maximumFractionDigits:2}).format(data.marginPercent)+" %"}</strong>.</p>
      <p className="panel-hint" role="status">{data.result===null?"Resultado pendiente: revisa los costos o las diferencias indicadas.":data.result>0?`Hay una ganancia de ${money(data.result)} después de todos los descuentos registrados.`:data.result<0?`Hay una pérdida de ${money(-data.result)}: los costos y gastos superan lo vendido.`:"El resultado es cero: los ingresos y los descuentos registrados se equilibran."}</p>
    </section>
    <section className="panel"><div className="panel-heading"><h2>Comprobación del cálculo</h2></div>
      <ul className="profit-checks">
        <li>{data.inconsistentSales===0?"El total vendido coincide con el detalle de productos.":`${data.inconsistentSales} ventas no coinciden con su detalle. El resultado queda pendiente.`}</li>
        <li>{data.missingSaleCosts===0?"Todos los productos vendidos tienen costo de compra histórico.":`${data.missingSaleCosts} líneas vendidas tienen costo pendiente.`}</li>
        <li>{data.missingLossCosts===0?"Todas las pérdidas tienen costo de compra histórico.":`${data.missingLossCosts} líneas perdidas tienen costo pendiente.`}</li>
        <li>Las pérdidas se descuentan a costo de compra. Su valor de venta ({money(data.productLossAmount)}) es informativo y no se resta otra vez.</li>
        <li>Los datos corresponden del {dateLabel(data.start)} al {dateLabel(data.end)}. Los gastos fijos se descuentan en la fecha registrada, sin repartirlos automáticamente entre días.</li>
        <li>Los pagos de financiamiento no se descuentan automáticamente aquí. Un interés u otro gasto debe estar registrado como gasto para entrar en esta fórmula.</li>
      </ul>
    </section>
    <section className="panel"><div className="panel-heading"><h2>Productos vendidos e inversión</h2></div>
      {data.soldItems.length?<Grid headers={["Producto","Cantidad vendida","Precio de venta histórico","Total vendido","Costo de compra histórico","Inversión"]}>
        {data.soldItems.map((i,index)=><tr key={index}><td>{i.code} · {i.name}</td><td>{i.quantity}</td><td>{money(i.unitPrice)}</td><td>{money(i.revenue)}</td><td>{money(i.purchasePrice)}</td><td>{money(i.cost)}</td></tr>)}
      </Grid>:<p className="panel-hint">No hay productos vendidos en este período.</p>}
      <p className="panel-hint">Inversión = cantidad vendida × costo de compra histórico. Un producto aparece en varias filas si se vendió con diferentes precios o costos.</p>
    </section>
    <section className="panel"><div className="panel-heading"><h2>Gastos que se descontaron</h2></div>
      {data.expenseItems.length?<Grid headers={["Fecha","Detalle","Tipo","Monto descontado"]}>
        {data.expenseItems.map(i=><tr key={i.id}><td>{dateLabel(i.date)}</td><td>{i.detail}</td><td>{i.kind==="FIXED"?"Fijo":"Operativo"}</td><td>{money(i.amount)}</td></tr>)}
      </Grid>:<p className="panel-hint">No hay gastos registrados en este período.</p>}
    </section>
    <section className="panel"><div className="panel-heading"><h2>Productos perdidos</h2></div>
      {data.lostItems.length?<Grid headers={["Producto","Cantidad perdida","Valor de venta unitario","Valor de venta total (informativo)","Costo de compra unitario","Costo descontado"]}>
        {data.lostItems.map((i,index)=><tr key={index}><td>{i.code} · {i.name}</td><td>{i.quantity}</td><td>{money(i.unitPrice)}</td><td>{money(i.value)}</td><td>{money(i.purchasePrice)}</td><td>{money(i.cost)}</td></tr>)}
      </Grid>:<p className="panel-hint">No hay pérdidas de productos en este período.</p>}
    </section>
  </>;
}
