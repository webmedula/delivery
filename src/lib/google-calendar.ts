import "server-only";
import { cookies } from "next/headers";
import { after } from "next/server";
import { SignJWT, jwtVerify } from "jose";
import { randomBytes } from "node:crypto";
import { db } from "./db";
import { appUrl } from "./payments";
import { open, seal } from "./secret-box";
import { googleRedirectUri } from "./google-auth";
import { belongsTo, eventBody, googleEventId, shouldShow } from "./calendar-event";
import { brDateOf } from "./preorder";

// Google Agenda da barbearia/salão: cada agendamento entra, muda e sai do Google Agenda na hora.
//
// - A barbearia (agenda com todos os atendimentos) e cada profissional (só os dele) podem conectar
//   uma conta Google. O WebTenda cria uma agenda própria nessa conta ("<loja> · WebTenda") e só
//   mexe nela (escopo calendar.app.created: não vê nem altera os outros compromissos da pessoa).
// - Uma falha do Google nunca impede o agendamento: a sincronização roda depois da resposta e,
//   se falhar, fica marcada e é tentada de novo a cada 10 minutos.
// - Só aparece com GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e GOOGLE_AGENDA=1.

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
// Os endereços abaixo podem ser trocados só para testes automatizados (Google simulado).
const TOKEN_URL = process.env.GOOGLE_TEST_TOKEN_URL || "https://oauth2.googleapis.com/token";
const USERINFO_URL = process.env.GOOGLE_TEST_USERINFO_URL || "https://openidconnect.googleapis.com/v1/userinfo";
const API = process.env.GOOGLE_TEST_CALENDAR_API || "https://www.googleapis.com/calendar/v3";
const REVOKE_URL = process.env.GOOGLE_TEST_REVOKE_URL || "https://oauth2.googleapis.com/revoke";

export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.app.created";
const STATE_COOKIE = "google_agenda";
const STATE_PREFIX = "cal.";
const TIMEOUT_MS = 8000;

export function calendarEnabled() {
  const on = process.env.GOOGLE_AGENDA?.trim().toLowerCase();
  return (
    Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim()) &&
    (on === "1" || on === "true" || on === "sim")
  );
}

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET ausente ou curto (mínimo 32 caracteres).");
  return new TextEncoder().encode(s);
}

// --- Conectar ---

type Target = { storeId: string; professionalId: string | null; via: "panel" | "invite" };

/** Link que a loja manda para o profissional conectar a própria conta Google (vale 7 dias). */
export async function inviteToken(storeId: string, professionalId: string) {
  return new SignJWT({ k: "cal-invite", s: storeId, p: professionalId })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .sign(secret());
}

export async function readInviteToken(token: string | null): Promise<{ storeId: string; professionalId: string } | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.k !== "cal-invite" || typeof payload.s !== "string" || typeof payload.p !== "string") return null;
    return { storeId: payload.s, professionalId: payload.p };
  } catch {
    return null;
  }
}

export async function inviteUrl(storeId: string, professionalId: string) {
  return `${appUrl()}/google-agenda?t=${await inviteToken(storeId, professionalId)}`;
}

/** Manda para a tela do Google. O retorno usa o mesmo endereço do "Entrar com Google". */
export async function startCalendarConnect(target: Target) {
  const state = STATE_PREFIX + randomBytes(16).toString("base64url");
  const token = await new SignJWT({ state, ...target })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("15m")
    .sign(secret());
  (await cookies()).set(STATE_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 15 * 60,
  });
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!.trim(),
    redirect_uri: googleRedirectUri(),
    response_type: "code",
    scope: `openid email ${CALENDAR_SCOPE}`,
    access_type: "offline",
    prompt: "consent select_account", // garante a chave de acesso permanente (refresh token)
    state,
  });
  return `${AUTH_URL}?${params}`;
}

export function isCalendarState(state: string | null) {
  return !!state?.startsWith(STATE_PREFIX);
}

function doneUrl(target: Target | null, result: string) {
  if (target?.via === "invite") return `/google-agenda?resultado=${result}`;
  return `/painel/profissionais?google=${result}#google-agenda`;
}

