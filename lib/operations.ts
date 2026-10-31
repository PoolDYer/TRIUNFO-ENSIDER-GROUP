import { randomUUID } from "node:crypto";
import { z } from "zod";
import { DB } from "./db";
import { AppError, User } from "./auth";
import {
  cents,
  dateSchema,
  emailSchema,
  moneySchema,
  passwordSchema,
  positiveMoney,
  quantitySchema,
} from "./validation";
import { hashPassword } from "./password";
const detail = z.string().trim().min(1).max(500);
const id = z.string().uuid();
const base = { id, date: dateSchema };
function admin(u: User) {
  if (u.role !== "ADMIN")
    throw new AppError("Solo el administrador tiene acceso.", 403);
}
export async function operate(c: DB, u: User, action: string, input: unknown) {
  let entity = "";
  if (action === "sale") {
    const p = z
      .object({
        ...base,
        detail: z.string().trim().max(500).default(""),
        items: z
          .array(
            z.object({
              productId: id,
              quantity: quantitySchema,
              unitPrice: moneySchema,
            }),
          )
          .min(1)
          .max(50),
        digital: moneySchema,
        debt: moneySchema,
        method: z.enum(["YAPE", "TRANSFER", "NONE"]),
        reference: z.string().trim().max(120),
      })
      .parse(input);
    if (new Set(p.items.map((i) => i.productId)).size !== p.items.length)
      throw new AppError(
        "Agrupa las cantidades de cada producto en una sola línea.",
      );
    const total = p.items.reduce(
      (s, i) => s + cents(i.unitPrice) * i.quantity,
      0,
    );
    const digital = cents(p.digital),
      debt = cents(p.debt),
      cash = total - digital - debt;
    if (!Number.isSafeInteger(total) || total <= 0 || cash < 0)
      throw new AppError(
        "Revisa los importes: los pagos y deudas no pueden superar la facturación ni los límites de precisión.",
      );
    if (digital > 0 && (p.method === "NONE" || !p.reference))
      throw new AppError("Indica el medio digital y su código de operación.");
    if (debt > 0 && !p.detail)
      throw new AppError(
        "Indica el motivo o cliente de la deuda en el detalle.",
      );
    await c.query(
      "INSERT INTO sales(id,date,detail,cash,digital,debt,method,reference,total,user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
      [
        p.id,
        p.date,
        p.detail,
        cash,
        digital,
        debt,
        digital ? p.method : "NONE",
        p.reference,
        total,
        u.id,
      ],
    );
    // Stable lock order prevents deadlocks when two sellers sell the same products.
    for (const i of [...p.items].sort((a, b) =>
      a.productId.localeCompare(b.productId),
    )) {
      const { rows } = await c.query(
        "UPDATE products SET stock=stock-$1 WHERE id=$2 AND active=true AND stock >= $1 RETURNING code,name,purchase_price",
        [i.quantity, i.productId],
      );
      if (!rows[0])
        throw new AppError(
          "Stock insuficiente o producto desactivado. Actualiza los productos e inténtalo otra vez.",
          409,
        );
      await c.query(
        "INSERT INTO sale_items(id,sale_id,product_id,code,name,quantity,unit_price,purchase_price) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          randomUUID(),
          p.id,
          i.productId,
          rows[0].code,
          rows[0].name,
          i.quantity,
          cents(i.unitPrice),
          rows[0].purchase_price,
        ],
      );
    }
    entity = p.id;
  } else if (action === "product") {
    admin(u);
    const p = z
      .object({
        id,
        code: z.string().trim().min(1).max(30),
        name: detail,
        salePrice: moneySchema,
        purchasePrice: moneySchema.nullable(),
        minStock: z.coerce.number().int().min(0).max(1000000),
        stock: z.coerce.number().int().min(0).max(1000000).optional(),
      })
      .parse(input);
    const existing = await c.query("SELECT id FROM products WHERE id=$1", [
      p.id,
    ]);
    if (existing.rows.length)
      await c.query(
        "UPDATE products SET code=$2,name=$3,sale_price=$4,purchase_price=$5,min_stock=$6 WHERE id=$1",
        [
          p.id,
          p.code,
          p.name,
          cents(p.salePrice),
          p.purchasePrice === null ? null : cents(p.purchasePrice),
          p.minStock,
        ],
      );
    else
      await c.query(
        "INSERT INTO products(id,code,name,sale_price,purchase_price,min_stock,stock) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [
          p.id,
          p.code,
          p.name,
          cents(p.salePrice),
          p.purchasePrice === null ? null : cents(p.purchasePrice),
          p.minStock,
          p.stock ?? 0,
        ],
      );
    entity = p.id;
  } else if (action === "productStatus") {
    admin(u);
    const p = z.object({ id, active: z.boolean() }).parse(input);
    await c.query("UPDATE products SET active=$2 WHERE id=$1", [
      p.id,
      p.active,
    ]);
    entity = p.id;
  } else throw new AppError("Operación no reconocida.");
  await c.query(
    "INSERT INTO audit_log(id,user_id,action,entity_id) VALUES($1,$2,$3,$4)",
    [randomUUID(), u.id, action, entity],
  );
  return { ok: true, id: entity };
}
