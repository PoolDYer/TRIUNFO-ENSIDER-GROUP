import {createHash} from "node:crypto";
import {z} from "zod";
import {AppError} from "./auth";
import type {DB} from "./db";

const sources={
  sales:"sales t WHERE t.user_id=$1",
  saleItems:"sale_items t JOIN sales p ON p.id=t.sale_id WHERE p.user_id=$1",
  saleLosses:"sale_losses t JOIN sales p ON p.id=t.sale_id WHERE p.user_id=$1",
  receipts:"receipts t WHERE t.user_id=$1",
  receiptItems:"receipt_items t JOIN receipts p ON p.id=t.receipt_id WHERE p.user_id=$1",
  financingPayments:"financing_payments t WHERE t.user_id=$1",
  expenses:"expenses t WHERE t.user_id=$1",
  treasury:"treasury t WHERE t.user_id=$1",
  bankMovements:"bank_movements t WHERE t.user_id=$1",
  cashOpenings:"cash_openings t WHERE t.user_id=$1",
  cashHandoffs:"cash_handoffs t WHERE t.user_id=$1",
  googleExports:"google_exports t WHERE t.user_id=$1",
  auditEntries:"audit_log t WHERE t.user_id=$1",
} as const;
export type RecordKind=keyof typeof sources;

export async function previewUserRecords(c:DB,userId:string){
  await c.query("SET LOCAL TIME ZONE 'UTC'");
  const target=(await c.query("SELECT id,name,email,role,active FROM users WHERE id=$1 AND deleted_at IS NULL",[userId])).rows[0];
  if(!target)throw new AppError("El administrador ya no existe.",404);
  if(target.role!=="SELLER")throw new AppError("Solo se pueden eliminar los registros de una cuenta de Administrador.",403);
  const rows=(await c.query(Object.entries(sources).map(([kind,source])=>
    `SELECT '${kind}' AS kind,count(*)::int AS count,md5(coalesce(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY (to_jsonb(t)::text) COLLATE "C"),'')) AS signature FROM ${source}`
  ).join(" UNION ALL ")+" ORDER BY kind",[userId])).rows;
  const counts=Object.fromEntries(rows.map(row=>[row.kind,Number(row.count)])) as Record<RecordKind,number>;
  const stock=(await c.query(`WITH movements AS (
    SELECT i.product_id,i.quantity::bigint AS delta FROM sale_items i JOIN sales s ON s.id=i.sale_id WHERE s.user_id=$1
    UNION ALL SELECT i.product_id,i.quantity::bigint FROM sale_losses i JOIN sales s ON s.id=i.sale_id WHERE s.user_id=$1
    UNION ALL SELECT i.product_id,-i.quantity::bigint FROM receipt_items i JOIN receipts r ON r.id=i.receipt_id WHERE r.user_id=$1
    UNION ALL SELECT r.product_id,-r.quantity::bigint FROM receipts r WHERE r.user_id=$1 AND NOT EXISTS(SELECT 1 FROM receipt_items i WHERE i.receipt_id=r.id)
  ), changes AS (SELECT product_id,sum(delta) AS delta FROM movements GROUP BY product_id)
  SELECT p.id,p.code,p.name,p.stock,changes.delta,(p.stock::bigint+changes.delta)::text AS after_stock
  FROM changes JOIN products p ON p.id=changes.product_id ORDER BY p.code,p.id`,[userId])).rows.map(row=>({id:String(row.id),code:String(row.code),name:String(row.name),stock:Number(row.stock),delta:Number(row.delta),afterStock:Number(row.after_stock)}));
  const dependencies=(await c.query(`SELECT
    (SELECT count(*)::int FROM financing_payments f JOIN receipts r ON r.id=f.receipt_id WHERE r.user_id=$1 AND f.user_id<>$1) AS other_payments,
    (SELECT count(*)::int FROM cash_handoffs h JOIN treasury t ON t.id=h.treasury_id WHERE (h.user_id=$1 AND t.user_id<>$1) OR (h.user_id<>$1 AND t.user_id=$1)) AS other_handoffs,
    (SELECT count(*)::int FROM google_exports WHERE user_id=$1 AND status='PENDING') AS pending_exports`,[userId])).rows[0];
  const blockers:string[]=[];
  for(const product of stock){
    if(product.afterStock<0)blockers.push(`${product.code}: el stock quedaría en ${product.afterStock}. Hay mercadería de sus entradas que ya no está disponible.`);
    if(product.afterStock>2147483647)blockers.push(`${product.code}: la cantidad resultante supera el límite de stock.`);
  }
  if(Number(dependencies.other_payments))blockers.push("Hay pagos de financiamiento de otros usuarios asociados a sus entradas. Deben revisarse antes de eliminar los registros.");
  if(Number(dependencies.other_handoffs))blockers.push("Hay entregas de caja vinculadas a movimientos de otro usuario. Deben revisarse antes de eliminar los registros.");
  if(Number(dependencies.pending_exports))blockers.push("Hay reportes de Google Sheets en proceso. Espera a que terminen antes de eliminar los registros.");
  const version=createHash("sha256").update(JSON.stringify({target,rows,stock,dependencies})).digest("hex");
  return {user:{id:target.id,name:target.name,email:target.email},counts,stock,blockers,version,totalRecords:rows.reduce((sum,row)=>sum+Number(row.count),0)};
}

const deletionSchema=z.object({id:z.string().uuid(),confirmation:z.string().trim().toLowerCase(),version:z.string().regex(/^[a-f0-9]{64}$/)});

/** Ejecutar dentro de una transacción y con el bloqueo global de operaciones. */
export async function deleteUserRecords(c:DB,input:unknown){
  const p=deletionSchema.parse(input);
  // Coordinar la revisión con cambios de contraseña u otras escrituras de la cuenta.
  await c.query("SELECT id FROM users WHERE id=$1 FOR UPDATE",[p.id]);
  const preview=await previewUserRecords(c,p.id);
  if(p.confirmation!==preview.user.email)throw new AppError("Escribe el correo del administrador para confirmar el borrado.");
  if(preview.blockers.length)throw new AppError(preview.blockers.join(" "),409);
  if(p.version!==preview.version)throw new AppError("Los registros cambiaron desde la revisión. Actualiza el resumen y vuelve a confirmar.",409);
  if(!preview.totalRecords)throw new AppError("Este administrador no tiene registros para eliminar.",409);
  for(const product of [...preview.stock].sort((a,b)=>a.id.localeCompare(b.id)))
    await c.query("UPDATE products SET stock=stock+$1 WHERE id=$2",[product.delta,product.id]);
  await c.query("DELETE FROM cash_handoffs WHERE user_id=$1",[p.id]);
  await c.query("DELETE FROM financing_payments WHERE user_id=$1",[p.id]);
  await c.query("DELETE FROM sale_items WHERE sale_id IN(SELECT id FROM sales WHERE user_id=$1)",[p.id]);
  await c.query("DELETE FROM sale_losses WHERE sale_id IN(SELECT id FROM sales WHERE user_id=$1)",[p.id]);
  await c.query("DELETE FROM sales WHERE user_id=$1",[p.id]);
  await c.query("DELETE FROM receipt_items WHERE receipt_id IN(SELECT id FROM receipts WHERE user_id=$1)",[p.id]);
  await c.query("DELETE FROM receipts WHERE user_id=$1",[p.id]);
  for(const table of ["expenses","treasury","bank_movements","cash_openings","google_exports","audit_log"])
    await c.query(`DELETE FROM ${table} WHERE user_id=$1`,[p.id]);
  return p.id;
}
