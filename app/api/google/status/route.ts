import { NextResponse } from "next/server";
import { requireUser, AppError } from "@/lib/auth";
import { db } from "@/lib/db";
import { googleStatus } from "@/lib/google-sheets";
export const runtime = "nodejs";
export async function GET() {
  try {
    await requireUser();
    return NextResponse.json(await googleStatus(db), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof AppError
            ? error.message
            : "No se pudo consultar la conexión con Google.",
      },
      { status: error instanceof AppError ? error.status : 503 },
    );
  }
}
