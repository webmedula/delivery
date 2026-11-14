// Criptografia simétrica (AES-256-GCM) para guardar no banco as chaves de API
// das subcontas Asaas das lojas. A chave vem de PAYMENTS_ENCRYPTION_KEY ou,
// se não houver, de AUTH_SECRET. Trocar esse segredo invalida as chaves salvas.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function key(secret = process.env.PAYMENTS_ENCRYPTION_KEY || process.env.AUTH_SECRET) {
  if (!secret || secret.length < 32) throw new Error("PAYMENTS_ENCRYPTION_KEY/AUTH_SECRET ausente ou curto (mínimo 32 caracteres).");
  return createHash("sha256").update(`webtenda:asaas-subaccount:${secret}`).digest();
}

/** Devolve "v1.<iv>.<tag>.<dados>" em base64url. */
export function seal(plain: string, secret?: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(secret), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv, cipher.getAuthTag(), data].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
}

export function open(sealed: string, secret?: string): string {
  const [v, iv, tag, data] = sealed.split(".");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("Formato de segredo inválido.");
  const decipher = createDecipheriv("aes-256-gcm", key(secret), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}
