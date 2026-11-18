"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { createSession, destroySession, endSupportSession, hashPassword, verifyPassword } from "@/lib/auth";
import { RESERVED_SLUGS, slugify } from "@/lib/slug";
import { TRIAL_DAYS } from "@/lib/subscription";
import { signupDefaultsFor } from "@/lib/niche";

export type FormState = { error?: string } | undefined;

const signupSchema = z.object({
  storeName: z.string().trim().min(2, "Informe o nome da loja."),
  name: z.string().trim().min(2, "Informe seu nome."),
  email: z.string().trim().toLowerCase().email("E-mail inválido."),
  password: z.string().min(8, "A senha precisa ter pelo menos 8 caracteres."),
  businessType: z.enum(["FOOD", "RETAIL"]).default("FOOD"),
});

async function uniqueSlug(base: string) {
  let slug = base || "loja";
  if (RESERVED_SLUGS.has(slug)) slug = `${slug}-loja`;
  for (let i = 2; await db.store.findUnique({ where: { slug } }); i++) slug = `${base}-${i}`;
  return slug;
}

export async function signup(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = signupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { storeName, name, email, password, businessType } = parsed.data;
  const defaults = signupDefaultsFor(businessType);

  if (await db.user.findUnique({ where: { email } })) return { error: "Já existe uma conta com este e-mail." };

  const plan = await db.plan.findFirst({ where: { active: true }, orderBy: { priceCents: "asc" } });
  if (!plan) return { error: "Nenhum plano configurado. Rode o seed do banco." };

  const user = await db.user.create({
    data: {
      name,
      email,
      passwordHash: await hashPassword(password),
      role: "OWNER",
      store: {
        create: {
          name: storeName,
          slug: await uniqueSlug(slugify(storeName)),
          planId: plan.id,
          subscriptionStatus: "TRIALING",
          trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000),
          // Cada tipo de negócio já nasce configurado (ex.: loja de roupa com retirada e WhatsApp).
          ...defaults.store,
          categories: { create: defaults.categories.map((c, i) => ({ name: c, position: i })) },
        },
      },
    },
  });

  await createSession(user.id);
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
