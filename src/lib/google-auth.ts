import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { randomBytes } from "node:crypto";
import { appUrl } from "./payments";

// "Entrar com Google" para o lojista (OAuth 2.0 / OpenID Connect do Google).
// Só aparece quando GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET estão definidos:
// sem eles, o botão some e o login por e-mail e senha continua igual.

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

const STATE_COOKIE = "google_oauth";
const PENDING_COOKIE = "google_signup";

export function googleEnabled() {
  return Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim());
}

/** Endereço que o Google chama de volta. Precisa estar cadastrado igualzinho no Google Cloud. */
export function googleRedirectUri() {
  return `${appUrl()}/api/auth/google/callback`;
}

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET ausente ou curto (mínimo 32 caracteres).");
  return new TextEncoder().encode(s);
}

const cookieOptions = (maxAge: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge,
});

/** Monta o endereço do Google e guarda o "state" (proteção contra CSRF) num cookie assinado. */
export async function startGoogleLogin(tipo: string | null) {
  const state = randomBytes(16).toString("base64url");
  const token = await new SignJWT({ state, tipo: tipo ?? "" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("10m")
    .sign(secret());
  (await cookies()).set(STATE_COOKIE, token, cookieOptions(10 * 60));
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!.trim(),
    redirect_uri: googleRedirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });
  return `${AUTH_URL}?${params}`;
}

/** Confere o state devolvido pelo Google. Devolve o tipo de negócio escolhido antes (se veio do cadastro). */
export async function checkGoogleState(state: string | null): Promise<{ ok: boolean; tipo: string | null }> {
  const jar = await cookies();
  const token = jar.get(STATE_COOKIE)?.value;
  jar.delete(STATE_COOKIE);
  if (!token || !state) return { ok: false, tipo: null };
  try {
    const { payload } = await jwtVerify(token, secret());
    const tipo = typeof payload.tipo === "string" && payload.tipo ? payload.tipo : null;
    return { ok: payload.state === state, tipo };
  } catch {
    return { ok: false, tipo: null };
  }
}

export type GoogleProfile = { googleId: string; email: string; name: string };

/** Troca o código pelo perfil do Google. Só aceita e-mail verificado pelo Google. */
export async function fetchGoogleProfile(code: string): Promise<GoogleProfile | null> {
  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!.trim(),
      client_secret: process.env.GOOGLE_CLIENT_SECRET!.trim(),
      redirect_uri: googleRedirectUri(),
      grant_type: "authorization_code",
    }),
    cache: "no-store",
  });
  if (!tokenRes.ok) {
    console.error("Google: falha ao trocar o código", tokenRes.status, await tokenRes.text().catch(() => ""));
    return null;
  }
  const { access_token } = (await tokenRes.json()) as { access_token?: string };
  if (!access_token) return null;

  const infoRes = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${access_token}` }, cache: "no-store" });
  if (!infoRes.ok) return null;
  const info = (await infoRes.json()) as { sub?: string; email?: string; email_verified?: boolean | string; name?: string };
  const verified = info.email_verified === true || info.email_verified === "true";
  if (!info.sub || !info.email || !verified) return null;
  return { googleId: info.sub, email: info.email.trim().toLowerCase(), name: (info.name ?? "").trim() };
}

/** Conta Google nova: guarda o perfil por 30 min até o lojista dizer o nome da loja. */
export async function savePendingGoogleSignup(profile: GoogleProfile, tipo: string | null) {
  const token = await new SignJWT({ ...profile, tipo: tipo ?? "" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("30m")
    .sign(secret());
  (await cookies()).set(PENDING_COOKIE, token, cookieOptions(30 * 60));
}

export async function readPendingGoogleSignup(): Promise<(GoogleProfile & { tipo: string | null }) | null> {
  const token = (await cookies()).get(PENDING_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    const { googleId, email, name, tipo } = payload as Record<string, unknown>;
    if (typeof googleId !== "string" || typeof email !== "string") return null;
    return { googleId, email, name: typeof name === "string" ? name : "", tipo: typeof tipo === "string" && tipo ? tipo : null };
  } catch {
    return null;
  }
}

export async function clearPendingGoogleSignup() {
  (await cookies()).delete(PENDING_COOKIE);
}
