import { z } from "zod";
import { AppError, type User } from "./auth";
import type { DB } from "./db";
import { receiptInterestBps, receiptSupplier } from "./receipt-order-values";
import { cents, dateSchema, moneySchema, quantitySchema } from "./validation";

const orderSchema = z.object({
  id: z.string().uuid(),
  date: dateSchema,
  modality: z.enum(["CASH", "CREDIT"]),
  expectedOrderCost: moneySchema,
  items: z
    .array(z.object({ productId: z.string().uuid(), quantity: quantitySchema }))
    .min(1, "Selecciona al menos un producto.")
    .max(50),
});

export async function registerReceiptOrder(c: DB, u: User, input: unknown) {
  const order = orderSchema.parse(input);
  if (new Set(order.items.map((i) => i.productId)).size !== order.items.length)
    throw new AppError(
      "Agrupa las cantidades de cada producto en una sola línea.",
    );
  const lines = [];
  let total = 0;
  let quantity = 0;
  for (const item of [...order.items].sort((a, b) =>
    a.productId.localeCompare(b.productId),
  )) {
    const { rows } = await c.query(
      "SELECT code,name,purchase_price FROM products WHERE id=$1 AND active=true FOR UPDATE",
      [item.productId],
    );
    const p = rows[0];
    if (!p)
      throw new AppError("Uno de los productos ya no está disponible.", 409);
    if (p.purchase_price == null)
      throw new AppError(
        `Confirma el precio de compra de ${p.name} antes de guardar.`,
      );
    const price = Number(p.purchase_price);
    total += price * item.quantity;
    quantity += item.quantity;
    lines.push({ ...item, code: p.code, name: p.name, price });
  }
  if (!Number.isSafeInteger(total) || total > 1_000_000_000)
    throw new AppError("El total del pedido supera S/ 10 000 000.");
  if (total !== cents(order.expectedOrderCost))
    throw new AppError(
      "El precio de compra cambió. Actualiza los datos y revisa el total.",
      409,
    );
  const credit = order.modality === "CREDIT";
  if (credit && total <= 0)
    throw new AppError("El pedido a crédito debe tener un monto mayor a cero.");
  // The legacy product reference remains for older queries; receipt_items records the full order.
  await c.query(
    `INSERT INTO receipts(id,date,product_id,quantity,supplier,order_cost,modality,paid,user_id,credit_principal,interest_bps)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      order.id,
      order.date,
      lines[0].productId,
      quantity,
      receiptSupplier,
      total,
      order.modality,
      credit ? 0 : total,
      u.id,
      credit ? total : null,
      credit ? receiptInterestBps : 0,
    ],
  );
  for (const line of lines) {
    await c.query(
      "INSERT INTO receipt_items(receipt_id,product_id,code,name,quantity,unit_purchase_price) VALUES($1,$2,$3,$4,$5,$6)",
      [
        order.id,
        line.productId,
        line.code,
        line.name,
        line.quantity,
        line.price,
      ],
    );
    await c.query("UPDATE products SET stock=stock+$1 WHERE id=$2", [
      line.quantity,
      line.productId,
    ]);
  }
  return order.id;
}
