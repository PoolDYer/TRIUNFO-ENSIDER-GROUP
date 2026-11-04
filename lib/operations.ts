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
import { financingInterest } from "./financing";
import { registerReceiptOrder } from "./receipt-order";
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
  } else if (action === "receiptOrder") {
    entity = await registerReceiptOrder(c,u,input);
  } else if (action === "receipt") {
    const p = z
      .object({
        ...base,
        productId: id,
        quantity: quantitySchema,
        supplier: detail,
        expectedOrderCost: moneySchema.optional(),
        modality: z.enum(["CASH", "CREDIT"]),
        creditPrincipal: positiveMoney.optional(),
        interestPercent: moneySchema.refine(v => v <= 100, "El interés debe estar entre 0 y 100 %").default(2),
      })
      .parse(input);
    if (p.modality === "CREDIT" && p.creditPrincipal === undefined)
      throw new AppError("Indica el monto a crédito.");
    const product = await c.query("SELECT purchase_price FROM products WHERE id=$1 AND active=true FOR UPDATE", [p.productId]);
    if (!product.rows.length) throw new AppError("Producto no disponible.");
    if (product.rows[0].purchase_price === null)
      throw new AppError("El administrador debe confirmar el precio unitario de compra antes de registrar la entrada.");
    const orderCost = Number(product.rows[0].purchase_price) * p.quantity;
    if (!Number.isSafeInteger(orderCost) || orderCost < 0 || orderCost > 1000000000)
      throw new AppError("El costo calculado supera el máximo de S/ 10 000 000 por entrada.");
    if (p.expectedOrderCost !== undefined && cents(p.expectedOrderCost) !== orderCost)
      throw new AppError("El precio de compra cambió. Actualiza los productos y registra la entrada con el nuevo costo.",409);
    const principal = p.modality === "CREDIT" ? cents(p.creditPrincipal!) : 0;
    if (principal > orderCost) throw new AppError("El monto a crédito no puede superar el costo del pedido.");
    const paid = orderCost - principal;
    const r = await c.query(
      "UPDATE products SET stock=stock+$1 WHERE id=$2 AND active=true RETURNING id",
      [p.quantity, p.productId],
    );
    if (!r.rows.length) throw new AppError("Producto no disponible.");
    await c.query(
      "INSERT INTO receipts(id,date,product_id,quantity,supplier,order_cost,modality,paid,user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [
        p.id,
        p.date,
        p.productId,
        p.quantity,
        p.supplier,
        orderCost,
        p.modality,
        paid,
        u.id,
      ],
    );
    if (p.modality === "CREDIT")
      await c.query("UPDATE receipts SET credit_principal=$2,interest_bps=$3 WHERE id=$1",
        [p.id,cents(p.creditPrincipal!),cents(p.interestPercent)]);
    entity = p.id;
  } else if (action === "financingPayment") {
    const p = z.object({ ...base, receiptId: id, amount: positiveMoney,
      detail: z.string().trim().max(500).default("") }).parse(input);
    const { rows } = await c.query("SELECT date::text,credit_principal,interest_bps FROM receipts WHERE id=$1 AND modality='CREDIT' FOR UPDATE", [p.receiptId]);
    if (!rows.length) throw new AppError("El financiamiento no existe.",404);
    const credit = rows[0];
    if (p.date < credit.date) throw new AppError("El pago no puede ser anterior al crédito.");
    const paid = await c.query("SELECT COALESCE(sum(amount),0) AS paid FROM financing_payments WHERE receipt_id=$1",[p.receiptId]);
    const principal = Number(credit.credit_principal);
    const total = principal + financingInterest(principal, Number(credit.interest_bps));
    if (cents(p.amount) > total - Number(paid.rows[0].paid))
      throw new AppError("El pago supera la deuda restante. Actualiza los datos.",409);
    await c.query("INSERT INTO financing_payments(id,receipt_id,date,amount,detail,user_id) VALUES($1,$2,$3,$4,$5,$6)",
      [p.id,p.receiptId,p.date,cents(p.amount),p.detail,u.id]);
    entity = p.id;
  } else if (
    action === "expense" ||
    action === "treasury" ||
    action === "bank"
  ) {
    const kinds =
      action === "expense"
        ? ["OPERATING", "FIXED"]
        : action === "treasury"
          ? ["DEBT", "DEPOSIT", "DELIVERY"]
          : ["INCOME", "WITHDRAWAL"];
    const p = z
      .object({ ...base, kind: z.string(), detail, amount: positiveMoney })
      .parse(input);
    if (!kinds.includes(p.kind))
      throw new AppError("Tipo de movimiento inválido.");
    if (action === "bank" && p.kind === "INCOME") admin(u);
    const table =
      action === "expense"
        ? "expenses"
        : action === "treasury"
          ? "treasury"
          : "bank_movements";
    await c.query(
      `INSERT INTO ${table}(id,date,kind,detail,amount,user_id) VALUES($1,$2,$3,$4,$5,$6)`,
      [p.id, p.date, p.kind, p.detail, cents(p.amount), u.id],
    );
    entity = p.id;
  } else if (action === "opening") {
    const p = z.object({ date: dateSchema, amount: moneySchema }).parse(input);
    // A unique opening per business day avoids counting each seller's opening again.
    try {
      await c.query(
        "INSERT INTO cash_openings(date,amount,user_id) VALUES($1,$2,$3)",
        [p.date, cents(p.amount), u.id],
      );
    } catch (e) {
      if ((e as { code?: string }).code === "23505")
        throw new AppError("Ya se registró la apertura de esta fecha.", 409);
      throw e;
    }
    entity = p.date;
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
  } else if (action === "user") {
    admin(u);
    const p = z
      .object({ name: detail, email: emailSchema, password: passwordSchema })
      .parse(input);
    await c.query("LOCK TABLE users IN EXCLUSIVE MODE");
    const { rows } = await c.query(
      "SELECT count(*)::int AS count FROM users WHERE deleted_at IS NULL",
    );
    if (rows[0].count >= 10)
      throw new AppError("Se alcanzó el máximo de 10 usuarios.");
    entity = randomUUID();
    await c.query(
      "INSERT INTO users(id,name,email,password_hash,role) VALUES($1,$2,$3,$4,'SELLER')",
      [entity, p.name, p.email, await hashPassword(p.password)],
    );
  } else if (action === "userDelete") {
    admin(u);
    const p = z.object({ id }).parse(input);
    if (p.id === u.id)
      throw new AppError("No puedes eliminar tu propia cuenta.");
    // Serialize deletion with account creation so the capacity remains consistent.
    await c.query("LOCK TABLE users IN EXCLUSIVE MODE");
    const { rows } = await c.query(
      "SELECT id,role FROM users WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",
      [p.id],
    );
    if (!rows.length) throw new AppError("El usuario ya no existe.", 404);
    if (rows[0].role !== "SELLER")
      throw new AppError(
        "No se puede eliminar una cuenta de administrador.",
        403,
      );
    await c.query(
      "UPDATE users SET active=false,deleted_at=now() WHERE id=$1",
      [p.id],
    );
    await c.query("DELETE FROM sessions WHERE user_id=$1", [p.id]);
    entity = p.id;
  } else if (action === "userStatus") {
    admin(u);
    const p = z.object({ id, active: z.boolean() }).parse(input);
    if (p.id === u.id)
      throw new AppError("No puedes desactivar tu propia cuenta.");
    const result = await c.query(
      "UPDATE users SET active=$2 WHERE id=$1 AND role='SELLER' AND deleted_at IS NULL RETURNING id",
      [p.id, p.active],
    );
    if (!result.rows.length)
      throw new AppError("El vendedor ya no existe.", 404);
    await c.query("DELETE FROM sessions WHERE user_id=$1", [p.id]);
    entity = p.id;
  } else if (action === "resetPassword") {
    admin(u);
    const p = z.object({ id, password: passwordSchema }).parse(input);
    if (p.id === u.id)
      throw new AppError("Usa Cambiar contraseña para tu propia cuenta.");
    const result = await c.query(
      "UPDATE users SET password_hash=$2,must_change_password=true WHERE id=$1 AND role='SELLER' AND deleted_at IS NULL RETURNING id",
      [p.id, await hashPassword(p.password)],
    );
    if (!result.rows.length)
      throw new AppError("El vendedor ya no existe.", 404);
    await c.query("DELETE FROM sessions WHERE user_id=$1", [p.id]);
    entity = p.id;
  } else throw new AppError("Operación no reconocida.");
  await c.query(
    "INSERT INTO audit_log(id,user_id,action,entity_id) VALUES($1,$2,$3,$4)",
    [randomUUID(), u.id, action, entity],
  );
  return { ok: true, id: entity };
}
