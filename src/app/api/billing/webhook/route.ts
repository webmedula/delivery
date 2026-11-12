import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { billingUpdateFor, type AsaasWebhook } from "@/lib/billing-events";

export const dynamic = "force-dynamic";

function tokenOk(received: string | null) {
  const expected = process.env.ASAAS_WEBHOOK_TOKEN;
  if (!expected || !received) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Webhook do Asaas. Configure em Asaas > Integrações > Webhooks com a URL
// https://SEU-DOMINIO/api/billing/webhook e o mesmo token de ASAAS_WEBHOOK_TOKEN.
export async function POST(req: Request) {
  if (!process.env.ASAAS_WEBHOOK_TOKEN) return NextResponse.json({ error: "webhook não configurado" }, { status: 503 });
  if (!tokenOk(req.headers.get("asaas-access-token"))) return NextResponse.json({ error: "token inválido" }, { status: 401 });

  let body: AsaasWebhook;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "json inválido" }, { status: 400 });
  }
  if (!body?.event) return NextResponse.json({ error: "evento ausente" }, { status: 400 });

  // Só reagimos a eventos da assinatura atual da loja. Cobranças avulsas ou de
  // assinaturas antigas são ignoradas (mas respondemos 200 para o Asaas não reenviar).
  const subscriptionId = body.payment?.subscription ?? body.subscription?.id;
  const eventId = body.id ?? `${body.event}:${body.payment?.id ?? subscriptionId ?? "?"}`;
  const store = subscriptionId ? await db.store.findUnique({ where: { billingSubscriptionId: subscriptionId } }) : null;
  const update = store ? billingUpdateFor(body, store) : null;

  try {
    await db.$transaction(async (tx) => {
      // Falha com P2002 se o evento já foi processado: garante idempotência.
      await tx.billingEvent.create({ data: { id: eventId, type: body.event, storeId: store?.id } });
      if (store && update) {
        await tx.store.update({
          where: { id: store.id },
          data: {
            subscriptionStatus: update.subscriptionStatus,
            ...(update.currentPeriodEnd ? { currentPeriodEnd: update.currentPeriodEnd } : {}),
            ...(update.clearSubscription ? { billingSubscriptionId: null } : {}),
          },
        });
      }
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return NextResponse.json({ ok: true, duplicate: true });
    throw e;
  }
  return NextResponse.json({ ok: true, applied: !!update });
}
