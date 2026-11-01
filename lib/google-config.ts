import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { AppError } from "./auth";
export const GOOGLE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export function googleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID,
    clientSecret = process.env.GOOGLE_CLIENT_SECRET,
    redirectUri = process.env.GOOGLE_REDIRECT_URI,
    encodedKey = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
  if (!clientId || !clientSecret || !redirectUri || !encodedKey)
    throw new AppError(
      "El administrador debe completar la configuración de Google Sheets antes de conectarlo.",
      503,
    );
  const key = Buffer.from(encodedKey, "base64");
  if (key.length !== 32)
    throw new AppError(
      "La clave de protección de la conexión de Google no es válida.",
      503,
    );
  let uri: URL;
  try {
    uri = new URL(redirectUri);
  } catch {
    throw new AppError("La dirección de conexión de Google no es válida.", 503);
  }
  const local =
    process.env.NODE_ENV !== "production" &&
    ["localhost", "127.0.0.1"].includes(uri.hostname) &&
    uri.protocol === "http:";
  if (
    (uri.protocol !== "https:" && !local) ||
    uri.pathname !== "/api/google/callback" ||
    uri.search ||
    uri.hash ||
    uri.username ||
    uri.password
  )
    throw new AppError(
      "Revisa la dirección de retorno de Google en la configuración del servidor.",
      503,
    );
  return { clientId, clientSecret, redirectUri, key };
}
export function googleConfigured() {
  try {
    googleConfig();
    return true;
  } catch {
    return false;
  }
}
export function sealSecret(value: string, key = googleConfig().key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data]
    .map((b) => b.toString("base64url"))
    .join(".");
}
export function openSecret(value: string, key = googleConfig().key) {
  try {
    const [iv, tag, data] = value
      .split(".")
      .map((v) => Buffer.from(v, "base64url"));
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString(
      "utf8",
    );
  } catch {
    throw new AppError(
      "La conexión de Google no se puede leer. El administrador debe volver a conectarla.",
      503,
    );
  }
}
export function validOAuthState(
  encoded: string,
  state: string,
  userId: string,
  key = googleConfig().key,
) {
  try {
    const saved = JSON.parse(openSecret(encoded, key));
    const a = Buffer.from(saved.state),
      b = Buffer.from(state);
    if (
      saved.userId !== userId ||
      saved.expires < Date.now() ||
      a.length !== b.length ||
      !timingSafeEqual(a, b) ||
      typeof saved.verifier !== "string"
    )
      return null;
    return saved as {
      state: string;
      userId: string;
      expires: number;
      verifier: string;
    };
  } catch {
    return null;
  }
}
