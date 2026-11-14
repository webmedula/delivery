import { requireStoreUser } from "@/lib/auth";
import { asaasConfigured, asaasSandbox } from "@/lib/asaas";
import { refreshAccount } from "@/lib/payments";
import { accountStatusLabel, canEnableOnlinePayments } from "@/lib/payment-events";
import { OnlineMethodsForm, PaymentAccountForm } from "@/components/PaymentForms";
import { DemoNotice } from "@/components/DemoNotice";

export const dynamic = "force-dynamic";

const statusColor: Record<string, string> = {
  APPROVED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
  AWAITING_APPROVAL: "bg-amber-100 text-amber-800",
  PENDING: "bg-stone-100 text-stone-700",
};

function Status({ value }: { value: string }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor[value] ?? statusColor.PENDING}`}>{accountStatusLabel[value] ?? value}</span>;
}

export default async function PaymentsPage() {
  const { store, user } = await requireStoreUser();
  if (store.isDemo)
    return (
      <DemoNotice
        title="Pagamento online"
        text="Numa loja de verdade, aqui o lojista cria a própria conta de recebimento no Asaas e liga Pix e cartão de crédito direto no cardápio, sem comissão da WebTenda. Nas lojas de demonstração isso fica desligado para nenhuma cobrança real ser gerada."
      />
    );
  const configured = asaasConfigured();
  const sandbox = asaasSandbox();
  const overview = store.asaasAccountId ? await refreshAccount(store) : null;
  const general = overview?.status?.general ?? store.asaasAccountStatus ?? "PENDING";
  const allowed = canEnableOnlinePayments({ ...store, asaasAccountStatus: general }, sandbox);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">Pagamento online</h1>
      <div className="card space-y-2 text-sm text-stone-700">
        <p>
          Receba por <strong>Pix</strong> e <strong>cartão de crédito</strong> direto no cardápio. O pagamento é processado pelo
          Asaas e o dinheiro cai <strong>na sua própria conta</strong>, que é criada aqui mesmo.
        </p>
        <p>
          <strong>A WebTenda não cobra comissão sobre as vendas.</strong> Você paga só as tarifas do Asaas por transação, e
          acompanha saldo e saques pelo app ou site do Asaas.
        </p>
      </div>

      {!configured && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">O pagamento online ainda não foi configurado neste servidor.</p>
      )}
      {configured && sandbox && (
        <p className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-800">Modo de teste (sandbox do Asaas): nenhum dinheiro de verdade é movimentado.</p>
      )}

      {configured && !store.asaasAccountId && (
        <PaymentAccountForm
          defaults={{ name: store.name, email: user.email, cpfCnpj: store.cpfCnpj ?? "", mobilePhone: store.whatsapp?.replace(/^55/, "") ?? "" }}
        />
      )}

      {store.asaasAccountId && (
        <div className="card space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Sua conta de recebimento</h2>
            <Status value={general} />
          </div>
          {overview?.error && <p className="text-red-600">Não foi possível consultar o Asaas agora: {overview.error}</p>}
          {overview?.status && (
            <ul className="space-y-1">
              <li className="flex justify-between gap-2"><span>Dados comerciais</span><Status value={overview.status.commercialInfo} /></li>
              <li className="flex justify-between gap-2"><span>Conta bancária</span><Status value={overview.status.bankAccountInfo} /></li>
              <li className="flex justify-between gap-2"><span>Documentos</span><Status value={overview.status.documentation} /></li>
            </ul>
          )}
          {general !== "APPROVED" && (
            <div className="space-y-2 rounded-lg bg-stone-50 p-3">
              <p>
                Para liberar os recebimentos, o Asaas precisa conferir seus documentos. Envie pelos links abaixo (abrem no site do
                Asaas). A análise costuma levar até 2 dias úteis. Confira também o e-mail que o Asaas enviou para criar sua senha.
              </p>
              {overview?.rejectReasons && <p className="text-red-700">Motivo da recusa: {overview.rejectReasons}</p>}
              {overview?.documents.length ? (
                <ul className="space-y-1">
                  {overview.documents.map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-2">
                      <span>{d.title || d.type}</span>
                      {d.onboardingUrl ? (
                        <a href={d.onboardingUrl} target="_blank" className="btn-ghost px-3 py-1">Enviar</a>
                      ) : (
                        <Status value={d.status} />
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                !overview?.error && <p className="text-stone-500">Nenhum documento pendente no momento. Recarregue a página mais tarde.</p>
              )}
            </div>
          )}
        </div>
      )}

      {store.asaasAccountId && (
        <OnlineMethodsForm pix={store.onlinePixEnabled} card={store.onlineCardEnabled} allowed={allowed} />
      )}
    </div>
  );
}
