"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { createSession, destroySession, endSupportSession, hashPassword, verifyPassword } from "@/lib/auth";
import { RESERVED_SLUGS, slugify } from "@/lib/slug";
import { TRIAL_DAYS } from "@/lib/subscription";
import { BOOKING_STARTER_SERVICES, signupDefaultsFor } from "@/lib/niche";
import { TABLE_SIGNUP, tableSignupDefaults } from "@/lib/tables";
import { randomBytes } from "node:crypto";
import { clearPendingGoogleSignup, readPendingGoogleSignup } from "@/lib/google-auth";
import { normalizePartnerCode } from "@/lib/partner";

export type FormState = { error?: string } | undefined;

const signupSchema = z.object({
  storeName: z.string().trim().min(2, "Informe o nome da loja."),
  name: z.string().trim().min(2, "Informe seu nome."),
  email: z.string().trim().toLowerCase().email("E-mail inválido."),
  password: z.string().min(8, "A senha precisa ter pelo menos 8 caracteres."),
  businessType: z.enum(["FOOD", "RETAIL", "PREORDER", "BOOKING"]).default("FOOD"),
});

/**
 * Código do parceiro digitado no cadastro (ou vindo do link dele). Vazio = sem parceiro.
 * Código que não existe ou foi desativado dá erro, para o lojista corrigir ou apagar o campo.
 */
async function partnerFrom(formData: FormData): Promise<{ partnerId: string | null } | { error: string }> {
  const code = normalizePartnerCode(String(formData.get("partnerCode") ?? ""));
  if (!code) return { partnerId: null };
  const partner = await db.partner.findUnique({ where: { code } });
  if (!partner || !partner.active) return { error: `Não encontramos o código de parceiro “${code}”. Confira com quem te indicou ou deixe o campo vazio.` };
  return { partnerId: partner.id };
}

async function uniqueSlug(base: string) {
  let slug = base || "loja";
  if (RESERVED_SLUGS.has(slug)) slug = `${slug}-loja`;
  for (let i = 2; await db.store.findUnique({ where: { slug } }); i++) slug = `${base}-${i}`;
  return slug;
}

/** Lê o tipo de negócio do formulário. "Com mesas" é um restaurante (FOOD) que já nasce com as mesas do pedido por QR code. */
function businessFrom(formData: FormData) {
  const withTables = formData.get("businessType") === TABLE_SIGNUP.value;
  return { withTables, businessType: withTables ? "FOOD" : formData.get("businessType") ?? undefined };
}

/** Cria o lojista com a loja já configurada para o tipo de negócio. Usado no cadastro com senha e no cadastro com Google. */
async function createOwnerWithStore(input: {
  storeName: string;
  name: string;
  email: string;
  passwordHash: string;
  googleId?: string;
  businessType: "FOOD" | "RETAIL" | "PREORDER" | "BOOKING";
  withTables: boolean;
  partnerId: string | null;
}): Promise<FormState | { userId: string }> {
  const { storeName, name, email, passwordHash, googleId, businessType, withTables, partnerId } = input;
  const defaults = withTables ? { ...signupDefaultsFor(businessType), ...tableSignupDefaults() } : signupDefaultsFor(businessType);
  const tables = "tables" in defaults ? defaults.tables : [];

  if (await db.user.findUnique({ where: { email } })) return { error: "Já existe uma conta com este e-mail." };

  const plan = await db.plan.findFirst({ where: { active: true }, orderBy: { priceCents: "asc" } });
  if (!plan) return { error: "Nenhum plano configurado. Rode o seed do banco." };

  const user = await db.user.create({
    data: {
      name,
      email,
      passwordHash,
      googleId,
      role: "OWNER",
      store: {
        create: {
          name: storeName,
          slug: await uniqueSlug(slugify(storeName)),
          planId: plan.id,
          subscriptionStatus: "TRIALING",
          trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000),
          partnerId,
          // Cada tipo de negócio já nasce configurado (ex.: loja de roupa com retirada e WhatsApp).
          ...defaults.store,
          categories: { create: defaults.categories.map((c, i) => ({ name: c, position: i })) },
          diningTables: { create: tables.map((label, i) => ({ label, position: i + 1, code: randomBytes(6).toString("base64url") })) },
        },
      },
    },
  });

  // Barbearia/salão: já nasce com o dono como primeiro profissional e três serviços de exemplo,
  // para a agenda funcionar no primeiro minuto (preço e tempo são ajustados depois).
  if (businessType === "BOOKING" && user.storeId) {
    const storeId = user.storeId;
    await db.professional.create({ data: { storeId, name, position: 0, breakStart: "12:00", breakEnd: "13:00" } });
    const categories = await db.category.findMany({ where: { storeId } });
    await db.product.createMany({
      data: BOOKING_STARTER_SERVICES.map((s, i) => ({
        storeId, name: s.name, description: s.description, priceCents: s.priceCents, durationMinutes: s.durationMinutes, position: i,
        categoryId: categories.find((c) => c.name === s.category)?.id ?? null,
      })),
    });
  }

  return { userId: user.id };
}

export async function signup(_: FormState, formData: FormData): Promise<FormState> {
  const { withTables, businessType } = businessFrom(formData);
  const parsed = signupSchema.safeParse({ ...Object.fromEntries(formData), businessType });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const partner = await partnerFrom(formData);
  if ("error" in partner) return partner;
  const { password, ...data } = parsed.data;
  const result = await createOwnerWithStore({ ...data, passwordHash: await hashPassword(password), withTables, partnerId: partner.partnerId });
  if (!result || !("userId" in result)) return result;
  await createSession(result.userId);
  redirect("/painel");
}

const googleSignupSchema = signupSchema.omit({ email: true, password: true });

/** Fim do cadastro com Google: o e-mail veio do Google; falta o nome da loja e o tipo de negócio. */
export async function completeGoogleSignup(_: FormState, formData: FormData): Promise<FormState> {
  const pending = await readPendingGoogleSignup();
  if (!pending) return { error: "O tempo para concluir acabou. Clique em “Continuar com Google” de novo." };
  const { withTables, businessType } = businessFrom(formData);
  const parsed = googleSignupSchema.safeParse({ ...Object.fromEntries(formData), businessType });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const partner = await partnerFrom(formData);
  if ("error" in partner) return partner;
  // Sem senha: o lojista entra pelo Google. A senha aleatória nunca é mostrada (dá para criar uma pelo admin, se precisar).
  const result = await createOwnerWithStore({
    ...parsed.data,
    email: pending.email,
    googleId: pending.googleId,
    passwordHash: await hashPassword(randomBytes(32).toString("base64url")),
    withTables,
    partnerId: partner.partnerId,
  });
  if (!result || !("userId" in result)) return result;
  await clearPendingGoogleSignup();
  await createSession(result.userId);
  redirect("/painel");
}

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("E-mail inválido."),
  password: z.string().min(1, "Informe a senha."),
});

export async function login(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const user = await db.user.findUnique({ where: { email: parsed.data.email } });
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash)))
    return { error: "E-mail ou senha incorretos." };
  await createSession(user.id);
  redirect("/painel");
}

export async function logout() {
  await destroySession();
  await endSupportSession();
  redirect("/entrar");
}
