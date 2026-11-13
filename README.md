# BarberSaaS — Plataforma SaaS Multi-Tenant para Barbearias

Plataforma web SaaS multi-tenant desenvolvida para operar com custo recorrente **R$ 0** utilizando os serviços gratuitos da **Cloudflare** (Workers, Workers Static Assets, D1, R2 e Turnstile) e integração de chatbot gratuita via **Telegram Bot API** (com suporte opcional à **WhatsApp Cloud API oficial da Meta**).

## Principais Funcionalidades

- **Multi-Tenant Real:** Uma única aplicação e banco D1 atendem centenas de barbearias com isolamento obrigatório por `TenantId` no backend, nas chaves compostas do SQLite, no prefixo de objetos do R2 e nos webhooks do chatbot.
- **Onboarding em 7 Etapas:** Cadastro de conta + criação guiada do estabelecimento (informações, identidade visual, localização com mapa, horários/intervalos, serviços, profissionais e publicação).
- **Website Público Dinâmico (`/b/:slug`):** Template único carregado do banco com cores personalizadas, logotipo, capa, serviços por categoria, equipe, galeria com carrossel/swipe/lightbox/lazy-loading, mapa + rota e agendamento online.
- **Painel Administrativo (`/admin`):** Dashboard de indicadores, editor visual "Personalizar meu site" com prévia antes de publicar, CRUD de serviços/profissionais, agenda (diária/semanal/mensal + bloqueios), histórico de clientes, galeria WebP e configurador/simulador de chatbot.
- **Chatbot Multi-Tenant:** Camada desacoplada (`ChatbotService`, `TelegramProvider`, `WhatsAppProvider`, `MessageHandler`, `AppointmentHandler`, `TenantResolver`) utilizando exatamente o mesmo motor de disponibilidade e agendamento do site.
- **Superadministrador (`/superadmin`):** Gestão global de barbearias, usuários, limites gratuitos da plataforma e logs de erros sem dados sensíveis.

---

## Pré-requisitos

- Node.js 20+ (testado com Node 22)
- Conta gratuita na Cloudflare (`wrangler login`)

## 1. Instalação Local

```bash
npm install
```

### Aplicar Migrations e Seed no D1 Local

```bash
npm run db:migrate:local
npm run db:seed:local
```

Credenciais criadas pelo seed opcional (`seeds/demo.sql`):
- **Superadmin:** `admin@barbersaas.local` / `Admin@123456`
- **Barbearia Demo (`/b/vintage-demo`):** `demo@vintagebarber.local` / `Demo@123456`

### Rodar em Desenvolvimento

```bash
npm run dev
```

### Rodar Testes Automatizados (Workers Runtime + D1 + R2)

```bash
npm test
```

---

## 2. Provisionamento na Cloudflare (Plano Gratuito)

### 2.1 Criar Banco D1

```bash
npx wrangler d1 create barbearia-saas-db
```

Copie o `database_id` retornado para `wrangler.jsonc` no campo `d1_databases[0].database_id`.

Aplicar migrations no banco remoto:

```bash
npm run db:migrate:remote
```

*(Opcional)* Popular o superadmin e a barbearia demo no remoto:

```bash
npx wrangler d1 execute barbearia-saas-db --remote --file=./seeds/demo.sql
```

### 2.2 Criar Bucket R2

> Nota: A ativação do R2 no painel Cloudflare exige verificação de conta, mantendo custo R$ 0 dentro das cotas gratuitas mensais.

```bash
npx wrangler r2 bucket create barbearia-saas-media
```

### 2.3 Configurar Secrets

Nunca coloque chaves sensíveis no `wrangler.jsonc`. Configure via CLI:

```bash
npx wrangler secret put ENCRYPTION_KEY
# Informe uma chave aleatória forte com 32+ caracteres (usada para AES-GCM dos tokens dos chatbots)

npx wrangler secret put TURNSTILE_SECRET_KEY
# Chave secreta obtida no painel Cloudflare Turnstile
```

Atualize `TURNSTILE_SITE_KEY` e `ENVIRONMENT: "production"` em `wrangler.jsonc` antes do deploy em produção.

### 2.4 Build e Deploy

```bash
npm run deploy
```

### 2.5 Domínios Personalizados

1. No painel da Cloudflare, adicione seu domínio em **Workers & Pages -> Custom Domains**.
2. Para domínios personalizados futuros por barbearia, a tabela `Tenants` já possui a coluna `CustomDomain UNIQUE`, permitindo resolução por `Host` header sem alterar o código de negócio.

---

## 3. Backup, Recuperação e Monitoramento de Limites Gratuitos

### Backup e Recuperação do D1 (Time Travel)

O Cloudflare D1 gratuito inclui **7 dias de Time Travel** (recuperação pontual):

```bash
# Verificar estado atual / exportar snapshot SQL
npx wrangler d1 export barbearia-saas-db --remote --output=backup-$(date +%Y%m%d).sql

# Restaurar para um ponto no tempo (Time Travel)
npx wrangler d1 time-travel restore barbearia-saas-db --timestamp="2026-11-13T12:00:00Z"
```

### Cotas do Plano Gratuito (Validadas)

| Recurso | Limite Gratuito | Proteção Aplicada no Projeto |
| --- | --- | --- |
| **Workers** | 100.000 req/dia, 10 ms CPU/req | Assets estáticos servidos fora do Worker (`run_worker_first` apenas em `/api/*`, `/media/*`, `/b/*`, SEO); PBKDF2/AES via WebCrypto nativo |
| **D1** | 5 GB, 5M leituras/dia, 100k escritas/dia | Índices compostos por `TenantId`, paginação/LIMIT em todas as listagens e `PlatformSettings` |
| **R2** | 10 GB/mês, 1M Class A/mês, 10M Class B/mês, egresso grátis | Compressão client-side para WebP antes do upload, limite de 2 MB por arquivo e `Cache-Control: immutable` (1 ano) na entrega |
| **Telegram Bot API** | 100% gratuito, sem taxa por mensagem | Provedor principal recomendado no painel `/admin/chatbot` |
| **WhatsApp Cloud API** | 1.000 mensagens de serviço/mês grátis por número (exige cartão na Meta; templates utilitários são pagos) | Implementado como provedor opcional oficial Meta em `WhatsAppProvider`, sem libs não oficiais |
