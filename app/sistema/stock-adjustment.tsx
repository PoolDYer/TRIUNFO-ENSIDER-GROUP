"use client";
import {useEffect,useRef,useState} from "react";
import {X} from "lucide-react";

export default function StockAdjustment({product,onClose,onSaved}:{product:{id:string;code:string;name:string;stock:number};onClose:()=>void;onSaved:()=>void}){
 const [value,setValue]=useState(String(product.stock)),[reason,setReason]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const [requestId]=useState(()=>crypto.randomUUID());const dialog=useRef<HTMLElement>(null);
 useEffect(()=>{
  const old=document.body.style.overflow;document.body.style.overflow="hidden";
  const key=(event:KeyboardEvent)=>{if(event.key==="Escape"&&!busy)onClose();};document.addEventListener("keydown",key);
  return ()=>{document.body.style.overflow=old;document.removeEventListener("keydown",key);};
 },[busy,onClose]);
 useEffect(()=>{
  const previous=document.activeElement as HTMLElement|null,el=dialog.current;if(!el)return;
  const nodes=()=>Array.from(el.querySelectorAll<HTMLElement>("button:not([disabled]),input:not([disabled])")).filter(n=>n.offsetParent!==null);
  el.querySelector<HTMLInputElement>('input[name="stock"]')?.select();
  const key=(e:KeyboardEvent)=>{if(e.key!=="Tab")return;const list=nodes(),first=list[0],last=list.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}};
  el.addEventListener("keydown",key);return ()=>{el.removeEventListener("keydown",key);previous?.focus();};
 },[]);
 async function submit(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy)return;setBusy(true);setError("");
  try{const response=await fetch("/api/operations",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"productStock",data:{id:requestId,productId:product.id,stock:value,expectedStock:product.stock,reason}})});
   const result=await response.json();if(!response.ok)throw new Error(result.error);onSaved();
  }catch(error){setError((error as Error).message);}finally{setBusy(false);}
 }
 return <div className="modal-backdrop" onClick={event=>{if(event.target===event.currentTarget&&!busy)onClose();}}><section className="modal" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="stock-adjustment-title">
  <header className="modal-header"><div><h2 id="stock-adjustment-title">Modificar cantidad existente o stock</h2><p>{product.code} · {product.name}</p></div><button type="button" className="icon-button" aria-label="Cerrar ajuste de stock" disabled={busy} onClick={onClose}><X size={22}/></button></header>
  <form onSubmit={submit}><div className="modal-body">
   <p>Stock actual: <strong>{product.stock}</strong></p>
   <label>Cantidad existente o stock<input name="stock" type="number" min="0" max="1000000" step="1" required value={value} disabled={busy} onChange={event=>setValue(event.target.value.replace(/^0+(?=\d)/,""))}/></label>
   <label>Motivo del ajuste<input name="reason" required maxLength={500} value={reason} disabled={busy} onChange={event=>setReason(event.target.value)} placeholder="Ejemplo: corrección por conteo físico"/></label>
   <p className="info-message">Se guardará la cantidad total indicada. El ajuste quedará en Trazabilidad con el stock anterior, el nuevo stock y el motivo. No genera una venta, un ingreso de caja ni una entrada de mercadería.</p>
   {error&&<p className="error-message" role="alert">{error}</p>}
  </div><footer className="modal-footer"><button type="button" className="button secondary" disabled={busy} onClick={onClose}>Cancelar</button><button className="button orange" disabled={busy||!value.trim()||!reason.trim()||Number(value)===product.stock}>{busy?"Guardando…":"Guardar stock"}</button></footer></form>
 </section></div>;
}
