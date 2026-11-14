# Deploy

Há dois caminhos: **Easypanel** (mais simples, logo abaixo) ou **CyberPanel com Docker Compose** (resto deste arquivo).

## Easypanel

1. **Projeto:** crie um projeto, ex.: `webtenda`.
2. **Banco:** + Service > Postgres. Nome `db`, imagem `postgres:16`. Depois de criado, copie a **Internal Connection URL** na aba Credentials.
3. **App:** + Service > App, nome `app`.
   - **Source:** GitHub, owner `webmedula`, repositório `delivery`, branch `main`, build path `/`.
   - **Build:** Dockerfile, arquivo `Dockerfile`.
   - **Environment:**
     ```
     DATABASE_URL=<Internal Connection URL do Postgres>
     AUTH_SECRET=<texto aleatório com 32 caracteres ou mais>
     ASAAS_API_KEY=<chave do Asaas SEM o "$" inicial, começando em aact_>
     ASAAS_BASE_URL=https://api-sandbox.asaas.com/v3
     ASAAS_WEBHOOK_TOKEN=<texto aleatório que você inventa>
     APP_URL=https://app.webtenda.com.br
     ADMIN_EMAILS=<seu e-mail de login; mais de um, separe por vírgula>
     ```
   - **Domains:** adicione `app.webtenda.com.br`, porta `3000`. O DNS (registro A de `app`) precisa apontar para o IP do VPS.
   - **Se o CyberPanel está no mesmo VPS** e já ocupa as portas 80/443: em vez de usar o domínio do Easypanel,
     publique a porta do app (aba Advanced > Ports: Published `3001`, Target `3000`), crie o site
     `app.webtenda.com.br` no CyberPanel, emita o SSL e use o bloco de proxy da seção 3 abaixo
     com `address 127.0.0.1:3001`.
   - Clique em **Deploy**.
4. As tabelas e os planos são criados sozinhos quando o app sobe (não precisa rodar migração à mão).
5. Webhook do Asaas e teste: veja a seção "Asaas" abaixo.
6. Backup: no serviço Postgres, aba Backups, configure um destino e agendamento diário.

# Deploy no VPS com CyberPanel

O sistema roda em Docker (app + Postgres) na porta local `3010`. O OpenLiteSpeed do
CyberPanel continua cuidando do domínio e do HTTPS e repassa as requisições para essa porta.
Os outros sites do VPS não são afetados.

## 1. Pré-requisitos (uma vez)

Como root no VPS:

```bash
docker --version || curl -fsSL https://get.docker.com | sh
git clone https://github.com/webmedula/delivery.git /opt/delivery
cd /opt/delivery
cp .env.production.example .env.production
nano .env.production        # preencha POSTGRES_PASSWORD, AUTH_SECRET e os dados do Asaas
chmod 600 .env.production
```

Se o repositório for privado, use um token de acesso ou uma deploy key no `git clone`.

## 2. Subir o sistema

```bash
cd /opt/delivery
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
curl -I http://127.0.0.1:3010      # deve responder 200
```

Na primeira subida as tabelas e os três planos são criados automaticamente.
A loja de demonstração não é criada em produção; cadastre a sua em `/cadastro`.

## 3. Domínio e HTTPS no CyberPanel

1. **Websites > Create Website**: crie o site com o domínio `app.webtenda.com.br`. PHP pode ser qualquer versão; não será usado.
2. **Websites > List Websites > Manage > SSL > Issue SSL** para gerar o certificado.
3. **Manage > vHost Conf**: adicione no final do arquivo e salve:

```
extprocessor delivery {
  type                    proxy
  address                 127.0.0.1:3010
  maxConns                100
  pcKeepAliveTimeout      60
  initTimeout             60
  retryTimeout            0
  respBuffer              0
}

context / {
  type                    proxy
  handler                 delivery
  addDefaultCharset       off
}
```

4. Reinicie o servidor web: `systemctl restart lsws`
5. Abra `https://app.webtenda.com.br`.

Se o site já tiver um bloco `context /` no vHost Conf, substitua-o por este.

O sistema fica em `app.webtenda.com.br`; o domínio principal `webtenda.com.br` continua
livre para a página de vendas.

## 4. Asaas

1. Crie a conta em https://sandbox.asaas.com (teste) e gere a chave em **Integrações > Chaves de API**.
2. Em **Integrações > Webhooks**, crie um webhook:
   - URL: `https://app.webtenda.com.br/api/billing/webhook`
   - Token de autenticação: o mesmo valor de `ASAAS_WEBHOOK_TOKEN`
   - Eventos: todos de **Cobranças** e de **Assinaturas**
3. Coloque a chave em `ASAAS_API_KEY` (entre aspas simples) e reinicie: `./deploy/update.sh`
4. Teste: entre no painel de uma loja > **Assinatura** > informe um CPF > **Assinar**. No sandbox dá para marcar a cobrança como recebida pelo painel do Asaas; a loja deve passar para "Ativa".
5. Para valer: troque a chave pela de produção e `ASAAS_BASE_URL` por `https://api.asaas.com/v3`, e cadastre o webhook também na conta de produção.

