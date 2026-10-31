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
  if (action === "product") {
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
