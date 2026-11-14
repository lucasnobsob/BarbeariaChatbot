# Documento de Requisitos — Integração de Pagamentos e Assinatura (BarberSaaS)

Este documento especifica os requisitos funcionais, técnicos, arquiteturais e de segurança para adicionar cobrança recorrente por assinatura à plataforma **BarberSaaS**, permitindo que cada dono de barbearia utilize o sistema gratuitamente por **1 mês (30 dias)** e passe a pagar **R$ 50,00/mês** após o término do período de teste.

---

## 1. Visão Geral do Modelo de Negócio

| Regra | Definição Inicial |
| :--- | :--- |
| **Unidade de cobrança** | Por barbearia (`TenantId`), independente do número de profissionais ou agendamentos |
| **Período gratuito (Trial)** | **30 dias corridos** (1 mês) a partir da ativação da barbearia |
| **Valor da mensalidade** | **R$ 50,00 / mês** (`5000` centavos, configurável globalmente pelo Superadmin) |
| **Exigência de cartão no cadastro** | **Opcional/Recomendada definir estratégia**: iniciar sem cartão reduz atrito na entrada; exigir pagamento ao fim do trial (ou pré-cadastro de método de pagamento) |
| **Período de carência (Grace Period)** | **5 dias** após o vencimento ou falha na cobrança antes de suspender o site público e o chatbot |
| **Meios de pagamento suportados** | **Cartão de Crédito** (recorrência automática) e **Pix** (QR Code / Copia e Cola mensal ou Pix Automático) |

---

## 2. Requisitos Funcionais (RF)

### RF-01 — Início Automático do Período Gratuito (1 Mês)
- Ao concluir o cadastro da barbearia em `POST /api/onboarding/complete` ou publicar em `POST /api/onboarding/publish` (`src/worker/domains/onboarding/routes.ts`), o sistema deve criar automaticamente um registro de assinatura para o `TenantId` com:
  - Status inicial: `trialing`
  - `TrialStartsAt`: timestamp UTC da ativação
  - `TrialEndsAt`: `TrialStartsAt + 30 dias`
- Durante os 30 dias de `trialing`, **todas as funcionalidades** da plataforma (site público `/b/:slug`, agendamento online, chatbot WhatsApp/Telegram, upload de imagens e painel admin) devem operar sem restrições e sem nenhuma cobrança.
- Um mesmo `TenantId` **não pode receber um segundo trial** caso cancele e reative posteriormente.
- **Prevenção de abuso de múltiplos trials**: exigir validação de CPF/CNPJ do titular (ou telefone validado) no momento de ativar a cobrança/trial estendido e manter Cloudflare Turnstile no registro (`/api/auth/register`).

### RF-02 — Ciclo de Cobrança Mensal (R$ 50,00)
- Após o término do período de 30 dias (`TrialEndsAt`), a assinatura entra em ciclo de cobrança mensal recorrente no valor de **R$ 50,00** (`5000` centavos).
- **Fluxo com Cartão de Crédito**:
  - Se o dono já cadastrou cartão durante o trial ou antes do vencimento, o gateway executa a cobrança automática no dia seguinte ao fim do trial e envia webhook confirmando o pagamento (`active`).
  - Se não houver cartão cadastrado ao final dos 30 dias, a barbearia entra em `past_due` (carência) com aviso imediato para concluir a assinatura.
- **Fluxo com Pix**:
  - Com **5 dias de antecedência** ao fim do trial (e nos ciclos seguintes), o sistema gera/solicita a fatura Pix de R$ 50,00 no gateway e disponibiliza o QR Code + código Copia e Cola no painel `/admin/billing` (e por e-mail/notificação).
  - Assim que o webhook do gateway confirmar a liquidação do Pix, o período vigente é estendido por mais **1 mês** (`CurrentPeriodEnd`).

### RF-03 — Máquina de Estados da Assinatura
A assinatura do tenant deve seguir estados bem definidos e auditáveis:

