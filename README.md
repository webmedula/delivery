# WebTenda

SaaS de cardápio digital e pedidos para pequenos negócios locais, cobrado por assinatura mensal (sem comissão por pedido).

**Stack:** Next.js 15 (App Router, Server Actions) · React 19 · Prisma 6 · PostgreSQL · Tailwind 4 · Vitest

## O que já funciona

- **Cadastro de loja** com 14 dias de teste e slug próprio (`/loja/minha-loja`).
- **Cardápio público** responsivo, com categorias, sacola salva no navegador, entrega ou retirada, taxa de entrega, pedido mínimo, Pix / dinheiro com troco / cartão na entrega.
- **Página do pedido** para o cliente acompanhar o status, com botão para avisar a loja no WhatsApp.
- **Painel do lojista:** pedidos em aberto com atualização automática e mudança de status, faturamento do dia, cadastro de categorias e produtos (pausar/excluir), configurações da loja (aberta/fechada, WhatsApp, Pix, taxas).
- **Multi-tenant:** toda tabela tem `storeId`; o painel sempre usa o `storeId` da sessão (`requireStoreUser`), nunca um vindo do formulário.
- **Planos e assinatura:** limites de produtos e de pedidos/mês por plano; a loja é bloqueada quando o teste vence, com 3 dias de tolerância em atraso (`src/lib/subscription.ts`).
- O preço do pedido é sempre recalculado no servidor (`src/lib/order-calc.ts`).
- **Cobrança recorrente pelo Asaas** (Pix, boleto ou cartão): o lojista assina em Painel > Assinatura, paga a fatura do Asaas, e o webhook `/api/billing/webhook` ativa, marca atraso ou cancela a loja (`src/lib/billing.ts`, `src/lib/billing-events.ts`).
- **Área de administração** em `/admin` (e-mails de `ADMIN_EMAILS`): visão geral, lojas, usuários, bloquear/liberar, trocar plano, redefinir senha, entrar no painel de uma loja como suporte e histórico das ações.
- **Deploy em VPS com CyberPanel** via Docker: veja [deploy/README.md](deploy/README.md).

## Ainda não feito

- Pix com QR Code e confirmação automática para os pedidos dos clientes.
- Adicionais/variações de produto (tamanho, borda, extras), upload de imagens, horários de funcionamento, impressão de pedidos, notificação em tempo real (hoje é polling), área de superadmin, domínio/subdomínio próprio por loja, recuperação de senha.

## Rodando localmente

```bash
cp .env.example .env          # ajuste DATABASE_URL e AUTH_SECRET
docker compose up -d          # Postgres local
npm install
npx prisma migrate dev        # cria as tabelas
npm run db:seed               # planos + loja demo
npm run dev
```

- Cardápio demo: http://localhost:3000/loja/lanchonete-demo
- Painel demo: http://localhost:3000/entrar · `demo@webtenda.com.br` / `demo1234`

## Testes

```bash
npm test          # regras de cálculo de pedido, assinatura e valores em R$
npm run typecheck
```

## Estrutura

```
prisma/schema.prisma        modelos: Plan, Store, User, Category, Product, Order, OrderItem
src/lib/                    auth, cálculo de pedido, assinatura, dinheiro
src/app/(auth)/             cadastro e login
src/app/painel/             painel do lojista (server actions em actions.ts)
src/app/loja/[slug]/        cardápio público e acompanhamento do pedido
```
