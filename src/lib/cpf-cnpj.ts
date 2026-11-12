function allSame(d: string) {
  return /^(\d)\1+$/.test(d);
}

function cpfValid(d: string) {
  if (d.length !== 11 || allSame(d)) return false;
  for (const n of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += Number(d[i]) * (n + 1 - i);
    if (((sum * 10) % 11) % 10 !== Number(d[n])) return false;
  }
  return true;
}

function cnpjValid(d: string) {
  if (d.length !== 14 || allSame(d)) return false;
  for (const n of [12, 13]) {
    let sum = 0;
    let weight = n - 7;
    for (let i = 0; i < n; i++) {
      sum += Number(d[i]) * weight--;
      if (weight < 2) weight = 9;
    }
    const digit = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    if (digit !== Number(d[n])) return false;
  }
  return true;
}

/** Devolve só os dígitos se for um CPF ou CNPJ válido; senão null. */
export function normalizeCpfCnpj(input: string): string | null {
  const d = input.replace(/\D/g, "");
  return cpfValid(d) || cnpjValid(d) ? d : null;
}
