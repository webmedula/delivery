// Cor própria da loja no cardápio. Os tons "brand" do Tailwind são variáveis CSS,
// então basta redefini-las a partir de uma cor só.

export const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export function themeStyle(color: string | null | undefined): Record<string, string> | undefined {
  if (!color || !HEX_COLOR.test(color)) return undefined;
  return {
    "--color-brand-50": `color-mix(in srgb, ${color} 8%, white)`,
    "--color-brand-100": `color-mix(in srgb, ${color} 18%, white)`,
    "--color-brand-500": `color-mix(in srgb, ${color} 85%, white)`,
    "--color-brand-600": color,
    "--color-brand-700": `color-mix(in srgb, ${color} 80%, black)`,
  };
}