/** O Google voltou com o código: guarda a conexão, cria a agenda e leva os próximos horários. Devolve para onde ir. */
export async function finishCalendarConnect(url: URL): Promise<string> {
  const jar = await cookies();
  const token = jar.get(STATE_COOKIE)?.value;
  jar.delete(STATE_COOKIE);
  let target: Target | null = null;
  try {
    if (token) {
      const { payload } = await jwtVerify(token, secret());
      if (payload.state === url.searchParams.get("state") && typeof payload.storeId === "string") {
        target = {
          storeId: payload.storeId,
          professionalId: typeof payload.professionalId === "string" ? payload.professionalId : null,
          via: payload.via === "invite" ? "invite" : "panel",
        };
      }
    }
  } catch {}
  if (url.searchParams.get("error") === "access_denied") return doneUrl(target, "cancelado");
  const code = url.searchParams.get("code");
  if (!target || !code) return doneUrl(target, "erro");

  const store = await db.store.findUnique({ where: { id: target.storeId }, select: { id: true, name: true } });
  const pro = target.professionalId
    ? await db.professional.findFirst({ where: { id: target.professionalId, storeId: target.storeId }, select: { id: true, name: true } })
    : null;
  if (!store || (target.professionalId && !pro)) return doneUrl(target, "erro");

  const tokens = await exchangeCode(code);
  if (!tokens) return doneUrl(target, "erro");
  if (!tokens.scope.split(" ").includes(CALENDAR_SCOPE)) return doneUrl(target, "sem-permissao");
  if (!tokens.refreshToken) return doneUrl(target, "erro");
  const email = await fetchEmail(tokens.accessToken);

  // Uma conexão por profissional e uma da barbearia: conectar de novo troca a anterior.
  const previous = await db.calendarConnection.findMany({
    where: { storeId: store.id, professionalId: target.professionalId },
  });
  const connection = await db.$transaction(async (tx) => {
    if (previous.length) await tx.calendarConnection.deleteMany({ where: { id: { in: previous.map((p) => p.id) } } });
    return tx.calendarConnection.create({
      data: {
        storeId: store.id,
        professionalId: target.professionalId,
        googleEmail: email ?? "conta Google",
        refreshTokenEnc: seal(tokens.refreshToken!),
      },
    });
  });
  accessTokens.set(connection.id, { token: tokens.accessToken, exp: Date.now() + (tokens.expiresIn - 60) * 1000 });
  for (const p of previous) {
    // Mesma conta Google: reaproveita a agenda já criada. Outra conta: só desfaz o acesso antigo.
    if (p.googleEmail === email && p.calendarId) await db.calendarConnection.update({ where: { id: connection.id }, data: { calendarId: p.calendarId } });
    else void revoke(p.refreshTokenEnc);
  }
  runLater(() => backfill(connection.id));
  return doneUrl(target, "ok");
}

async function exchangeCode(code: string) {
  try {
    const res = await fetch(TOKEN_URL, {
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
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error("[google-agenda] falha ao trocar o código", res.status, await res.text().catch(() => ""));
      return null;
    }
    const j = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string };
    if (!j.access_token) return null;
    return { accessToken: j.access_token, refreshToken: j.refresh_token ?? null, expiresIn: j.expires_in ?? 3600, scope: j.scope ?? "" };
  } catch (e) {
    console.error("[google-agenda] falha ao trocar o código", e instanceof Error ? e.message : e);
    return null;
  }
}

async function fetchEmail(accessToken: string) {
  try {
    const res = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return null;
    const info = (await res.json()) as { email?: string };
    return info.email?.trim().toLowerCase() ?? null;
  } catch {
    return null;
  }
}

async function revoke(refreshTokenEnc: string) {
  try {
    await fetch(REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: open(refreshTokenEnc) }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {}
}

/** Desconecta: o WebTenda deixa de mexer na agenda e devolve o acesso ao Google. A agenda criada fica na conta da pessoa. */
export async function disconnectCalendar(storeId: string, connectionId: string) {
  const conn = await db.calendarConnection.findFirst({ where: { id: connectionId, storeId } });
  if (!conn) return;
  await db.calendarConnection.delete({ where: { id: conn.id } });
  accessTokens.delete(conn.id);
  await revoke(conn.refreshTokenEnc);
}

// --- Falar com o Google ---

class GoogleError extends Error {
  constructor(public status: number, message: string, public auth = false) {
    super(message);
  }
}

const accessTokens = new Map<string, { token: string; exp: number }>();

type Conn = { id: string; refreshTokenEnc: string; calendarId: string | null; professionalId: string | null; googleEmail: string };

async function accessToken(conn: Conn) {
  const cached = accessTokens.get(conn.id);
  if (cached && cached.exp > Date.now()) return cached.token;
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!.trim(),
      client_secret: process.env.GOOGLE_CLIENT_SECRET!.trim(),
      refresh_token: open(conn.refreshTokenEnc),
      grant_type: "refresh_token",
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    // invalid_grant: a pessoa tirou o acesso no Google (ou trocou a senha). Precisa conectar de novo.
    throw new GoogleError(res.status, `token ${res.status} ${text.slice(0, 200)}`, text.includes("invalid_grant") || res.status === 401);
  }
  const j = (await res.json()) as { access_token: string; expires_in?: number };
  accessTokens.set(conn.id, { token: j.access_token, exp: Date.now() + ((j.expires_in ?? 3600) - 60) * 1000 });
  return j.access_token;
}

