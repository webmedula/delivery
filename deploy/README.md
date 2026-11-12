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

1. **Websites > Create Website**: crie o site com o domínio (ex.: `app.seudominio.com.br`). PHP pode ser qualquer versão; não será usado.
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
5. Abra `https://app.seudominio.com.br`.

Se o site já tiver um bloco `context /` no vHost Conf, substitua-o por este.

## 4. Asaas

1. Crie a conta em https://sandbox.asaas.com (teste) e gere a chave em **Integrações > Chaves de API**.
2. Em **Integrações > Webhooks**, crie um webhook:
   - URL: `https://app.seudominio.com.br/api/billing/webhook`
   - Token de autenticação: o mesmo valor de `ASAAS_WEBHOOK_TOKEN`
   - Eventos: todos de **Cobranças** e de **Assinaturas**
3. Coloque a chave em `ASAAS_API_KEY` (entre aspas simples) e reinicie: `./deploy/update.sh`
4. Teste: entre no painel de uma loja > **Assinatura** > informe um CPF > **Assinar**. No sandbox dá para marcar a cobrança como recebida pelo painel do Asaas; a loja deve passar para "Ativa".
5. Para valer: troque a chave pela de produção e `ASAAS_BASE_URL` por `https://api.asaas.com/v3`, e cadastre o webhook também na conta de produção.

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
