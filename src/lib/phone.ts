/**
 * Normaliza telefone brasileiro: só dígitos, sem zeros à esquerda e sem o 55.
 * "(11) 98888-7777", "+55 11 988887777" e "011988887777" viram "11988887777".
 * A migração 20261114010000_customers_loyalty usa a mesma regra em SQL.
 */
export function normalizePhone(input: string): string {
  const d = input.replace(/\D/g, "").replace(/^0+/, "");
  return (d.length === 12 || d.length === 13) && d.startsWith("55") ? d.slice(2) : d;
}

/** DDD + número (fixo com 10 dígitos ou celular com 11). */
export function isValidPhone(phone: string): boolean {
  return /^[1-9]\d{9,10}$/.test(phone);
}

/** "11988887777" → "(11) 98888-7777" */
export function formatPhone(phone: string): string {
  const m = phone.match(/^(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : phone;
}

/** Link de WhatsApp para o número (acrescenta o 55). */
export function whatsappLink(phone: string, text?: string): string {
  return `https://wa.me/55${phone}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}
