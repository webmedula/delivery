import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pedido Local",
  description: "Cardápio digital e pedidos para pequenos negócios, sem comissão por pedido.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
