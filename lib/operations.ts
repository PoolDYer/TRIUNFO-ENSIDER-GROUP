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
import { registerSale } from "./register-sale";
import { syncStockNotifications } from "./stock-notifications";
import {lockCashMovements,registerCashHandoff} from "./cash-handoffs";
import {deleteUserRecords} from "./user-records";
const detail = z.string().trim().min(1).max(500);
const id = z.string().uuid();
const base = { id, date: dateSchema };
function admin(u: User) {
  if (u.role !== "ADMIN")
    throw new AppError("Solo el dueño tiene acceso.", 403);
}
export async function operate(c: DB, u: User, action: string, input: unknown) {
  if (["receiptOrder", "receipt", "financingPayment", "userRecordsDelete"].includes(action)) admin(u);
  // El borrado de un administrador debe ser atómico frente a cualquier operación.
  await lockCashMovements(c);
  let entity = "";
  if(action === "userRecordsDelete") {
    entity=await deleteUserRecords(c,input);
  } else if(action === "cashHandoff") {
    const handoff=await registerCashHandoff(c,u,input);
    if(!handoff.created)return {ok:true,id:handoff.id};
    entity=handoff.id;
  } else if (action === "sale") {
    entity = await registerSale(c,u,input);
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
      throw new AppError("El dueño debe confirmar el precio unitario de compra antes de registrar la entrada.");
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
    if(action === "treasury" && p.kind === "DELIVERY")
      throw new AppError("Registra las entregas al dueño desde Movimientos de la caja para validar el efectivo y Yape disponibles.",409);
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
  } else if (action === "saleDelete") {
    const p = z.object({ id }).parse(input);
    const { rows: saleRows } = await c.query(
      "SELECT id, user_id FROM sales WHERE id=$1 FOR UPDATE",
      [p.id],
    );
    if (!saleRows.length) throw new AppError("La venta ya no existe.", 404);
    if (u.role !== "ADMIN" && saleRows[0].user_id !== u.id)
      throw new AppError(
        "Solo el dueño o quien registró la venta puede eliminarla.",
        403,
      );
    const { rows: itemRows } = await c.query(
      "SELECT product_id,sum(quantity)::int AS quantity FROM (SELECT product_id,quantity FROM sale_items WHERE sale_id=$1 UNION ALL SELECT product_id,quantity FROM sale_losses WHERE sale_id=$1) movements GROUP BY product_id ORDER BY product_id",
      [p.id],
    );
    for (const item of itemRows) {
      await c.query(
        "UPDATE products SET stock=stock+$1 WHERE id=$2",
        [item.quantity, item.product_id],
      );
    }
    await c.query("DELETE FROM sale_items WHERE sale_id=$1", [p.id]);
    await c.query("DELETE FROM sales WHERE id=$1", [p.id]);
    entity = p.id;
  } else if (action === "receiptDelete") {
    admin(u);
    const p = z.object({ id }).parse(input);
    const { rows: receiptRows } = await c.query(
      "SELECT id, product_id, quantity FROM receipts WHERE id=$1 FOR UPDATE",
      [p.id],
    );
    if (!receiptRows.length) throw new AppError("La entrada ya no existe.", 404);
    const receipt = receiptRows[0];
    const payments = await c.query("SELECT id FROM financing_payments WHERE receipt_id=$1 LIMIT 1",[p.id]);
    if (payments.rows.length) throw new AppError("No se puede eliminar una entrada con pagos de financiamiento registrados.",409);
    const lines = (await c.query("SELECT product_id,quantity FROM receipt_items WHERE receipt_id=$1 ORDER BY product_id",[p.id])).rows;
    for (const line of lines.length ? lines : [receipt]) {
      const { rows } = await c.query("UPDATE products SET stock=stock-$1 WHERE id=$2 AND stock >= $1 RETURNING id",[line.quantity,line.product_id]);
      if (!rows.length) throw new AppError("No se puede eliminar la entrada: el stock actual es menor a la cantidad ingresada. Parte de la mercadería ya fue vendida.",409);
    }
    await c.query("DELETE FROM receipts WHERE id=$1", [p.id]);
    entity = p.id;
  } else if (action === "expenseDelete") {
    admin(u);
    const p = z.object({ id }).parse(input);
    const { rows } = await c.query(
      "DELETE FROM expenses WHERE id=$1 RETURNING id",
      [p.id],
    );
    if (!rows.length) throw new AppError("El gasto ya no existe.", 404);
    entity = p.id;
  } else if (action === "treasuryDelete") {
    admin(u);
    const p = z.object({ id }).parse(input);
    if((await c.query("SELECT id FROM cash_handoffs WHERE treasury_id=$1",[p.id])).rows.length)
      throw new AppError("Esta salida pertenece a una entrega al dueño y se conserva en su historial.",409);
    const { rows } = await c.query(
      "DELETE FROM treasury WHERE id=$1 RETURNING id",
      [p.id],
    );
    if (!rows.length)
      throw new AppError("El movimiento de caja ya no existe.", 404);
    entity = p.id;
  } else if (action === "bankDelete") {
    admin(u);
    const p = z.object({ id }).parse(input);
    const { rows } = await c.query(
      "DELETE FROM bank_movements WHERE id=$1 RETURNING id",
      [p.id],
    );
    if (!rows.length)
      throw new AppError("El movimiento bancario ya no existe.", 404);
    entity = p.id;
  } else if (action === "openingDelete") {
    admin(u);
    const p = z.object({ date: dateSchema }).parse(input);
    const { rows } = await c.query(
      "DELETE FROM cash_openings WHERE date=$1 RETURNING date",
      [p.date],
    );
    if (!rows.length)
      throw new AppError("No existe apertura registrada para esta fecha.", 404);
    entity = p.date;
  } else if (action === "productDelete") {
    admin(u);
    const p = z.object({ id }).parse(input);
    const history = await c.query("SELECT 1 FROM sale_items WHERE product_id=$1 UNION ALL SELECT 1 FROM receipts WHERE product_id=$1 LIMIT 1", [p.id]);
    if (history.rows.length) throw new AppError("El producto tiene ventas o entradas registradas. Desactívalo para conservar su historial.",409);
    const losses = await c.query("SELECT 1 FROM sale_losses WHERE product_id=$1 LIMIT 1",[p.id]);
    if (losses.rows.length) throw new AppError("El producto tiene pérdidas registradas. Desactívalo para conservar su historial.",409);
    const order = await c.query("SELECT 1 FROM receipt_items WHERE product_id=$1 LIMIT 1",[p.id]);
    if (order.rows.length) throw new AppError("El producto pertenece a un pedido registrado. Desactívalo para conservar su historial.",409);
    const credits = await c.query("SELECT id FROM receipts WHERE product_id=$1 AND modality='CREDIT' LIMIT 1",[p.id]);
    if (credits.rows.length) throw new AppError("El producto tiene financiamientos. Desactívalo para conservar su historial.",409);
    await c.query("DELETE FROM sale_items WHERE product_id=$1", [p.id]);
    await c.query("DELETE FROM receipts WHERE product_id=$1", [p.id]);
    const { rows } = await c.query(
      "DELETE FROM products WHERE id=$1 RETURNING id",
      [p.id],
    );
    if (!rows.length) throw new AppError("El producto ya no existe.", 404);
    entity = p.id;
  } else if (action === "resetAllData") {
    admin(u);
    z.object({ confirm: z.literal(true) }).parse(input);
    await c.query("DELETE FROM cash_handoffs");
    await c.query("DELETE FROM financing_payments");
    await c.query("DELETE FROM sale_items");
    await c.query("DELETE FROM sales");
    await c.query("DELETE FROM receipts");
    await c.query("DELETE FROM expenses");
    await c.query("DELETE FROM treasury");
    await c.query("DELETE FROM bank_movements");
    await c.query("DELETE FROM cash_openings");
    await c.query("DELETE FROM google_exports");
    await c.query("DELETE FROM products");
    await c.query("DELETE FROM initial_reference");
    await c.query("DELETE FROM audit_log");
    await c.query("DELETE FROM sessions WHERE user_id != $1", [u.id]);
    entity = "all";
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
        "No se puede eliminar una cuenta de dueño.",
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
      throw new AppError("El administrador ya no existe.", 404);
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
      throw new AppError("El administrador ya no existe.", 404);
    await c.query("DELETE FROM sessions WHERE user_id=$1", [p.id]);
    entity = p.id;
  } else throw new AppError("Operación no reconocida.");
  await c.query(
    "INSERT INTO audit_log(id,user_id,action,entity_id) VALUES($1,$2,$3,$4)",
    [randomUUID(), u.id, action, entity],
  );
  await syncStockNotifications(c);
  return { ok: true, id: entity };
}
