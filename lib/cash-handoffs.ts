import {randomUUID} from "node:crypto";
import {z} from "zod";
import {AppError, type User} from "./auth";
import type {DB} from "./db";
import {cents,moneySchema,today} from "./validation";

/** Todas las escrituras que alteran los saldos de caja usan el mismo bloqueo. */
export async function lockCashMovements(c:DB) {
  await c.query("INSERT INTO cash_movement_guard(id) VALUES(1) ON CONFLICT DO NOTHING");
  await c.query("SELECT id FROM cash_movement_guard WHERE id=1 FOR UPDATE");
}

export async function cashHandoffBalances(c:DB,cutoff=today()) {
  const {rows}=await c.query(`SELECT
    (SELECT COALESCE(sum(amount),0) FROM cash_openings WHERE date <= $1) AS opening,
    (SELECT COALESCE(sum(cash),0) FROM sales WHERE date <= $1) AS cash_received,
    (SELECT COALESCE(sum(amount),0) FROM expenses WHERE date <= $1) AS expenses,
    (SELECT COALESCE(sum(amount) FILTER(WHERE kind='DELIVERY'),0) FROM treasury WHERE date <= $1) AS cash_delivered,
    (SELECT COALESCE(sum(amount) FILTER(WHERE kind IN('DEBT','DEPOSIT')),0) FROM treasury WHERE date <= $1) AS cash_other_out,
    (SELECT COALESCE(sum(digital),0) FROM sales WHERE date <= $1 AND method='YAPE') AS yape_registered,
    (SELECT COALESCE(sum(yape_amount),0) FROM cash_handoffs WHERE date <= $1) AS yape_delivered`,[cutoff]);
  const r=rows[0];
  const opening=Number(r.opening),cashReceived=Number(r.cash_received),expenses=Number(r.expenses),
    cashDelivered=Number(r.cash_delivered),cashOtherOut=Number(r.cash_other_out),
    yapeRegistered=Number(r.yape_registered),yapeDelivered=Number(r.yape_delivered);
  const cashBase=opening+cashReceived-expenses-cashOtherOut;
  const cashRemaining=cashBase-cashDelivered,yapeRemaining=yapeRegistered-yapeDelivered;
  return {cutoff,opening,cashReceived,expenses,cashOtherOut,cashBase,cashDelivered,cashRemaining,
    cashAvailable:Math.max(0,cashRemaining),yapeRegistered,yapeDelivered,yapeRemaining,
    yapeAvailable:Math.max(0,yapeRemaining)};
}

const handoffSchema=z.object({
  id:z.string().uuid(),cashAmount:moneySchema,yapeAmount:moneySchema,
  expectedCashAvailable:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  expectedYapeAvailable:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  detail:z.string().trim().max(500).default(""),
}).refine(p=>p.cashAmount>0||p.yapeAmount>0,{message:"Ingresa un monto físico o un monto de Yape mayor a cero."});

/** El llamador abre una transacción y obtiene lockCashMovements antes de entrar. */
export async function registerCashHandoff(c:DB,user:User,input:unknown) {
  const p=handoffSchema.parse(input);
  const cash=cents(p.cashAmount),yape=cents(p.yapeAmount);
  const previous=(await c.query("SELECT id,user_id,cash_amount,yape_amount,detail FROM cash_handoffs WHERE id=$1",[p.id])).rows[0];
  if(previous){
    if(previous.user_id!==user.id||Number(previous.cash_amount)!==cash||Number(previous.yape_amount)!==yape||previous.detail!==p.detail)
      throw new AppError("El identificador de entrega ya corresponde a otro registro.",409);
    return {id:p.id,created:false};
  }
  const b=await cashHandoffBalances(c);
  if(cash>b.cashAvailable)throw new AppError("El monto físico supera el saldo de caja pendiente de entregar.",409);
  if(yape>b.yapeAvailable)throw new AppError("El monto de Yape supera el total de Yape pendiente de entregar.",409);
  if(p.expectedCashAvailable!==b.cashAvailable||p.expectedYapeAvailable!==b.yapeAvailable)
    throw new AppError("Los saldos cambiaron. Actualiza los movimientos de la caja antes de guardar.",409);
  const treasuryId=cash>0?randomUUID():null;
  if(treasuryId)await c.query("INSERT INTO treasury(id,date,kind,detail,amount,user_id) VALUES($1,$2,'DELIVERY',$3,$4,$5)",
    [treasuryId,b.cutoff,"Entrega al dueño"+(p.detail?": "+p.detail:""),cash,user.id]);
  await c.query(`INSERT INTO cash_handoffs(id,date,cash_amount,yape_amount,cash_available_before,yape_available_before,treasury_id,detail,user_id)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[p.id,b.cutoff,cash,yape,b.cashAvailable,b.yapeAvailable,treasuryId,p.detail,user.id]);
  return {id:p.id,created:true};
}

export async function cashHandoffReport(c:DB,page=1) {
  const balances=await cashHandoffBalances(c);
  const historySql=`SELECT h.id,h.date::text,h.created_at,h.cash_amount,h.yape_amount,
    h.cash_available_before,h.yape_available_before,h.detail,u.name AS user_name,false AS legacy
    FROM cash_handoffs h JOIN users u ON u.id=h.user_id
    UNION ALL
    SELECT t.id,t.date::text,t.created_at,t.amount AS cash_amount,0::bigint AS yape_amount,
    NULL::bigint AS cash_available_before,NULL::bigint AS yape_available_before,t.detail,u.name AS user_name,true AS legacy
    FROM treasury t JOIN users u ON u.id=t.user_id WHERE t.kind='DELIVERY'
    AND NOT EXISTS(SELECT 1 FROM cash_handoffs h WHERE h.treasury_id=t.id)`;
  const total=Number((await c.query(`SELECT count(*) AS total FROM (${historySql}) history`)).rows[0].total);
  const pageSize=50;
  const history=(await c.query(`SELECT * FROM (${historySql}) history ORDER BY created_at DESC,id DESC LIMIT $1 OFFSET $2`,[pageSize,(page-1)*pageSize])).rows;
  return {balances,history,page,pageSize,total,pages:Math.max(1,Math.ceil(total/pageSize))};
}