async function api(conn: Conn, method: string, path: string, body?: unknown) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${await accessToken(conn)}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status === 401) accessTokens.delete(conn.id);
  return res;
}

/** A agenda "<loja> · WebTenda" na conta Google (cria na primeira vez, ou se a pessoa apagou). */
async function ensureCalendar(conn: Conn, force = false): Promise<string> {
  if (conn.calendarId && !force) return conn.calendarId;
  const store = await db.calendarConnection.findUnique({
    where: { id: conn.id },
    select: { store: { select: { name: true } }, professional: { select: { name: true } } },
  });
  const name = store?.store.name ?? "WebTenda";
  const res = await api(conn, "POST", "/calendars", {
    summary: `${name} · WebTenda`,
    description: store?.professional
      ? `Horários de ${store.professional.name} em ${name}, marcados pelo WebTenda. Mudanças são feitas pelo painel do WebTenda.`
      : `Todos os horários de ${name}, marcados pelo WebTenda. Mudanças são feitas pelo painel do WebTenda.`,
    timeZone: "America/Sao_Paulo",
  });
  if (!res.ok) throw new GoogleError(res.status, `criar agenda ${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`, res.status === 401 || res.status === 403);
  const { id } = (await res.json()) as { id: string };
  await db.calendarConnection.update({ where: { id: conn.id }, data: { calendarId: id } });
  await db.calendarEvent.deleteMany({ where: { connectionId: conn.id } }); // agenda nova: começa do zero
  conn.calendarId = id;
  return id;
}

async function upsertEvent(conn: Conn, body: ReturnType<typeof eventBody>, retried = false): Promise<void> {
  const cal = encodeURIComponent(await ensureCalendar(conn));
  const id = encodeURIComponent(body.id);
  let res = await api(conn, "PUT", `/calendars/${cal}/events/${id}`, body);
  if (res.status === 404) {
    res = await api(conn, "POST", `/calendars/${cal}/events`, body);
    if (res.status === 409) res = await api(conn, "PUT", `/calendars/${cal}/events/${id}`, body);
    // A própria agenda sumiu (a pessoa apagou no Google): cria outra e tenta de novo.
    if (res.status === 404 && !retried) {
      await ensureCalendar(conn, true);
      return upsertEvent(conn, body, true);
    }
  }
  if (!res.ok) throw new GoogleError(res.status, `evento ${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`, res.status === 401);
}

async function deleteEvent(conn: Conn, eventId: string) {
  if (!conn.calendarId) return;
  const res = await api(conn, "DELETE", `/calendars/${encodeURIComponent(conn.calendarId)}/events/${encodeURIComponent(eventId)}`);
  if (!res.ok && res.status !== 404 && res.status !== 410)
    throw new GoogleError(res.status, `apagar evento ${res.status}`, res.status === 401);
}

async function noteError(conn: Conn, e: unknown) {
  const auth = e instanceof GoogleError && e.auth;
  const message = e instanceof Error ? e.message : String(e);
  console.error(`[google-agenda] ${conn.googleEmail}: ${message}`);
  await db.calendarConnection
    .update({
      where: { id: conn.id },
      data: {
        lastError: auth ? "O Google recusou o acesso. Conecte de novo." : "O Google não respondeu. O WebTenda tenta de novo sozinho.",
        lastErrorAt: new Date(),
        ...(auth ? { brokenAt: new Date() } : {}),
      },
    })
    .catch(() => {});
  return auth;
}

// --- Sincronizar ---

