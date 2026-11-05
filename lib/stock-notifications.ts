import {randomUUID} from "node:crypto";
import type {DB} from "./db";

export async function syncStockNotifications(c:DB) {
  // Resolve a low-stock episode after replenishment or deactivation. Retain its history.
  await c.query(`UPDATE stock_notifications n SET resolved_at=now()
    WHERE n.resolved_at IS NULL AND (n.product_id IS NULL OR EXISTS (
      SELECT 1 FROM products p WHERE p.id=n.product_id AND (NOT p.active OR p.stock>=p.min_stock)))`);
  const {rows}=await c.query(`SELECT p.id,p.code,p.name,p.stock,p.min_stock FROM products p
    WHERE p.active AND p.stock<p.min_stock
    AND NOT EXISTS(SELECT 1 FROM stock_notifications n WHERE n.product_id=p.id AND n.resolved_at IS NULL)
    ORDER BY p.id`);
  for(const p of rows) await c.query(`INSERT INTO stock_notifications(id,product_id,code,name,stock,min_stock)
    VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,[randomUUID(),p.id,p.code,p.name,p.stock,p.min_stock]);
}

export async function stockNotificationHistory(c:DB) {
  await syncStockNotifications(c);
  const {rows}=await c.query(`SELECT n.id,n.code,n.name,n.stock,n.min_stock,
    n.created_at,n.resolved_at,n.read_at,p.stock AS current_stock
    FROM stock_notifications n LEFT JOIN products p ON p.id=n.product_id
    ORDER BY n.created_at DESC,n.id DESC LIMIT 100`);
  const counts=(await c.query("SELECT count(*) FILTER(WHERE read_at IS NULL)::int AS unread, count(*) FILTER(WHERE resolved_at IS NULL)::int AS active FROM stock_notifications")).rows[0];
  return {notifications:rows,unread:Number(counts.unread),active:Number(counts.active)};
}