1. `trialing` — Dentro dos 30 dias gratuitos iniciais. Acesso total liberado.
2. `active` — Assinatura paga e em dia (`CurrentPeriodEnd` no futuro). Acesso total liberado.
3. `past_due` — Trial encerrado sem método de pagamento ou falha na cobrança mensal, dentro da janela de carência (ex.: 5 dias). Acesso continua funcionando, mas com alerta crítico no painel.
4. `suspended` — Carência expirada sem pagamento confirmado. Recursos públicos e operacionais são pausados até regularização.
5. `canceled` — Cancelada voluntariamente pelo dono da barbearia. Se ainda houver dias pagos em `CurrentPeriodEnd`, mantém acesso até o fim do ciclo já pago e depois transiciona para `suspended`.
6. `exempt` — Cortesia/isenção vitalícia ou temporária concedida manualmente pelo **Superadmin** (ex.: contas demo, parceiros ou a própria barbearia piloto).

### RF-04 — Controle de Acesso por Assinatura (Degradação Graciosa)
Quando a assinatura estiver em `suspended` (e não for `exempt`):
- **Permanece acessível**:
  - Login/Logout (`/api/auth/*`)
  - Tela de Assinatura e Pagamento (`/admin/billing` e `/api/admin/billing/*`) para que o dono consiga pagar a fatura pendente ou atualizar o cartão
  - Exportação básica de dados de clientes/agendamentos (conformidade LGPD)
- **É pausado/bloqueado**:
  - Página pública `/b/:slug` (retornar estado de barbearia temporariamente indisponível, sem expor motivo financeiro ao cliente final) e remoção temporária do showcase (`GET /api/public/showcase`)
  - APIs públicas de agendamento (`/api/public/:slug/*`)
  - Webhooks do chatbot WhatsApp e Telegram em `TenantResolver` (`src/worker/domains/chatbot/TenantResolver.ts`)
  - Criação/edição de serviços, profissionais, galeria e configurações administrativas (`/api/admin/*`) retornando HTTP `402 Payment Required` com código estruturado `SUBSCRIPTION_REQUIRED`
- Assim que o pagamento de R$ 50,00 for confirmado via webhook, o acesso integral deve ser restaurado **automaticamente em segundos**, sem intervenção manual.

### RF-05 — Painel de Assinatura do Dono da Barbearia (`/admin/billing`)
Nova página no painel administrativo (`src/web/components/AdminLayout.tsx` e `src/web/App.tsx`), acessível para perfil `owner` (e opcionalmente visualização para `admin`):
- Exibir o status atual da assinatura em linguagem simples (ex.: *"Período gratuito: faltam 18 dias"*, *"Plano Pro Ativo — R$ 50,00/mês"*, *"Pagamento pendente"*).
- Exibir data exata do término do trial e data da próxima cobrança.
- Permitir contratar/ativar assinatura por **Cartão de Crédito** (Checkout hospedado ou tokenizado) ou **Pix**.
- Permitir alterar forma de pagamento, baixar faturas/recibos e cancelar assinatura com confirmação clara.
- Exibir histórico de cobranças/faturas (`Pago`, `Pendente`, `Falhou`, valor, data, link/QR Code Pix).

### RF-06 — Banners e Notificações Proativas
- **Banner no Painel (`AdminLayout`)**:
  - Entre os dias 23 e 30 do trial: banner informativo com contagem regressiva e CTA *"Ativar plano (R$ 50/mês)"*.
  - Em `past_due`: banner vermelho fixo informando o prazo restante antes da suspensão do site público e do bot.
- **Notificações por E-mail (recomendado)**:
  - Boas-vindas com data do fim do mês grátis.
  - Lembrete 7 dias e 1 dia antes da primeira cobrança de R$ 50,00.
  - Confirmação de pagamento aprovado e recibo.
  - Aviso de falha na cobrança / vencimento do Pix com link direto para `/admin/billing`.

### RF-07 — Recursos para o Superadmin (`/superadmin`)
Extensão das rotas em `src/worker/domains/superadmin/routes.ts` e UI em `src/web/pages/superadmin/SuperAdminPages.tsx`:
- Indicadores no overview: total em `trialing`, total `active`, total `past_due`/`suspended` e **MRR estimado** (`tenants ativos × R$ 50,00`).
- Na listagem de barbearias (`/superadmin/tenants`): exibir coluna de status da assinatura e vencimento.
- Ações administrativas:
  - Alterar preço padrão do plano e dias de trial/carência em `PlatformSettings`.
  - Estender trial manualmente (+N dias) para uma barbearia específica.
  - Marcar/desmarcar barbearia como `exempt` (cortesia/parceiro).
  - Consultar histórico de webhooks financeiros e erros em `SystemLogs`.

