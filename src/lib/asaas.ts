// Cliente mínimo da API do Asaas (v3). Documentação: https://docs.asaas.com
// Só é usado no servidor.

export class AsaasError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

function config() {
  const apiKey = process.env.ASAAS_API_KEY;
  if (!apiKey) throw new AsaasError("ASAAS_API_KEY não configurada.", 0);
  // Sandbox por padrão; em produção use https://api.asaas.com/v3
  const baseUrl = (process.env.ASAAS_BASE_URL || "https://api-sandbox.asaas.com/v3").replace(/\/$/, "");
  return { apiKey, baseUrl };
}

export function asaasConfigured() {
  return !!process.env.ASAAS_API_KEY;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const { apiKey, baseUrl } = config();
  const res = await fetch(baseUrl + path, {
    method,
    headers: {
      access_token: apiKey,
      "Content-Type": "application/json",
      "User-Agent": "webtenda",
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {}
  if (!res.ok) {
    const errors = (json as { errors?: { description?: string }[] } | null)?.errors;
    const message = errors?.map((e) => e.description).filter(Boolean).join(" ") || `Asaas respondeu ${res.status}`;
    throw new AsaasError(message, res.status);
  }
  return json as T;
}

export type AsaasCustomer = { id: string };
export type AsaasSubscription = { id: string; status: string };
export type AsaasPayment = {
  id: string;
  status: string;
  dueDate: string; // YYYY-MM-DD
  value: number;
  invoiceUrl?: string;
  subscription?: string;
  customer?: string;
  externalReference?: string | null;
};

export function createCustomer(input: { name: string; email: string; cpfCnpj: string; mobilePhone?: string; externalReference: string }) {
  return request<AsaasCustomer>("POST", "/customers", input);
}

export function updateCustomer(id: string, input: { name?: string; email?: string; cpfCnpj?: string }) {
  return request<AsaasCustomer>("PUT", `/customers/${id}`, input);
}

export function createSubscription(input: {
  customer: string;
  value: number; // em reais
  nextDueDate: string; // YYYY-MM-DD
  description: string;
  externalReference: string;
}) {
  // billingType UNDEFINED deixa o lojista escolher Pix, boleto ou cartão na fatura.
  return request<AsaasSubscription>("POST", "/subscriptions", { ...input, billingType: "UNDEFINED", cycle: "MONTHLY" });
}

export function updateSubscription(id: string, input: { value: number; description: string }) {
  return request<AsaasSubscription>("PUT", `/subscriptions/${id}`, { ...input, updatePendingPayments: true });
}

export function cancelSubscription(id: string) {
  return request<{ deleted: boolean }>("DELETE", `/subscriptions/${id}`);
}

export async function listSubscriptionPayments(id: string) {
  const res = await request<{ data: AsaasPayment[] }>("GET", `/subscriptions/${id}/payments`);
  return res.data ?? [];
}
