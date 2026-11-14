// Cliente mínimo da API do Asaas (v3). Documentação: https://docs.asaas.com
// Só é usado no servidor.

export class AsaasError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

/**
 * A chave do Asaas começa com "$", que vários painéis e arquivos .env interpretam
 * como variável. Por isso aceitamos a chave entre aspas ou sem o "$" inicial.
 */
export function normalizeApiKey(raw: string | undefined): string | null {
  const key = (raw ?? "").trim().replace(/^['"]|['"]$/g, "");
  if (!key) return null;
  return key.startsWith("aact_") ? "$" + key : key;
}

function config() {
  const apiKey = normalizeApiKey(process.env.ASAAS_API_KEY);
  if (!apiKey) throw new AsaasError("ASAAS_API_KEY não configurada.", 0);
  // Sandbox por padrão; em produção use https://api.asaas.com/v3
  const baseUrl = (process.env.ASAAS_BASE_URL || "https://api-sandbox.asaas.com/v3").replace(/\/$/, "");
  return { apiKey, baseUrl };
}

export function asaasConfigured() {
  return !!normalizeApiKey(process.env.ASAAS_API_KEY);
}

/** Ambiente de testes do Asaas? (padrão enquanto ASAAS_BASE_URL não aponta para produção) */
export function asaasSandbox() {
  return !(process.env.ASAAS_BASE_URL || "").includes("://api.asaas.com");
}

/**
 * Chamada à API. Sem `asKey`, usa a conta da plataforma (ASAAS_API_KEY);
 * com `asKey`, age em nome da subconta de uma loja.
 */
async function request<T>(method: string, path: string, body?: unknown, asKey?: string): Promise<T> {
  const cfg = config();
  const baseUrl = cfg.baseUrl;
  const apiKey = asKey ?? cfg.apiKey;
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

// --- Subcontas (uma por loja) e cobranças avulsas dos pedidos ---

export type AsaasCompanyType = "MEI" | "LIMITED" | "INDIVIDUAL" | "ASSOCIATION";

export type NewSubaccount = {
  name: string;
  email: string;
  cpfCnpj: string;
  birthDate?: string; // YYYY-MM-DD, obrigatório para CPF
  companyType?: AsaasCompanyType; // obrigatório para CNPJ
  mobilePhone: string;
  incomeValue: number; // faturamento/renda mensal em reais
  address: string;
  addressNumber: string;
  complement?: string;
  province: string; // bairro
  postalCode: string;
  site?: string;
  webhooks?: AsaasWebhookConfig[];
};

export type AsaasWebhookConfig = {
  name: string;
  url: string;
  email: string;
  enabled: boolean;
  interrupted: boolean;
  apiVersion: 3;
  authToken: string;
  sendType: "SEQUENTIALLY" | "NON_SEQUENTIALLY";
  events: string[];
};

export type AsaasSubaccount = { id: string; walletId: string; apiKey: string };

/** Cria a subconta. A apiKey só vem nesta resposta: guarde na hora. */
export function createSubaccount(input: NewSubaccount) {
  return request<AsaasSubaccount>("POST", "/accounts", input);
}

export type AccountStatusValue = "PENDING" | "AWAITING_APPROVAL" | "APPROVED" | "REJECTED";
export type AsaasAccountStatus = {
  id: string;
  commercialInfo: AccountStatusValue;
  bankAccountInfo: AccountStatusValue;
  documentation: AccountStatusValue;
  general: AccountStatusValue;
};

export function getAccountStatus(asKey: string) {
  return request<AsaasAccountStatus>("GET", "/myAccount/status/", undefined, asKey);
}

export type AsaasDocumentGroup = {
  id: string;
  status: string;
  type: string;
  title?: string;
  description?: string;
  onboardingUrl?: string | null;
};

export async function listPendingDocuments(asKey: string) {
  const res = await request<{ data?: AsaasDocumentGroup[]; rejectReasons?: string | null }>("GET", "/myAccount/documents", undefined, asKey);
  return { groups: res.data ?? [], rejectReasons: res.rejectReasons ?? null };
}

/** Pix só gera QR Code se a conta tiver uma chave. Cria uma aleatória se não houver. */
export async function ensurePixKey(asKey: string) {
  const res = await request<{ data?: { id: string; status: string }[] }>("GET", "/pix/addressKeys?status=ACTIVE", undefined, asKey);
  if ((res.data ?? []).length > 0) return;
  await request("POST", "/pix/addressKeys", { type: "EVP" }, asKey);
}

export function createCustomerAs(asKey: string, input: { name: string; cpfCnpj: string; mobilePhone?: string; externalReference: string; notificationDisabled?: boolean }) {
  return request<AsaasCustomer>("POST", "/customers", input, asKey);
}

export function updateCustomerAs(asKey: string, id: string, input: { name?: string; cpfCnpj?: string }) {
  return request<AsaasCustomer>("PUT", `/customers/${id}`, input, asKey);
}

export function createPaymentAs(
  asKey: string,
  input: {
    customer: string;
    billingType: "PIX" | "CREDIT_CARD";
    value: number; // em reais
    dueDate: string; // YYYY-MM-DD
    description: string;
    externalReference: string;
    callback?: { successUrl: string; autoRedirect: boolean };
  },
) {
  return request<AsaasPayment>("POST", "/payments", input, asKey);
}

export function getPaymentAs(asKey: string, id: string) {
  return request<AsaasPayment>("GET", `/payments/${id}`, undefined, asKey);
}

export function deletePaymentAs(asKey: string, id: string) {
  return request<{ deleted: boolean }>("DELETE", `/payments/${id}`, undefined, asKey);
}

export type AsaasPixQrCode = { encodedImage: string; payload: string; expirationDate?: string };

export function getPixQrCodeAs(asKey: string, id: string) {
  return request<AsaasPixQrCode>("GET", `/payments/${id}/pixQrCode`, undefined, asKey);
}