---

## 3. Requisitos de Integração com Gateway de Pagamentos

### 3.1 Restrições Técnicas da Stack Atual
A aplicação roda em **Cloudflare Pages + Cloudflare Workers** (`Hono`, runtime V8 Edge com `nodejs_compat`, banco **Cloudflare D1**). Por isso, o gateway escolhido precisa atender obrigatoriamente:
1. **API REST HTTP pura** compatível com `fetch()` nativo (sem depender de SDKs pesados que exijam módulos Node incompatíveis).
2. **Assinatura criptográfica de Webhooks** verificável via **Web Crypto API** (`crypto.subtle` com HMAC-SHA256 ou assinatura assimétrica padrão).
3. **Suporte nativo a BRL (R$)**, **Pix** e **Cartão de Crédito recorrente**.
4. **Conformidade PCI-DSS** usando Checkout Hospedado, Payment Link ou tokenização client-side (os dados brutos do cartão **nunca** passam pelo Worker ou D1).

### 3.2 Opções Recomendadas para o Brasil
- **Asaas** ou **Mercado Pago** ou **Pagar.me**: ideais para o mercado brasileiro por suportarem **recorrência nativa via Cartão e Pix/Boleto**, emissão de cobrança mensal e excelente aderência a MEI/PJ no Brasil.
- **Stripe**: excelente API de `Subscriptions` + `trial_period_days: 30` + `Stripe Checkout` + `Customer Portal` nativos, porém com suporte mais limitado para recorrência nativa via Pix no modelo tradicional brasileiro (melhor quando foco principal for cartão).

> **Recomendação arquitetural**: implementar uma camada de abstração (`PaymentGatewayProvider` em `src/worker/domains/billing/provider.ts`) desacoplada das rotas, no mesmo padrão já adotado em `WhatsAppProvider.ts` / `TelegramProvider.ts`, evitando lock-in com um único gateway.

---

## 4. Requisitos de Banco de Dados (Cloudflare D1)

Criar uma nova migration (ex.: `migrations/0003_billing.sql`) seguindo as convenções atuais de `migrations/0001_initial.sql`:

### 4.1 Novas Tabelas Sugeridas

1. **`Subscriptions`**
   - `Id TEXT PRIMARY KEY`
   - `TenantId TEXT NOT NULL UNIQUE` (`FOREIGN KEY (TenantId) REFERENCES Tenants(Id) ON DELETE CASCADE`)
   - `PlanKey TEXT NOT NULL DEFAULT 'pro_monthly'`
   - `Provider TEXT NOT NULL DEFAULT 'manual'` (`'asaas' | 'mercadopago' | 'stripe' | 'manual'`)
   - `ProviderCustomerId TEXT`
   - `ProviderSubscriptionId TEXT UNIQUE`
   - `Status TEXT NOT NULL CHECK (Status IN ('trialing', 'active', 'past_due', 'suspended', 'canceled', 'exempt'))`
   - `PriceInCents INTEGER NOT NULL DEFAULT 5000`
   - `TrialStartsAt TEXT NOT NULL`
   - `TrialEndsAt TEXT NOT NULL`
   - `CurrentPeriodStart TEXT`
   - `CurrentPeriodEnd TEXT`
   - `GracePeriodEndsAt TEXT`
   - `CancelAtPeriodEnd INTEGER NOT NULL DEFAULT 0 CHECK (CancelAtPeriodEnd IN (0, 1))`
   - `CanceledAt TEXT`
   - `CreatedAt TEXT NOT NULL`, `UpdatedAt TEXT NOT NULL`

2. **`BillingInvoices`**
   - `Id TEXT PRIMARY KEY`
   - `TenantId TEXT NOT NULL`
   - `SubscriptionId TEXT NOT NULL`
   - `ProviderInvoiceId TEXT UNIQUE`
   - `AmountInCents INTEGER NOT NULL`
   - `PaymentMethod TEXT CHECK (PaymentMethod IN ('credit_card', 'pix', 'boleto', 'manual'))`
   - `Status TEXT NOT NULL CHECK (Status IN ('pending', 'paid', 'failed', 'refunded', 'canceled'))`
   - `DueDate TEXT NOT NULL`
   - `PaidAt TEXT`
   - `InvoiceUrl TEXT NOT NULL DEFAULT ''`
   - `PixCopyPaste TEXT NOT NULL DEFAULT ''`
   - `CreatedAt TEXT NOT NULL`, `UpdatedAt TEXT NOT NULL`
   - Chaves estrangeiras compostas `(TenantId, SubscriptionId)` seguindo o padrão multi-tenant do projeto.

