"use client";
import {useEffect,useRef,useState} from "react";
import {Bell,X} from "lucide-react";

type Notice={id:string;code:string;name:string;stock:number;min_stock:number;created_at:string;resolved_at:string|null;read_at:string|null;current_stock:number|null};
type History={notifications:Notice[];unread:number;active:number};

export default function StockNotifications({refresh}:{refresh:number}) {
  const [data,setData]=useState<History>({notifications:[],unread:0,active:0});
  const [open,setOpen]=useState(false),[error,setError]=useState(""),[toast,setToast]=useState<Notice|null>(null),[busy,setBusy]=useState(false);
  const shown=useRef(new Set<string>());
  const container=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const controller=new AbortController();let running=false;
    async function load() {
      if(running)return;running=true;
      try{
        const res=await fetch("/api/notifications",{signal:controller.signal});const value=await res.json();
        if(controller.signal.aborted)return;
        if(!res.ok)throw new Error(value.error);
        setData(value);setError("");
        const latest=value.notifications.find((n:Notice)=>!n.read_at&&!n.resolved_at&&!shown.current.has(n.id));
        if(latest)setToast(latest);
        value.notifications.forEach((n:Notice)=>shown.current.add(n.id));
      }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:"No se pudieron cargar las notificaciones.");}
      finally{running=false;}
    }
    void load();const timer=setInterval(()=>{if(document.visibilityState==="visible")void load();},30000);
    return()=>{controller.abort();clearInterval(timer);};
  },[refresh]);
  useEffect(()=>{if(!toast)return;const timer=setTimeout(()=>setToast(null),10000);return()=>clearTimeout(timer);},[toast]);
  useEffect(()=>{
    if(!open)return;
    const close=(event:PointerEvent)=>{if(event.target instanceof Node&&!container.current?.contains(event.target))setOpen(false);};
    document.addEventListener("pointerdown",close);return()=>document.removeEventListener("pointerdown",close);
  },[open]);
  async function markRead() {
    setBusy(true);try{
      const res=await fetch("/api/notifications",{method:"POST"});const value=await res.json();if(!res.ok)throw new Error(value.error);
      const readIds=new Set<string>(value.readIds);const now=new Date().toISOString();
      setData(prev=>({...prev,unread:Math.max(0,prev.unread-readIds.size),notifications:prev.notifications.map(n=>readIds.has(n.id)?{...n,read_at:n.read_at??now}:n)}));
      setToast(null);setError("");
    }catch(e){setError(e instanceof Error?e.message:"No se pudieron marcar las notificaciones.");}finally{setBusy(false);}
  }
  return <div className="stock-notifications" ref={container} onKeyDown={e=>{if(e.key==="Escape")setOpen(false);}}>
    <button className="notification-toggle" onClick={()=>setOpen(!open)} aria-expanded={open} aria-controls="stock-notification-history" aria-label={`Notificaciones${data.unread?`: ${data.unread} sin leer`:""}`}>
      <Bell size={20}/><span>Notificaciones</span>{data.unread>0&&<b>{data.unread}</b>}
    </button>
    {open&&<section className="notification-history" id="stock-notification-history" aria-label="Historial de notificaciones">
      <div className="notification-heading"><h2>Notificaciones</h2><button className="icon-button" aria-label="Cerrar notificaciones" onClick={()=>setOpen(false)}><X size={18}/></button></div>
      <p>{data.active} productos por debajo del stock mínimo.</p>
      <button className="text-button" onClick={markRead} disabled={busy||data.unread===0}>{busy?"Guardando…":"Marcar todas como leídas"}</button>
      {error&&<p role="alert" className="error-message">{error}</p>}
      {data.notifications.length===0&&<p>No hay notificaciones registradas.</p>}
      <ol>{data.notifications.map(n=><li key={n.id} className={!n.read_at?"unread":""}>
        <strong>{n.code} · {n.name}</strong>
        <p>{n.stock===0?"Producto agotado.":"El producto está próximo a acabarse."} Stock al avisar: {n.stock} · Mínimo: {n.min_stock}.</p>
        <small>{new Date(n.created_at).toLocaleString("es-PE",{timeZone:"America/Lima"})}</small>
        <small>{n.resolved_at?"Alerta resuelta":`Stock actual: ${n.current_stock??n.stock}`}{n.read_at?" · Leída":" · Sin leer"}</small>
      </li>)}</ol>
      <small>Se muestran las 100 notificaciones más recientes.</small>
    </section>}
    {toast&&<div className="stock-notification-toast" role="status">
      <Bell size={22}/><div><strong>{toast.stock===0?"Producto agotado":"Stock bajo"}: {toast.name}</strong><p>Quedan {toast.stock} unidades. Stock mínimo: {toast.min_stock}.</p><button className="text-button" onClick={()=>{setOpen(true);setToast(null);}}>Ver notificaciones</button></div>
      <button className="icon-button" aria-label="Cerrar aviso de stock" onClick={()=>setToast(null)}><X size={18}/></button>
    </div>}
  </div>;
}
