import { NextResponse } from "next/server";
import { db, transaction } from "@/lib/db";
import { AppError, requireUser } from "@/lib/auth";
import { dateSchema, periodRange, today } from "@/lib/validation";
import { report } from "@/lib/reports";
const options = { headers: { "Cache-Control": "private, no-store" } };
export const runtime = "nodejs";
export async function GET(req: Request) {
  try {
    const u = await requireUser();
    const url = new URL(req.url);
    const view = url.searchParams.get("view") ?? "overview";
    const date = dateSchema.parse(url.searchParams.get("date") ?? today());
    const period = url.searchParams.get("period") ?? "day";
    if (!["day", "week", "month"].includes(period))
      throw new AppError("Período inválido.");
    const { start, end } = periodRange(date, period);
    if (view === "products") {
      if (u.role !== "ADMIN")
        throw new AppError(
          "Solo el administrador tiene acceso a la lista de productos.",
          403,
        );
      const products = await db.query("SELECT * FROM products ORDER BY code");
      return NextResponse.json({ products: products.rows }, options);
    }
    
    
    const summary = await transaction(async (c) => {
      await c.query(
        "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY",
      );
      return report(c, start, end, period);
    });
    
    const products = (
      await db.query(
        "SELECT id,code,name,stock,sale_price,min_stock FROM products WHERE active=true ORDER BY code",
      )
    ).rows;
    const sales = (
      await db.query(
        `SELECT s.*,u.name AS user_name, (SELECT json_agg(json_build_object('name',i.name,'quantity',i.quantity,'unit_price',i.unit_price)) FROM sale_items i WHERE i.sale_id=s.id) AS items FROM sales s JOIN users u ON u.id=s.user_id WHERE s.date BETWEEN $1 AND $2 ORDER BY s.created_at DESC LIMIT 200`,
        [start, end],
      )
    ).rows;
    const expenses = (
      await db.query(
        "SELECT e.*,u.name AS user_name FROM expenses e JOIN users u ON u.id=e.user_id WHERE date BETWEEN $1 AND $2 ORDER BY created_at DESC LIMIT 200",
        [start, end],
      )
    ).rows;
    const bank = (
      await db.query(
        "SELECT b.*,u.name AS user_name FROM bank_movements b JOIN users u ON u.id=b.user_id WHERE date BETWEEN $1 AND $2 ORDER BY created_at DESC LIMIT 200",
        [start, end],
      )
    ).rows;
    const treasury = (
      await db.query(
        "SELECT t.*,u.name AS user_name FROM treasury t JOIN users u ON u.id=t.user_id WHERE date BETWEEN $1 AND $2 ORDER BY created_at DESC LIMIT 200",
        [start, end],
      )
    ).rows;
    const receipts = (
      await db.query(
        "SELECT r.*,p.name,p.code,u.name AS user_name FROM receipts r JOIN products p ON p.id=r.product_id JOIN users u ON u.id=r.user_id WHERE date BETWEEN $1 AND $2 ORDER BY r.created_at DESC LIMIT 200",
        [start, end],
      )
    ).rows;
    const bankWeeks = (
      await db.query(
        "SELECT date_trunc('week',date)::date::text AS week, sum(CASE WHEN kind='INCOME' THEN amount ELSE 0 END) AS income,sum(CASE WHEN kind='WITHDRAWAL' THEN amount ELSE 0 END) AS withdrawals,sum(sum(CASE WHEN kind='INCOME' THEN amount ELSE -amount END)) OVER(ORDER BY date_trunc('week',date)) AS accumulated FROM bank_movements WHERE date <= $1 GROUP BY date_trunc('week',date) ORDER BY week DESC LIMIT 52",
        [end],
      )
    ).rows;
    return NextResponse.json(
      {
        summary,
        products,
        sales,
        expenses,
        bank,
        treasury,
        receipts,
        bankWeeks,
      },
      options,
    );
  } catch (e) {
    if (e instanceof AppError)
      return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json(
      {
        error:
          "No se pudieron cargar los datos. Verifica la fecha y la conexión.",
      },
      { status: 503 },
    );
  }
}
