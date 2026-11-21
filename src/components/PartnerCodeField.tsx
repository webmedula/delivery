/**
 * Campo "Código do parceiro" do cadastro. Quem chega pelo link do parceiro já vê o código preenchido;
 * os outros veem só um "Tenho um código de parceiro", para o cadastro continuar curto.
 */
export function PartnerCodeField({ code }: { code?: string | null }) {
  return (
    <details open={!!code} className="rounded-xl border border-stone-200 px-3 py-2 text-sm [&[open]]:pb-3">
      <summary className="cursor-pointer select-none text-stone-600">Tenho um código de parceiro</summary>
      <label className="label mt-3" htmlFor="partnerCode">Código do parceiro que indicou a WebTenda</label>
      <input
        id="partnerCode"
        name="partnerCode"
        defaultValue={code ?? ""}
        autoCapitalize="characters"
        autoComplete="off"
        placeholder="Ex.: MARIA"
        className="input uppercase"
      />
    </details>
  );
}
