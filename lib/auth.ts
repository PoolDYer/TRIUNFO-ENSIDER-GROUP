import { cookies } from "next/headers";
import { db } from "./db";
import { tokenHash } from "./password";
export type User = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "SELLER";
  must_change_password: boolean;
};
export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get("triunfo_session")?.value;
  if (!token) return null;
  const { rows } = await db.query(
    `SELECT u.id,u.name,u.email,u.role,u.must_change_password FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.active=true AND u.deleted_at IS NULL`,
    [tokenHash(token)],
  );
  return rows[0] ?? null;
}
export async function requireUser(admin = false, allowPasswordChange = false) {
  const u = await currentUser();
  if (!u) throw new AppError("Inicia sesión para continuar.", 401);
  if (admin && u.role !== "ADMIN")
    throw new AppError("Solo el administrador tiene acceso.", 403);
  if (!allowPasswordChange && u.must_change_password)
    throw new AppError("Cambia tu contraseña temporal para continuar.", 403);
  return u;
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  // Next/Vercel may normalize request.url to an internal hostname behind a proxy.
  // The browser's Origin must match the actual request Host (or configured origin).
  let valid = false;
  try {
    const url = new URL(origin ?? "");
    valid = process.env.APP_URL
      ? url.origin === new URL(process.env.APP_URL).origin
      : url.host === host && ["http:", "https:"].includes(url.protocol);
  } catch {}
  if (!valid) throw new AppError("Origen de solicitud no permitido.", 403);
}