3. **`BillingWebhookEvents`** (controle de idempotência)
   - `Id TEXT PRIMARY KEY`
   - `Provider TEXT NOT NULL`
   - `ProviderEventId TEXT NOT NULL`
   - `EventType TEXT NOT NULL`
   - `PayloadHash TEXT NOT NULL`
   - `ProcessedAt TEXT NOT NULL`
   - `UNIQUE (Provider, ProviderEventId)`

4. **Novas chaves em `PlatformSettings`**
   - `billing_enabled` (`'true'` / `'false'`)
   - `billing_trial_days` (`'30'`)
   - `billing_monthly_price_cents` (`'5000'`)
   - `billing_grace_days` (`'5'`)

---

## 5. Requisitos de Backend (Hono + Cloudflare Workers/Pages)

### 5.1 Novas Variáveis e Segredos (`src/worker/types.ts`)
Adicionar ao `WorkerBindings` (configurados via `wrangler secret put` em produção):
- `PAYMENT_PROVIDER?: string`
- `PAYMENT_API_KEY?: string`
- `PAYMENT_WEBHOOK_SECRET?: string`
- `PAYMENT_ENV?: 'sandbox' | 'production'`
- `EMAIL_API_KEY?: string` (opcional para envios de aviso de vencimento/recibo)

### 5.2 Novos Endpoints REST
- **Área do Dono (`/api/admin/billing/*`)** — protegida por `csrfOriginCheck` e `requireTenantAccess(['owner', 'admin'])`:
  - `GET /api/admin/billing/status`: retorna plano, status, datas de trial/renovação, dias restantes e flags de bloqueio.
  - `GET /api/admin/billing/invoices`: lista últimas faturas do tenant.
  - `POST /api/admin/billing/checkout`: recebe método escolhido (`credit_card` ou `pix`), cria cliente/assinatura no gateway se ainda não existir e retorna URL de checkout ou QR Code/Copia-e-Cola Pix. (Restrito a `role === 'owner'`).
  - `POST /api/admin/billing/cancel`: marca cancelamento ao final do ciclo ou imediato junto ao gateway.
  - `POST /api/admin/billing/reactivate`: reativa assinatura cancelada/suspensa gerando nova cobrança.
- **Webhook Público (`/api/webhooks/payments/:provider`)** — em `src/worker/index.ts`, **fora** de `csrfOriginCheck`:
  - Validar obrigatoriamente a assinatura criptográfica/token enviado pelo gateway; rejeitar com `401` se inválido.
  - Consultar `BillingWebhookEvents(Provider, ProviderEventId)` para garantir **idempotência** (retornar `200` sem reaplicar caso o gateway reenvie o mesmo evento).
  - Atualizar atomicamente (`DB.batch`) `Subscriptions`, `BillingInvoices` e `Tenants.Status` quando aplicável.
  - Registrar falhas ou divergências em `SystemLogs`.

### 5.3 Middleware de Verificação e Rotina de Expiração
- **Middleware `requireActiveSubscription`** em `src/worker/middleware/auth.ts`:
  - Executado após `requireTenantAccess` nas rotas operacionais de `/api/admin/*` (exceto `/api/admin/billing/*` e endpoints de leitura necessários para exibir o painel).
  - **Avaliação em tempo real (Lazy Check)**: se `Status === 'trialing'` e `now > TrialEndsAt`, ou `Status === 'active'`/`'past_due'` e `now > GracePeriodEndsAt`, atualizar o status no D1 imediatamente mesmo que um cron ainda não tenha rodado.
- **Atenção específica para Cloudflare Pages**:
  - Como o deploy atual usa **Cloudflare Pages** (`_worker.js` gerado via `scripts/build-pages.mjs`), Pages **não executa `scheduled()` (Cron Triggers)** diretamente.
  - Para tarefas proativas (enviar aviso de fim de trial 7 dias antes, gerar fatura Pix antes do vencimento e suspender inativos mesmo sem acesso ao admin), será necessário **um Worker auxiliar leve com `cron` diário** ligado ao mesmo banco D1 `barbearia-saas-db`, além da verificação *lazy* no middleware.

