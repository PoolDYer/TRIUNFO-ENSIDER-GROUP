import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { requireUser } from "@/lib/auth";
import { transaction } from "@/lib/db";
import {
  googleConfig,
  GOOGLE_SCOPE,
  sealSecret,
  validOAuthState,
} from "@/lib/google-config";
import { googleClient } from "@/lib/google-sheets";
export const runtime = "nodejs";
export async function GET(req: Request) {
  let origin = new URL(req.url).origin;
  try {
    const config = googleConfig();
    origin = new URL(config.redirectUri).origin;
    const user = await requireUser(true);
    const url = new URL(req.url);
    const jar = await cookies();
    const encoded = jar.get("triunfo_google_state")?.value;
    jar.delete({ name: "triunfo_google_state", path: "/api/google/callback" });
    const saved = encoded
      ? validOAuthState(encoded, url.searchParams.get("state") ?? "", user.id)
      : null;
    if (!saved)
      return NextResponse.redirect(new URL("/sistema?google=expired", origin));
    if (url.searchParams.has("error"))
      return NextResponse.redirect(new URL("/sistema?google=denied", origin));
    const code = url.searchParams.get("code");
    if (!code) throw new Error("Missing code");
    const { tokens } = await googleClient().getToken({
      code,
      codeVerifier: saved.verifier,
      redirect_uri: config.redirectUri,
    });
    if (
      !tokens.refresh_token ||
      (tokens.scope && !tokens.scope.split(" ").includes(GOOGLE_SCOPE))
    )
      throw new Error("Missing authorization");
    await transaction(async (db) => {
      await db.query(
        "INSERT INTO google_connection(id,refresh_token_encrypted,client_id,connected_by) VALUES(1,$1,$2,$3) ON CONFLICT(id) DO UPDATE SET refresh_token_encrypted=EXCLUDED.refresh_token_encrypted,client_id=EXCLUDED.client_id,connected_by=EXCLUDED.connected_by,connected_at=now()",
        [sealSecret(tokens.refresh_token!), config.clientId, user.id],
      );
      await db.query(
        "INSERT INTO audit_log(id,user_id,action,entity_id) VALUES($1,$2,$3,$4)",
        [randomUUID(), user.id, "googleConnect", "google"],
      );
    });
    return NextResponse.redirect(new URL("/sistema?google=connected", origin));
  } catch {
    return NextResponse.redirect(new URL("/sistema?google=failed", origin));
  }
}
