"use client";
import {useEffect,useState} from "react";
import {ChevronDown,RefreshCw,Wallet} from "lucide-react";
import type {cashHandoffReport} from "@/lib/cash-handoffs";
type CashReport=Awaited<ReturnType<typeof cashHandoffReport>>;
const money=(value:number|string)=>new Intl.NumberFormat("es-PE",{style:"currency",currency:"PEN"}).format(Number(value)/100);
const registrationDate=(value:string)=>new Intl.DateTimeFormat("es-PE",{timeZone:"America/Lima",dateStyle:"short",timeStyle:"short"}).format(new Date(value));
const deliveryType=(amount:unknown,before:unknown,legacy:boolean)=>Number(amount)===0?"—":legacy?"Registro anterior":Number(amount)===Number(before)?"Total disponible":"Parcial";

export default function CashMovements({refreshKey,onSaved,open,onToggle}:{refreshKey:number;onSaved:()=>void;open:boolean;onToggle:()=>void}){
  const [data,setData]=useState<CashReport|null>(null),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false);
  const [page,setPage]=useState(1),[reload,setReload]=useState(0),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const [cash,setCash]=useState(""),[yape,setYape]=useState(""),[detail,setDetail]=useState("");
  const [requestId,setRequestId]=useState(()=>crypto.randomUUID());
  useEffect(()=>{
    if(!open)return;
    const controller=new AbortController();setLoading(true);
    fetch(`/api/cash-handoffs?page=${page}`,{signal:controller.signal,cache:"no-store"})
      .then(async response=>{const result=await response.json();if(!response.ok)throw new Error(result.error);if(!controller.signal.aborted)setData(result);})
      .catch(error=>{if(!controller.signal.aborted)setError(error.message);})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return ()=>controller.abort();
  },[open,page,reload,refreshKey]);
  const b=data?.balances;
  async function submit(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();if(busy||loading||!b)return;
    setBusy(true);setError("");setNotice("");
    try{
      const response=await fetch("/api/operations",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"cashHandoff",data:{
        id:requestId,cashAmount:Number(cash||0),yapeAmount:Number(yape||0),expectedCashAvailable:b.cashAvailable,expectedYapeAvailable:b.yapeAvailable,detail,
      }})});
      const result=await response.json();if(!response.ok)throw new Error(result.error);
      setCash("");setYape("");setDetail("");setRequestId(crypto.randomUUID());setPage(1);setLoading(true);
      setNotice("Entrega al dueño registrada. Los saldos y el historial se actualizaron.");setReload(value=>value+1);onSaved();
    }catch(error){setError((error as Error).message);setReload(value=>value+1);}
    finally{setBusy(false);}
  }
  return <section className="panel cash-handoffs">
    <button type="button" className="cash-handoff-heading" aria-expanded={open} aria-controls="cash-handoff-content" onClick={onToggle}>
      <Wallet size={23}/><span><strong>Movimientos de la caja</strong><small>Entregas de efectivo y Yape al dueño · saldos acumulados e historial</small></span><ChevronDown size={21}/>
    </button>
    {open&&<div id="cash-handoff-content" className="cash-handoff-content">
      <div className="cash-handoff-toolbar"><p className="muted">Se incluyen los días anteriores pendientes hasta hoy. La fecha y hora de registro se guardan automáticamente.</p>
        <button className="button" type="button" disabled={busy||loading} onClick={()=>{setError("");setReload(value=>value+1);}}><RefreshCw size={16}/>Actualizar saldos</button></div>
      {error&&<p className="form-error" role="alert">{error}</p>}{notice&&<p className="info-message" role="status">{notice}</p>}
      {loading&&!b&&<p role="status">Cargando movimientos de la caja…</p>}
      {b&&<>
        <div className="cash-handoff-balances">
          <article><h3>Monto físico (caja)</h3><dl>
            <div><dt>Físico acumulado antes de entregas</dt><dd>{money(b.cashBase)}</dd></div>
            <div><dt>Entregado al dueño</dt><dd>{money(b.cashDelivered)}</dd></div>
            <div className="cash-handoff-pending"><dt>Pendiente de entregar</dt><dd>{money(b.cashAvailable)}</dd></div>
          </dl></article>
          <article><h3>Yape</h3><dl>
            <div><dt>Total de Yape registrado</dt><dd>{money(b.yapeRegistered)}</dd></div>
            <div><dt>Yape entregado al dueño</dt><dd>{money(b.yapeDelivered)}</dd></div>
            <div className="cash-handoff-pending"><dt>Yape pendiente de entregar</dt><dd>{money(b.yapeAvailable)}</dd></div>
          </dl><p className="muted">Se consideran solo los cobros registrados con medio Yape.</p></article>
        </div>
        {(b.cashRemaining<0||b.yapeRemaining<0)&&<p className="form-error" role="alert">Hay un saldo negativo que debe revisar el dueño: efectivo {money(b.cashRemaining)}, Yape {money(b.yapeRemaining)}. No se permite entregar más de lo disponible.</p>}
        <form className="cash-handoff-form" onSubmit={submit}>
          <h3>Registrar entrega al dueño</h3><p className="muted">Puedes registrar una entrega parcial o todo el saldo de cualquiera de las dos modalidades.</p>
          <div className="form-grid">
            <div className="cash-handoff-amount"><label>Monto físico entregado (S/)<input type="number" name="cashAmount" min="0" max={b.cashAvailable/100} step="0.01" placeholder="0.00" value={cash} disabled={busy||loading} onChange={event=>setCash(event.target.value.replace(/^0+(?=\d)/,""))}/></label>
              <small>Límite disponible: {money(b.cashAvailable)}</small>
              <button type="button" className="text-button" disabled={busy||loading||!b.cashAvailable} onClick={()=>setCash((b.cashAvailable/100).toFixed(2))}>Entregar todo el efectivo</button>
            </div>
            <div className="cash-handoff-amount"><label>Monto de Yape entregado (S/)<input type="number" name="yapeAmount" min="0" max={b.yapeAvailable/100} step="0.01" placeholder="0.00" value={yape} disabled={busy||loading} onChange={event=>setYape(event.target.value.replace(/^0+(?=\d)/,""))}/></label>
              <small>Límite disponible: {money(b.yapeAvailable)}</small>
              <button type="button" className="text-button" disabled={busy||loading||!b.yapeAvailable} onClick={()=>setYape((b.yapeAvailable/100).toFixed(2))}>Entregar todo el Yape</button>
            </div>
          </div>
          <label>Detalle (opcional)<input maxLength={500} value={detail} onChange={event=>setDetail(event.target.value)} disabled={busy||loading} placeholder="Observación o referencia de la entrega"/></label>
          <p className="info-message">Pendiente después de esta entrega: efectivo <strong>{money(b.cashAvailable-Math.round(Number(cash||0)*100))}</strong> · Yape <strong>{money(b.yapeAvailable-Math.round(Number(yape||0)*100))}</strong>.</p>
          <button className="button orange" disabled={busy||loading||(!Number(cash)&&!Number(yape))}>{busy?"Registrando…":"Registrar entrega"}</button>
        </form>
        <div className="panel-heading"><h3>Historial de entregas al dueño</h3><span>{data!.total} registros · fecha y hora de Lima</span></div>
        {data!.history.length?<div className="table-scroll"><table><thead><tr>{["Fecha y hora","Responsable","Físico entregado","Yape entregado","Entrega física","Entrega de Yape","Saldo físico después","Saldo Yape después","Detalle"].map(label=><th key={label}>{label}</th>)}</tr></thead>
          <tbody>{data!.history.map((row:any)=><tr key={row.id}>
            <td>{registrationDate(row.created_at)}{row.legacy&&<small>Fecha de caja: {row.date}</small>}</td><td>{row.user_name}</td>
            <td>{money(row.cash_amount)}</td><td>{money(row.yape_amount)}</td>
            <td>{deliveryType(row.cash_amount,row.cash_available_before,row.legacy)}</td><td>{deliveryType(row.yape_amount,row.yape_available_before,row.legacy)}</td>
            <td>{row.legacy?"Sin dato histórico":money(Number(row.cash_available_before)-Number(row.cash_amount))}</td><td>{row.legacy?"Sin dato histórico":money(Number(row.yape_available_before)-Number(row.yape_amount))}</td><td>{row.detail||"—"}</td>
          </tr>)}</tbody></table></div>:<p className="empty">Todavía no se registraron entregas al dueño.</p>}
        <div className="cash-handoff-pagination"><button type="button" className="button" disabled={page<=1||loading||busy} onClick={()=>setPage(value=>value-1)}>Anterior</button><span>Página {data!.page} de {data!.pages}</span><button type="button" className="button" disabled={page>=data!.pages||loading||busy} onClick={()=>setPage(value=>value+1)}>Siguiente</button></div>
        <p className="panel-hint">El efectivo usa aperturas más cobros en efectivo, menos gastos, deudas, depósitos y entregas previas. Las entregas de Yape no descuentan la caja física ni modifican las ganancias. «Total disponible» corresponde al saldo que existía al registrar esa entrega.</p>
      </>}
    </div>}
  </section>;
}
