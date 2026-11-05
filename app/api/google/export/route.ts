import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError, checkOrigin, requireUser } from "@/lib/auth";
import { db, transaction } from "@/lib/db";
import { dateSchema } from "@/lib/validation";
import { googleStatus } from "@/lib/google-sheets";
import { exportGoogleReport } from "@/lib/google-exports";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const user = await requireUser();
    const input = z
      .object({
        id: z.string().uuid(),
        date: dateSchema,
        period: z.enum(["day", "week", "month"]),
      })
      .parse(await req.json());
    const status = await googleStatus(db);
    if (!status.connected)
      throw new AppError(
        status.configured
          ? "El dueño debe conectar Google Sheets antes de generar enlaces."
          : "Falta configurar la conexión con Google Sheets. El dueño tiene las instrucciones en la ayuda.",
        409,
      );
    return NextResponse.json(
      await exportGoogleReport(db, transaction, user, input),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json(
        { error: error.issues[0].message },
        { status: 400 },
      );
    return NextResponse.json(
      {
        error:
          error instanceof AppError
            ? error.message
            : "No se pudo confirmar la creación del reporte en Google. Revisa la conexión antes de iniciar otra solicitud.",
      },
      { status: error instanceof AppError ? error.status : 502 },
    );
  }
}
