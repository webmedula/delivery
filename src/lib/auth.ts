import "server-only";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { db } from "./db";

const COOKIE = "session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 dias

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET ausente ou curto (mínimo 32 caracteres).");
  return new TextEncoder().encode(s);
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function createSession(userId: string) {
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

export async function getSessionUser() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.sub) return null;
    return db.user.findUnique({ where: { id: payload.sub }, include: { store: { include: { plan: true } } } });
  } catch {
    return null;
  }
}

/** E-mails com acesso à área /admin, definidos em ADMIN_EMAILS (separados por vírgula). */
export function isAdminEmail(email: string) {
  const list = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}

/** Administrador da plataforma. Quem não é recebe 404, para não revelar que /admin existe. */
export async function requireAdmin() {
  const user = await getSessionUser();
  if (!user) redirect("/entrar");
  if (!isAdminEmail(user.email)) notFound();
  return user;
}

// --- Modo suporte: o administrador abre o painel de uma loja como se fosse o lojista ---

const SUPPORT_COOKIE = "support_store";

export async function startSupportSession(storeId: string) {
  const token = await new SignJWT({ storeId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(secret());
  (await cookies()).set(SUPPORT_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 2 * 60 * 60,
  });
}

export async function endSupportSession() {
  (await cookies()).delete(SUPPORT_COOKIE);
}

async function supportStoreId(): Promise<string | null> {
  const token = (await cookies()).get(SUPPORT_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return typeof payload.storeId === "string" ? payload.storeId : null;
  } catch {
    return null;
  }
}

/**
 * Usuário logado com loja. Todo código do painel passa por aqui e usa
 * o storeId retornado em TODAS as consultas: é o isolamento entre lojas.
 * Se um administrador está em modo suporte, a loja é a que ele escolheu.
 */
export async function requireStoreUser() {
  const user = await getSessionUser();
  if (!user) redirect("/entrar");

  if (isAdminEmail(user.email)) {
    const id = await supportStoreId();
    if (id) {
      const store = await db.store.findUnique({ where: { id }, include: { plan: true } });
      if (store) return { user, store, storeId: store.id, support: true };
    }
  }

  if (!user.store) redirect(isAdminEmail(user.email) ? "/admin" : "/entrar");
  return { user, store: user.store, storeId: user.store.id, support: false };
}
