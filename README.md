# WebTenda

SaaS de cardápio digital e pedidos para pequenos negócios locais, cobrado por assinatura mensal (sem comissão por pedido).

**Stack:** Next.js 15 (App Router, Server Actions) · React 19 · Prisma 6 · PostgreSQL · Tailwind 4 · Vitest

## O que já funciona

- **Cadastro de loja** com 14 dias de teste e slug próprio (`/loja/minha-loja`). No cadastro o lojista escolhe o **tipo de negócio** (delivery, loja de roupas ou encomendas; `?tipo=loja` ou `?tipo=encomendas` no link já marca), e o painel e o catálogo mudam textos e recursos conforme o tipo (`src/lib/niche.ts`).
- **Encomendas** (bolos, doces, salgados para festa, marmitas da semana): o cliente escolhe dia e horário de retirada ou entrega, com antecedência mínima, dias da semana, horários, limite por dia e dias fechados definidos pela loja; a loja pode cobrar sinal (30%, 50% ou 100%) no Pix online ou pela chave Pix, e o painel tem a **Agenda** com a lista do que produzir em cada dia (`src/lib/preorder.ts`).
- **Loja de roupas:** vitrine em grade com fotos grandes, produto com várias fotos, preço "de/por", **cor e tamanho com estoque por combinação** (esgotado aparece riscado), tela de Estoque, link de cada produto para compartilhar (`/loja/x/produto/id`). O estoque baixa quando o pedido entra e volta se ele for cancelado (`src/lib/stock.ts`).
- **Fotos pelo celular:** produto (até 9 fotos) e logo são enviados direto do aparelho. A foto é reduzida no navegador e o servidor (sharp) gira, reduz para até 1600 px, converte para WebP e apaga os metadados (inclusive GPS). Fica na tabela `StoredImage` do próprio Postgres, que já tem backup, e é servida em `/img/<id>.webp` com cache de 1 ano (`src/lib/images.ts`). Fotos que saem do produto são apagadas; as enviadas e nunca salvas somem depois de um dia. Na loja demo o envio fica desligado.
- **Pedido na mesa por QR code:** em Mesas a loja cria as mesas (ex.: Mesa 1 a 12) e imprime uma folha com um QR por mesa (`/imprimir/mesas`, 4 por A4). O QR abre o cardápio no modo mesa (`/loja/[slug]/mesa/[code]`): o cliente pede só com o nome (telefone opcional), sem endereço e sem pedido mínimo, e o pedido chega no quadro com o nome da mesa (Em preparo → Pronto para servir → Servido). Paga no final (`TAB`, "na conta da mesa") ou na hora com Pix/cartão online. Tudo soma na conta da mesa até a loja tocar em "Conta paga, liberar a mesa" (`Order.billClosedAt`). Pelo celular o cliente chama o garçom ou pede a conta, e o quadro toca o aviso. No cadastro, `?tipo=mesa` cria a loja sem entrega e já com 10 mesas. Regras em `src/lib/tables.ts`.
- **Envio pelos Correios/transportadora:** em Envios a loja liga o envio, informa o estado de origem, o frete grátis a partir de um valor (vale para a opção mais barata) e as formas de envio (PAC, SEDEX...) com preço por destino: mesmo estado e cada região. Na sacola o cliente digita o CEP, o endereço vem do ViaCEP e o frete aparece na hora; o servidor recalcula pelo estado do CEP (faixas oficiais, sem consulta externa, `src/lib/shipping.ts`). Ao marcar como enviado, a loja cola o código de rastreio, que vai na mensagem de WhatsApp e aparece na página do pedido.
- **Fechar pedido pelo WhatsApp** (qualquer tipo de loja): o pedido fica registrado e abre o WhatsApp da loja com a mensagem pronta; pagamento combinado na conversa.
- **Cardápio público** responsivo, com categorias, sacola salva no navegador, entrega ou retirada, taxa de entrega, pedido mínimo, Pix / dinheiro com troco / cartão na entrega.
- **Página do pedido** para o cliente acompanhar o status, com botão para avisar a loja no WhatsApp.
- **Painel do lojista:** pedidos em aberto com atualização automática e mudança de status, faturamento do dia, cadastro de categorias e produtos (pausar/excluir), configurações da loja (aberta/fechada, WhatsApp, Pix, taxas).
- **Multi-tenant:** toda tabela tem `storeId`; o painel sempre usa o `storeId` da sessão (`requireStoreUser`), nunca um vindo do formulário.
- **Planos e assinatura:** limites de produtos e de pedidos/mês por plano; a loja é bloqueada quando o teste vence, com 3 dias de tolerância em atraso (`src/lib/subscription.ts`).
- O preço do pedido é sempre recalculado no servidor (`src/lib/order-calc.ts`).
- **Cobrança recorrente pelo Asaas** (Pix, boleto ou cartão): o lojista assina em Painel > Assinatura, paga a fatura do Asaas, e o webhook `/api/billing/webhook` ativa, marca atraso ou cancela a loja (`src/lib/billing.ts`, `src/lib/billing-events.ts`).
- **Pagamento online dos pedidos** (Pix e cartão de crédito), sem comissão da plataforma: cada loja abre a própria subconta Asaas em Painel > Pagamento online; o cliente paga no cardápio (QR Code Pix na tela, cartão na página segura do Asaas) e o pedido só aparece para a loja depois de pago. Webhook `/api/payments/webhook` + consulta direta como reserva (`src/lib/payments.ts`, `src/lib/payment-events.ts`).
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
