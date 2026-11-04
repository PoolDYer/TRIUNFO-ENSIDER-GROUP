import { NextResponse } from "next/server";
import { z } from "zod";
import { transaction } from "@/lib/db";
import { AppError, checkOrigin, requireUser } from "@/lib/auth";
import { operate } from "@/lib/operations";
export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const u = await requireUser();
    const p = await req.json();
    if (p.action === "receipt") throw new AppError("Actualiza la página para usar el nuevo formulario de pedidos.",409);
    return NextResponse.json(
      await transaction((c) => operate(c, u, p.action, p.data)),
    );
  } catch (e) {
    if (e instanceof z.ZodError)
      return NextResponse.json({ error: e.issues[0].message }, { status: 400 });
    if (e instanceof AppError)
      return NextResponse.json({ error: e.message }, { status: e.status });
    if ((e as { code?: string }).code === "23505")
      return NextResponse.json(
        {
          error:
            "El código, correo u operación ya existe. Actualiza la página para verificar el registro.",
        },
        { status: 409 },
      );
    console.error(
      "Operation error",
      e instanceof Error ? e.message : "unknown",
    );
    return NextResponse.json(
      {
        error:
          "No se pudo guardar. Actualiza y verifica los datos antes de reintentar.",
      },
      { status: 500 },
    );
  }
}
