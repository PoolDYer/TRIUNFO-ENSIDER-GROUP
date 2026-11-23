import {z} from "zod";
import type {DB} from "./db";
import {AppError,type User} from "./auth";
import {numericSchema} from "./validation";

const stock=numericSchema.pipe(z.number().int().min(0).max(1000000));
const adjustment=z.object({id:z.string().uuid(),productId:z.string().uuid(),stock,
  expectedStock:numericSchema.pipe(z.number().int().min(0).max(2147483647)),reason:z.string().trim().min(1,"Indica el motivo del ajuste.").max(500)});

/** Operación transaccional: bloqueo de operaciones, stock e historial se confirman juntos. */
export async function adjustStock(c:DB,user:User,input:unknown){
  if(user.role!=="ADMIN")throw new AppError("Solo el dueño puede modificar el stock.",403);
  const p=adjustment.parse(input);
  const previous=(await c.query("SELECT * FROM stock_adjustments WHERE id=$1",[p.id])).rows[0];
  if(previous){
    if(previous.user_id!==user.id||previous.product_id!==p.productId||Number(previous.new_stock)!==p.stock||Number(previous.previous_stock)!==p.expectedStock||previous.reason!==p.reason)
      throw new AppError("El identificador ya pertenece a otro ajuste de stock.",409);
    return {id:p.id,created:false};
  }
  const product=(await c.query("SELECT code,name,stock FROM products WHERE id=$1 FOR UPDATE",[p.productId])).rows[0];
  if(!product)throw new AppError("El producto ya no existe.",404);
  if(Number(product.stock)!==p.expectedStock)throw new AppError("El stock cambió desde que abriste el formulario. Actualiza la lista antes de ajustar la cantidad.",409);
  if(p.stock===p.expectedStock)throw new AppError("La cantidad nueva debe ser distinta del stock actual.");
  await c.query("UPDATE products SET stock=$2 WHERE id=$1",[p.productId,p.stock]);
  await c.query("INSERT INTO stock_adjustments(id,product_id,code,name,previous_stock,new_stock,reason,user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
    [p.id,p.productId,product.code,product.name,product.stock,p.stock,p.reason,user.id]);
  return {id:p.id,created:true};
}