const orderInclude = { items: { select: { name: true } }, store: { select: { name: true, address: true } } } as const;

/** Deixa o Google Agenda igual ao agendamento agora (cria, atualiza ou apaga em cada agenda conectada). */
export async function syncAppointment(orderId: string): Promise<void> {
  if (!calendarEnabled()) return;
  const order = await db.order.findUnique({ where: { id: orderId }, include: { ...orderInclude, calendarEvents: true } });
  if (!order || order.fulfillment !== "APPOINTMENT") return;
  const connections = await db.calendarConnection.findMany({ where: { storeId: order.storeId, brokenAt: null } });
  const show = shouldShow(order);
  const panelUrl = `${appUrl()}/painel/agenda${order.scheduledFor ? `?dia=${brDateOf(order.scheduledFor)}` : ""}`;
  let failed = false;

  for (const conn of connections) {
    const existing = order.calendarEvents.find((e) => e.connectionId === conn.id);
    try {
      if (show && belongsTo(order, conn)) {
        const body = eventBody(order, { storeName: order.store.name, storeAddress: order.store.address, panelUrl, showProfessional: conn.professionalId === null });
        await upsertEvent(conn, body);
        await db.calendarEvent.upsert({
          where: { orderId_connectionId: { orderId: order.id, connectionId: conn.id } },
          update: { googleEventId: body.id },
          create: { orderId: order.id, connectionId: conn.id, googleEventId: body.id },
        });
      } else if (existing) {
        await deleteEvent(conn, existing.googleEventId);
        await db.calendarEvent.delete({ where: { id: existing.id } }).catch(() => {});
      }
      if (conn.lastError) await db.calendarConnection.update({ where: { id: conn.id }, data: { lastError: null, lastErrorAt: null } });
    } catch (e) {
      // Acesso recusado: a conexão fica marcada para conectar de novo, não adianta insistir.
      if (!(await noteError(conn, e))) failed = true;
    }
  }
  if (failed !== order.calendarSyncPending)
    await db.order.update({ where: { id: order.id }, data: { calendarSyncPending: failed } }).catch(() => {});
}

/** Roda depois da resposta (quando possível), para o cliente e a loja não esperarem o Google. */
function runLater(task: () => Promise<void>) {
  const safe = () => task().catch((e) => console.error("[google-agenda]", e instanceof Error ? e.message : e));
  try {
    after(safe);
  } catch {
    void safe(); // fora de uma requisição (tarefa de fundo)
  }
}

/**
 * Chame sempre que um agendamento for criado ou mudar. Nunca lança erro e nunca atrasa a resposta:
 * marca como pendente (se a loja tem Google Agenda) e sincroniza logo depois.
 */
export async function queueCalendarSync(orderId: string) {
  if (!calendarEnabled()) return;
  try {
    const res = await db.order.updateMany({
      where: { id: orderId, fulfillment: "APPOINTMENT", store: { calendarConnections: { some: { brokenAt: null } } } },
      data: { calendarSyncPending: true },
    });
    if (res.count > 0) runLater(() => syncAppointment(orderId));
  } catch (e) {
    console.error("[google-agenda] não deu para marcar o agendamento", e instanceof Error ? e.message : e);
  }
}

/** Conta recém-conectada: leva os agendamentos de hoje em diante. */
async function backfill(connectionId: string) {
  const conn = await db.calendarConnection.findUnique({ where: { id: connectionId } });
  if (!conn) return;
  const since = new Date(Date.now() - 12 * 60 * 60_000);
  const orders = await db.order.findMany({
    where: {
      storeId: conn.storeId,
      fulfillment: "APPOINTMENT",
      scheduledFor: { gte: since },
      status: { not: "CANCELED" },
      ...(conn.professionalId ? { professionalId: conn.professionalId } : {}),
    },
    orderBy: { scheduledFor: "asc" },
    take: 500,
    select: { id: true },
  });
  for (const o of orders) await syncAppointment(o.id);
}

/** Tarefa de fundo: tenta de novo o que falhou (Google fora do ar, internet caiu). */
export async function retryPendingSyncs() {
  if (!calendarEnabled()) return 0;
  const pending = await db.order.findMany({
    where: { calendarSyncPending: true, updatedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60_000) } },
    orderBy: { updatedAt: "asc" },
    take: 100,
    select: { id: true },
  });
  for (const o of pending) await syncAppointment(o.id);
  return pending.length;
}