---

## 6. Requisitos de Frontend (React + Vite)

- **Landing Page (`src/web/pages/LandingPage.tsx`)**:
  - Adicionar seção clara de preço: **1 mês grátis para testar**, depois **R$ 50,00/mês**, sem taxa por agendamento e com cancelamento a qualquer momento.
- **Onboarding (`src/web/pages/OnboardingWizard.tsx`)**:
  - Informar explicitamente na conclusão do wizard que os **30 dias gratuitos** começaram a contar e exibir a data prevista da primeira mensalidade.
- **Nova página `AdminBillingPage.tsx`** em `/admin/billing`:
  - Card resumo do plano atual, barra/contador de dias restantes do trial, escolha de pagamento (Cartão ou Pix), exibição do QR Code Pix com botão "Copiar código" e tabela de faturas.
  - Estado de redirecionamento/aviso quando outra aba administrativa retornar `402 SUBSCRIPTION_REQUIRED`.
- **Auth Context (`src/web/lib/authContext.tsx`) e `AdminLayout.tsx`**:
  - Incluir resumo da assinatura (`subscriptionStatus`, `trialEndsAt`, `currentPeriodEnd`) na resposta de `GET /api/auth/me` ou endpoint dedicado para renderizar o banner de alerta sem flash de conteúdo.

---

## 7. Requisitos Não-Funcionais (Segurança, Legal e Observabilidade)

1. **Segurança & PCI-DSS**:
   - Proibido trafegar ou persistir número completo de cartão, validade ou CVV no backend/D1. Usar apenas checkout hospedado ou tokenização via SDK oficial do gateway no navegador.
   - Armazenar chaves de API somente em Secrets da Cloudflare, nunca no código ou no bundle cliente (`VITE_*`).
2. **Isolamento Multi-Tenant**:
   - Toda consulta de assinatura ou fatura autenticada deve usar o `tenantId` resolvido da sessão (`Sessions`/`TenantUsers`), nunca um `tenantId` vindo do corpo da requisição.
   - Webhooks devem mapear `ProviderSubscriptionId` / `ProviderCustomerId` de volta para um único `TenantId` validado no banco.
3. **Resiliência e Auditoria**:
   - Todas as mudanças de estado (`trialing -> active`, `active -> past_due`, `past_due -> suspended`) e erros de webhook devem gerar entrada em `SystemLogs` com `Source = 'billing'`.
   - Rate limit aplicado em `POST /api/admin/billing/checkout` para evitar criação abusiva de cobranças repetidas no gateway.
4. **Conformidade Legal (`src/web/pages/LegalPages.tsx`)**:
   - Atualizar `/termos` e `/privacidade` detalhando: duração do trial (30 dias), valor da assinatura (R$ 50,00/mês), política de cancelamento/reembolso, retenção de dados após inadimplência e prazo de exclusão caso a conta seja encerrada.

---

## 8. Critérios de Aceite e Plano de Testes (`tests/platform.test.ts`)

Antes de liberar em produção (testando inicialmente em ambiente `sandbox` do gateway), validar automatizadamente no Vitest:
- [ ] Cadastro + onboarding cria assinatura `trialing` com diferença exata de 30 dias entre `TrialStartsAt` e `TrialEndsAt`.
- [ ] Durante o trial, site público (`/api/public/:slug`), agendamentos e `/api/admin/*` retornam `200`.
- [ ] Ao simular `TrialEndsAt` expirado sem pagamento (após carência), rotas administrativas operacionais retornam `402`, `/api/public/:slug` retorna `404` e webhooks do chatbot não respondem ao cliente final, enquanto `/api/admin/billing/*` permanece acessível.
- [ ] Webhook com assinatura inválida retorna `401` e não altera a assinatura.
- [ ] Webhook válido de pagamento confirmado (`R$ 50,00`) atualiza a fatura para `paid`, a assinatura para `active`, restaura `Tenants.Status = 'active'` e renova `CurrentPeriodEnd`.
- [ ] Reenvio idêntico do mesmo evento de webhook (`ProviderEventId` repetido) é ignorado com segurança (`200`), sem duplicar fatura ou somar mais 30 dias indevidamente.
