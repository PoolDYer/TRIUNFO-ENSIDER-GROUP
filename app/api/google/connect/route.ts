import { randomBytes } from "node:crypto";
import { CodeChallengeMethod } from "google-auth-library";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AppError, checkOrigin, requireUser } from "@/lib/auth";
import { googleConfig, GOOGLE_SCOPE, sealSecret } from "@/lib/google-config";
import { googleClient } from "@/lib/google-sheets";
export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const user = await requireUser(true);
    const config = googleConfig();
    if (req.headers.get("origin") !== new URL(config.redirectUri).origin)
      throw new AppError(
        `Abre el sistema desde ${new URL(config.redirectUri).origin} para conectar Google.`,
      );
    const client = googleClient();
    const { codeVerifier, codeChallenge } =
      await client.generateCodeVerifierAsync();
    const state = randomBytes(32).toString("base64url");
    (await cookies()).set(
      "triunfo_google_state",
      sealSecret(
        JSON.stringify({
          state,
          verifier: codeVerifier,
          userId: user.id,
          expires: Date.now() + 10 * 60 * 1000,
        }),
      ),
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/api/google/callback",
        maxAge: 600,
      },
    );
    const url = client.generateAuthUrl({
      access_type: "offline",
      scope: [GOOGLE_SCOPE],
      prompt: "consent",
      state,
      code_challenge: codeChallenge,
      code_challenge_method: CodeChallengeMethod.S256,
    });
    return NextResponse.json(
      { url },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof AppError
            ? error.message
            : "No se pudo iniciar la conexión con Google.",
      },
      { status: error instanceof AppError ? error.status : 503 },
    );
  }
}
