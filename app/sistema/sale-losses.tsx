"use client";
import { useState } from "react";

type Product={id:string;code:string;name:string;stock:number;sale_price:string};
const money=(cents:number)=>new Intl.NumberFormat("es-PE",{style:"currency",currency:"PEN"}).format(cents/100);

export default function SaleLosses({products}:{products:Product[]}) {
  const [lines,setLines]=useState<{productId:string;quantity:string}[]>([]);
  const total=lines.reduce((sum,line)=>sum+Number(products.find(p=>p.id===line.productId)?.sale_price??0)*Number(line.quantity),0);
  return <section className="sale-losses" aria-label="Pérdida de productos">
    <h3>Pérdida de productos</h3>
    <p>Registra unidades adicionales a las vendidas. Se descontarán del stock y no se cobrarán al cliente.</p>
    {lines.map((line,index)=><div className="loss-line" key={index}>
      <label>Producto perdido<select name="lossProductId" aria-label={`Producto perdido ${index+1}`} required value={line.productId} onChange={e=>setLines(prev=>prev.map((v,n)=>n===index?{...v,productId:e.target.value}:v))}>
        <option value="">Selecciona un producto</option>
        {products.filter(p=>p.id===line.productId||!lines.some(v=>v.productId===p.id)).map(p=><option key={p.id} value={p.id}>{p.code} · {p.name} ({p.stock} disponibles)</option>)}
      </select></label>
      <label>Cantidad perdida<input type="number" name="lossQuantity" aria-label={`Cantidad perdida ${index+1}`} min="1" max="1000000" step="1" required value={line.quantity} onChange={e=>setLines(prev=>prev.map((v,n)=>n===index?{...v,quantity:e.target.value.replace(/^0+(?=\d)/,"")}:v))} /></label>
      <span>{money(Number(products.find(p=>p.id===line.productId)?.sale_price??0)*Number(line.quantity))}</span>
      <button type="button" className="text-button" onClick={()=>setLines(prev=>prev.filter((_,n)=>n!==index))}>Quitar</button>
    </div>)}
    <button type="button" className="text-button" disabled={lines.length>=50} onClick={()=>setLines([...lines,{productId:"",quantity:"1"}])}>+ Agregar producto perdido</button>
    <label>Monto total de deuda / pérdida de productos (S/)<input readOnly value={money(total)} /></label>
    {lines.length>0 && <label>Motivo de la pérdida<input name="lossReason" required maxLength={250} placeholder="Daño, extravío u otro motivo" /></label>}
    <small>Valor de referencia: cantidad perdida × precio de venta del catálogo. En Ganancias se descuenta el costo de compra de esas unidades.</small>
  </section>;
}
