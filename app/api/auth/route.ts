import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { db, transaction } from "@/lib/db";
import { AppError, checkOrigin, requireUser } from "@/lib/auth";
import { hashPassword, tokenHash, verifyPassword } from "@/lib/password";
import { emailSchema, passwordSchema } from "@/lib/validation";
export const runtime = "nodejs";
const dummy =
  "00000000000000000000000000000000:00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const p = await req.json();
    const jar = await cookies();
    if (p.action === "logout") {
      const token = jar.get("triunfo_session")?.value;
      if (token)
        await db.query("DELETE FROM sessions WHERE token_hash=$1", [
          tokenHash(token),
        ]);
      jar.delete("triunfo_session");
      return NextResponse.json({ ok: true });
    }
    if (p.action === "password") {
      const u = await requireUser(false, true);
      const v = z
        .object({ current: z.string().max(128), password: passwordSchema })
        .parse(p);
      const { rows } = await db.query(
        "SELECT password_hash FROM users WHERE id=$1",
        [u.id],
      );
      if (!(await verifyPassword(v.current, rows[0].password_hash)))
        throw new AppError("La contraseña actual no es correcta.");
      if (v.current === v.password)
        throw new AppError("Elige una contraseña distinta a la temporal.");
      await transaction(async (c) => {
        await c.query(
          "UPDATE users SET password_hash=$2,must_change_password=false WHERE id=$1",
          [u.id, await hashPassword(v.password)],
        );
        await c.query("DELETE FROM sessions WHERE user_id=$1", [u.id]);
        await c.query(
          "INSERT INTO audit_log(id,user_id,action,entity_id) VALUES($1,$2,$3,$4)",
          [randomUUID(), u.id, "password", u.id],
        );
      });
      jar.delete("triunfo_session");
      return NextResponse.json({ ok: true });
    }
    const v = z
      .object({ email: emailSchema, password: z.string().min(1).max(128) })
      .parse(p);
    const key = tokenHash(v.email);
    const attempt = await db.query(
      `INSERT INTO login_attempts(key,attempts) VALUES($1,1) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN login_attempts.window_start<now()-interval '15 minutes' THEN 1 ELSE login_attempts.attempts+1 END,window_start=CASE WHEN login_attempts.window_start<now()-interval '15 minutes' THEN now() ELSE login_attempts.window_start END RETURNING attempts`,
      [key],
    );
    if (attempt.rows[0].attempts > 10)
      throw new AppError(
        "Demasiados intentos. Espera 15 minutos e inténtalo otra vez.",
        429,
      );
    const { rows } = await db.query("SELECT * FROM users WHERE email=$1", [
      v.email,
    ]);
    const u = rows[0];
    const valid = await verifyPassword(v.password, u?.password_hash ?? dummy);
    if (!u || !valid || !u.active)
      throw new AppError("Correo o contraseña incorrectos.", 401);
    const token = randomBytes(32).toString("hex");
    await transaction(async (c) => {
      await c.query("DELETE FROM login_attempts WHERE key=$1", [key]);
      await c.query("DELETE FROM sessions WHERE expires_at<now()");
      await c.query(
        "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '8 hours')",
        [tokenHash(token), u.id],
      );
    });
    jar.set("triunfo_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 8 * 60 * 60,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError)
      return NextResponse.json({ error: e.issues[0].message }, { status: 400 });
    if (e instanceof AppError)
      return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("Auth error", e instanceof Error ? e.message : "unknown");
    return NextResponse.json(
      {
        error:
          "No se pudo conectar al sistema. Revisa la configuración de la base de datos.",
      },
      { status: 503 },
    );
  }
}
