import type { DB } from "./db";

// Basis points and integer cents: a single charge, never compounded.
export function financingInterest(principal: number, rateBps: number) {
  return Math.round((principal * rateBps) / 10000);
}

export async function financingReport(c: DB) {
  const ledger = `SELECT r.id,r.date::text,r.supplier,p.code,p.name,
    r.credit_principal,r.interest_bps,
    r.credit_principal + round(r.credit_principal::numeric*r.interest_bps/10000)::bigint AS total,
    COALESCE((SELECT sum(f.amount) FROM financing_payments f WHERE f.receipt_id=r.id),0) AS paid
    FROM receipts r JOIN products p ON p.id=r.product_id
    WHERE r.modality='CREDIT'`;
  const credits = (
    await c.query(ledger + " ORDER BY r.date DESC,r.created_at DESC")
  ).rows;
  const payments = (
    await c.query(
      `SELECT f.id,f.date::text,f.amount,f.detail,r.id AS receipt_id,
    r.date::text AS credit_date,r.supplier,p.name,u.name AS user_name,
    r.credit_principal + round(r.credit_principal::numeric*r.interest_bps/10000)::bigint AS debt_total,
    (SELECT COALESCE(sum(a.amount),0) FROM financing_payments a WHERE a.receipt_id=r.id) AS paid_total
    FROM financing_payments f JOIN receipts r ON r.id=f.receipt_id
    JOIN products p ON p.id=r.product_id JOIN users u ON u.id=f.user_id
    ORDER BY f.date DESC,f.created_at DESC`,
    )
  ).rows;
  const payable = credits.filter((r) => Number(r.total) > Number(r.paid));
  return { credits, payments, payable };
}
