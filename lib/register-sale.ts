import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { DB } from "./db";
import { AppError, type User } from "./auth";
import { cents, dateSchema, moneySchema, quantitySchema } from "./validation";

const item = z.object({productId:z.string().uuid(),quantity:quantitySchema});
const saleSchema = z.object({
  id:z.string().uuid(),date:dateSchema,
  items:z.array(item.extend({unitPrice:moneySchema})).min(1).max(50),
  losses:z.array(item).max(50).default([]),
  digital:moneySchema,debt:moneySchema.default(0),
  method:z.enum(["YAPE","TRANSFER","NONE"]),reference:z.string().trim().max(120),
  detail:z.string().trim().max(500).default(""),
});

export async function registerSale(c:DB,u:User,input:unknown) {
  const p=saleSchema.parse(input);
  if (p.debt>0) throw new AppError("Registra el producto y la cantidad perdida en Pérdida de productos; el monto se calcula automáticamente.");
  for(const list of [p.items,p.losses]) {
    if(new Set(list.map(i=>i.productId)).size!==list.length)
      throw new AppError("Agrupa las cantidades de cada producto en una sola línea.");
  }
  const total=p.items.reduce((sum,i)=>sum+cents(i.unitPrice)*i.quantity,0);
  const digital=cents(p.digital),cash=total-digital;
  if(!Number.isSafeInteger(total)||total<=0||cash<0)
    throw new AppError("El pago digital no puede superar la facturación. Revisa los importes.");
  if(digital>0&&(p.method==="NONE"||!p.reference))
    throw new AppError("Indica el medio digital y su código de operación.");
  if(p.losses.length&&!p.detail) throw new AppError("Indica el motivo de la pérdida de productos.");
  const quantities=new Map<string,number>();
  for(const i of [...p.items,...p.losses]) quantities.set(i.productId,(quantities.get(i.productId)??0)+i.quantity);
  const products=new Map<string,{code:string;name:string;purchase_price:string|null;sale_price:string}>();
  for(const [productId,quantity] of [...quantities].sort(([a],[b])=>a.localeCompare(b))) {
    const {rows}=await c.query("UPDATE products SET stock=stock-$1 WHERE id=$2 AND active=true AND stock >= $1 RETURNING code,name,purchase_price,sale_price",[quantity,productId]);
    if(!rows[0]) throw new AppError("Stock insuficiente para las unidades vendidas y perdidas, o producto desactivado. Actualiza los datos.",409);
    products.set(productId,rows[0]);
  }
  const lossAmount=p.losses.reduce((sum,i)=>sum+Number(products.get(i.productId)!.sale_price)*i.quantity,0);
  if(!Number.isSafeInteger(lossAmount)) throw new AppError("El monto de pérdida supera los límites de precisión permitidos.");
  await c.query("INSERT INTO sales(id,date,detail,cash,digital,debt,method,reference,total,user_id) VALUES($1,$2,$3,$4,$5,0,$6,$7,$8,$9)",[p.id,p.date,p.detail,cash,digital,digital?p.method:"NONE",p.reference,total,u.id]);
  for(const i of p.items) {
    const product=products.get(i.productId)!;
    await c.query("INSERT INTO sale_items(id,sale_id,product_id,code,name,quantity,unit_price,purchase_price) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",[randomUUID(),p.id,i.productId,product.code,product.name,i.quantity,cents(i.unitPrice),product.purchase_price]);
  }
  for(const i of p.losses) {
    const product=products.get(i.productId)!;
    await c.query("INSERT INTO sale_losses(sale_id,product_id,code,name,quantity,unit_price,purchase_price) VALUES($1,$2,$3,$4,$5,$6,$7)",[p.id,i.productId,product.code,product.name,i.quantity,product.sale_price,product.purchase_price]);
  }
  return p.id;
}
