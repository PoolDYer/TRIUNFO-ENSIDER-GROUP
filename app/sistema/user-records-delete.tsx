"use client";
import {useEffect,useRef,useState} from "react";
import {RefreshCw,X} from "lucide-react";
import type {previewUserRecords,RecordKind} from "@/lib/user-records";
type Preview=Awaited<ReturnType<typeof previewUserRecords>>;
const labels:Record<RecordKind,string>={sales:"Ventas",saleItems:"Detalles de productos vendidos",saleLosses:"Pérdidas de productos",receipts:"Entradas de inventario",receiptItems:"Detalles de entradas",financingPayments:"Pagos de financiamiento",expenses:"Gastos",treasury:"Movimientos de caja",bankMovements:"Movimientos de cuenta corriente",cashOpenings:"Aperturas de caja",cashHandoffs:"Entregas de efectivo y Yape",googleExports:"Enlaces a reportes generados",auditEntries:"Registros de trazabilidad del administrador"};

export default function UserRecordsDelete({user,onClose,onSaved}:{user:{id:string;name:string;email:string};onClose:()=>void;onSaved:()=>void}){
  const [preview,setPreview]=useState<Preview|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[reload,setReload]=useState(0);
  const [confirmation,setConfirmation]=useState(""),[error,setError]=useState("");
  const dialog=useRef<HTMLElement>(null);
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);setPreview(null);setConfirmation("");setError("");
    fetch(`/api/user-records?userId=${encodeURIComponent(user.id)}`,{cache:"no-store",signal:controller.signal})
      .then(async response=>{const result=await response.json();if(!response.ok)throw new Error(result.error);if(!controller.signal.aborted)setPreview(result);})
      .catch(error=>{if(!controller.signal.aborted)setError(error.message);})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return ()=>controller.abort();
  },[user.id,reload]);
  useEffect(()=>{
    const old=document.body.style.overflow;document.body.style.overflow="hidden";
    const close=(event:KeyboardEvent)=>{if(event.key==="Escape"&&!busy)onClose();};
    document.addEventListener("keydown",close);
    return ()=>{document.body.style.overflow=old;document.removeEventListener("keydown",close);};
  },[busy,onClose]);
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null,element=dialog.current;
    if(!element)return;
    const nodes=()=>Array.from(element.querySelectorAll<HTMLElement>("button:not([disabled]),input:not([disabled])")).filter(node=>node.offsetParent!==null);
    nodes()[0]?.focus();
    const trap=(event:KeyboardEvent)=>{
      if(event.key!=="Tab")return;const list=nodes(),first=list[0],last=list.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    };
    element.addEventListener("keydown",trap);
    return ()=>{element.removeEventListener("keydown",trap);previous?.focus();};
  },[]);
  async function submit(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();if(!preview||busy||loading||preview.blockers.length)return;
    setBusy(true);setError("");
    try{
      const response=await fetch("/api/operations",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"userRecordsDelete",data:{id:user.id,confirmation,version:preview.version}})});
      const result=await response.json();if(!response.ok)throw new Error(result.error);onSaved();
    }catch(error){setError((error as Error).message);}finally{setBusy(false);}
  }
  return <div className="modal-backdrop" onClick={event=>{if(event.target===event.currentTarget&&!busy)onClose();}}>
    <section ref={dialog} className="modal wide" role="dialog" aria-modal="true" aria-labelledby="user-records-title">
      <header className="modal-header"><div><h2 id="user-records-title">Eliminar registros del administrador</h2><p>{user.name} · {user.email}</p></div><button className="icon-button" type="button" aria-label="Cerrar revisión de registros" disabled={busy} onClick={onClose}><X size={22}/></button></header>
      <form onSubmit={submit}>
        <div className="modal-body">
          <p className="error-message">Este borrado es definitivo. Se eliminarán todos sus registros operativos y se recalcularán el stock, la caja y los saldos afectados.</p>
          <p className="info-message">La cuenta del administrador se conserva. Esta opción es distinta de «Eliminar usuario».</p>
          <button className="button secondary" type="button" disabled={loading||busy} onClick={()=>setReload(value=>value+1)}><RefreshCw size={16}/>Actualizar resumen</button>
          {loading&&<p role="status">Revisando los registros y sus efectos…</p>}
          {error&&<p className="error-message" role="alert">{error}</p>}
          {preview&&<>
            <h3>Registros que se eliminarán</h3>
            <div className="table-scroll"><table><thead><tr><th>Tipo de registro</th><th>Cantidad</th></tr></thead><tbody>{Object.entries(labels).map(([kind,label])=><tr key={kind}><td>{label}</td><td>{preview.counts[kind as RecordKind]}</td></tr>)}</tbody></table></div>
            {preview.stock.length>0&&<><h3>Cambios en el stock</h3><div className="table-scroll"><table><thead><tr><th>Código</th><th>Producto</th><th>Stock actual</th><th>Ajuste</th><th>Stock después</th></tr></thead><tbody>{preview.stock.map(product=><tr key={product.id}><td>{product.code}</td><td>{product.name}</td><td>{product.stock}</td><td>{product.delta>0?"+":""}{product.delta}</td><td>{product.afterStock}</td></tr>)}</tbody></table></div></>}
            {preview.blockers.length>0&&<div className="error-message" role="alert"><strong>No se puede ejecutar el borrado:</strong><ul>{preview.blockers.map(message=><li key={message}>{message}</li>)}</ul></div>}
            {!preview.totalRecords&&<p className="info-message">Este administrador no tiene registros para eliminar.</p>}
            {preview.totalRecords>0&&preview.blockers.length===0&&<label>Para confirmar, escribe el correo del administrador<input name="confirmation" value={confirmation} onChange={event=>setConfirmation(event.target.value)} autoComplete="off" spellCheck={false} disabled={busy} placeholder={preview.user.email} required/></label>}
            <p className="panel-hint">Se conservan los registros de otros usuarios. Si hay datos vinculados que impiden el borrado, primero deben revisarse. Los enlaces a reportes se eliminan del sistema; los archivos de Google Sheets se administran desde Google Drive. El Dueño conservará una constancia de esta eliminación en Trazabilidad.</p>
          </>}
        </div>
        <footer className="modal-footer"><button className="button secondary" type="button" disabled={busy} onClick={onClose}>Cancelar</button><button className="button danger" disabled={busy||loading||!preview||!preview.totalRecords||!!preview.blockers.length||confirmation.trim().toLowerCase()!==preview.user.email}>{busy?"Eliminando registros…":"Eliminar todos sus registros"}</button></footer>
      </form>
    </section>
  </div>;
}
