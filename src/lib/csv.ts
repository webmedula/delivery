/**
 * CSV no formato que o Excel em português abre direto: separador ";",
 * BOM UTF-8 e aspas quando preciso. Células que começam com = + - @
 * ganham um apóstrofo para não virarem fórmula (injeção de CSV).
 */
export function toCSV(rows: (string | number)[][]): string {
  const cell = (v: string | number) => {
    let s = String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + rows.map((r) => r.map(cell).join(";")).join("\r\n") + "\r\n";
}