### Pagamento online das lojas (subcontas)

Cada loja cria em **Painel > Pagamento online** a própria conta de recebimento: o sistema abre uma
**subconta** no Asaas com a chave da plataforma, e as cobranças dos pedidos (Pix e cartão) são feitas
na subconta. O dinheiro cai direto na conta da loja; a WebTenda não fica com nada (sem split).

- Não precisa cadastrar webhook à mão: cada subconta já nasce com um webhook para
  `APP_URL/api/payments/webhook`, usando o mesmo `ASAAS_WEBHOOK_TOKEN`. Por isso `APP_URL` e o token
  precisam estar certos **antes** de a primeira loja criar a conta.
- A chave de API de cada subconta só é devolvida uma vez e fica salva criptografada com
  `PAYMENTS_ENCRYPTION_KEY` (opcional) ou, se não houver, com `AUTH_SECRET`. **Não troque esse segredo
  depois que houver lojas com conta criada**, senão as chaves salvas deixam de abrir.
- Em produção, o pagamento online só liga depois que o Asaas aprova a conta da loja (documentos enviados
  pelos links que aparecem no painel). No sandbox liga logo, para testar.
- No sandbox, para simular o pagamento, abra a cobrança na subconta pelo painel do Asaas ou use o link da
  fatura e confirme o pagamento de teste.

## 5. Backup

```bash
crontab -e
# adicione:
15 3 * * * /opt/delivery/deploy/backup.sh >> /var/log/delivery-backup.log 2>&1
```

Os arquivos ficam em `/var/backups/delivery` por 14 dias. Configure também uma cópia
para fora do VPS (o script tem um exemplo com rclone).

Restaurar um backup:

```bash
gunzip -c /var/backups/delivery/ARQUIVO.sql.gz | \
  docker compose --env-file .env.production -f docker-compose.prod.yml exec -T db psql -U delivery -d delivery
```

## 6. Atualizar para uma versão nova

```bash
/opt/delivery/deploy/update.sh
```

## Comandos úteis

```bash
cd /opt/delivery
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f app   # ver logs
docker compose --env-file .env.production -f docker-compose.prod.yml restart app   # reiniciar
```

## Área de administração

`https://app.webtenda.com.br/admin` mostra todas as lojas, usuários e assinaturas, e só abre
para os e-mails listados em `ADMIN_EMAILS`.

1. **Primeiro** crie a sua conta em `/cadastro` com o e-mail que vai ser administrador.
2. **Depois** coloque esse e-mail em `ADMIN_EMAILS` e refaça o deploy.

Faça nessa ordem: o cadastro não confirma e-mail, então quem se cadastrar com um e-mail
que já está em `ADMIN_EMAILS` vira administrador.

## Lojas demo

Quatro lojas de demonstração para apresentar o sistema a quem está conhecendo a WebTenda:

| Loja | Cardápio | Login do painel |
|---|---|---|
| Brasa Burger (hamburgueria) | `/loja/brasa-burger` | `burger@demo.webtenda.com.br` |
| Forno da Vila (pizzaria) | `/loja/forno-da-vila` | `pizza@demo.webtenda.com.br` |
| Açaí da Praia | `/loja/acai-da-praia` | `acai@demo.webtenda.com.br` |
| Mercadinho Bom Preço | `/loja/mercadinho-bom-preco` | `mercado@demo.webtenda.com.br` |

Senha de todas: o valor de `DEMO_PASSWORD` (se não estiver definida, `demo1234`).

Cada uma tem logo e cor próprios, cardápio com fotos reais (Unsplash, licença livre, carregadas do CDN do Unsplash), 16 clientes, pedidos dos últimos 30 dias, 6 pedidos em andamento,
cupons, fidelidade (uma cliente a 1 pedido da recompensa e outro com a recompensa liberada) e uma
campanha de promoção pela metade.

**Criar ou recriar:** entre em `/admin` e clique em **Criar lojas demo** (ou **Recriar lojas demo**,
que apaga tudo o que foi feito nelas e gera os dados de novo, com os pedidos em datas recentes).
Pelo terminal do serviço `app` no Easypanel também dá: `npm run demo` (recria) ou
`npm run demo -- --remove` (apaga).

**Variáveis opcionais (Environment do app):**

```
DEMO_STORES=1                 # cria as lojas demo que faltarem sempre que o app sobe
DEMO_PASSWORD=<senha>         # senha do painel das lojas demo (padrão demo1234)
DEMO_WHATSAPP=55119XXXXXXXX   # WhatsApp que recebe os pedidos de teste; sem ela o botão some
```

**O que fica desligado nelas:** assinatura e cobrança, pagamento online (Pix/cartão pelo Asaas) e
os números da visão geral do `/admin`. Os telefones dos clientes usam DDD 00, que não existe,
para nenhum link de WhatsApp do painel cair numa pessoa real. O cardápio mostra uma faixa
"Loja de demonstração" com link para webtenda.com.br. Se algum dia uma loja real usar um dos
endereços acima, o script para sem mudar nada.
