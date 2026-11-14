import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { applyPaymentEvent } from "@/lib/payments";

export const dynamic = "force-dynamic";

function tokenOk(received: string | null) {
  const expected = process.env.ASAAS_WEBHOOK_TOKEN;
  if (!expected || !received) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Webhook das subcontas das lojas (pagamento online dos pedidos). É cadastrado
// automaticamente em cada subconta quando a loja cria a conta de recebimento,
// com o mesmo token de ASAAS_WEBHOOK_TOKEN. Não é o webhook da assinatura.
export async function POST(req: Request) {
  if (!process.env.ASAAS_WEBHOOK_TOKEN) return NextResponse.json({ error: "webhook não configurado" }, { status: 503 });
  if (!tokenOk(req.headers.get("asaas-access-token"))) return NextResponse.json({ error: "token inválido" }, { status: 401 });

  let body: { id?: string; event?: string; payment?: { id?: string } };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "json inválido" }, { status: 400 });
  }
  if (!body?.event) return NextResponse.json({ error: "evento ausente" }, { status: 400 });
  const paymentId = body.payment?.id;
  if (!paymentId) return NextResponse.json({ ok: true, applied: false });

  const applied = await applyPaymentEvent(paymentId, body.event, body.id ?? `${body.event}:${paymentId}`);
  return NextResponse.json({ ok: true, applied });
}
