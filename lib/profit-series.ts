export function profitSeries(daily:{date:string;result:number|null}[]) {
  const points=daily.map(d=>({date:d.date,pending:d.result===null,
    gain:d.result===null?null:Math.max(d.result,0),
    loss:d.result===null?null:Math.max(-d.result,0)}));
  const gain=points.reduce((s,p)=>s+(p.gain??0),0);
  const loss=points.reduce((s,p)=>s+(p.loss??0),0);
  const pending=points.filter(p=>p.pending).length;
  return {points,gain,loss,pending,net:pending?null:gain-loss,
    maximum:Math.max(1,...points.flatMap(p=>[p.gain??0,p.loss??0]))};
}
