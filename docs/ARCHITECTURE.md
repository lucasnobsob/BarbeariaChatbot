# Arquitetura Técnica Multi-Tenant — BarberSaaS

## 1. Visão Arquitetural

```text
Navegador / Telegram / Meta Webhook
               │
               ▼
   Cloudflare Edge + Workers Static Assets
               │
   ┌───────────┴───────────┐
   │ Static Assets (SPA)   │  -> 0 invocações de Worker para JS/CSS/imagens do bundle
   └───────────────────────┘
   │ Worker (Hono + TS)    │  -> /api/*, /media/*, /b/:slug (injeção SEO), /sitemap.xml
   └───────────┬───────────┘
               │
     ┌─────────┼─────────┐
     ▼         ▼         ▼
 Cloudflare  Cloudflare  Turnstile /
    D1          R2       Bot APIs
```

## 2. Estratégia de Isolamento Multi-Tenant

1. **Resolução Segura do `TenantId`:**
   - Rotas autenticadas (`/api/admin/*`, `/api/admin/media/*`, `/api/admin/chatbot/*`) **ignoram** qualquer `tenantId` enviado pelo frontend. O middleware `resolveAuth` lê o cookie `HttpOnly` de sessão, valida `TokenHash` em `Sessions`, e obtém `(UserId, TenantId, Role)` diretamente do banco via `TenantUsers`.
   - Rotas públicas (`/api/public/:slug/*`) resolvem o estabelecimento apenas por `Tenants.Slug` com `Status = 'active'`.
   - Webhooks do chatbot usam `TenantResolver` verificando criptograficamente `X-Telegram-Bot-Api-Secret-Token` (Telegram) ou `X-Hub-Signature-256` HMAC-SHA256 (WhatsApp).
2. **Integridade Referencial Composta no D1:**
   - Tabelas filhas (`Services`, `Professionals`, `ProfessionalServices`, `Appointments`, `Customers`, `ChatMessages`, `NotificationLogs`) possuem `UNIQUE (TenantId, Id)` e chaves estrangeiras compostas `FOREIGN KEY (TenantId, XId) REFERENCES Tabela(TenantId, Id)`.
   - Isso impede no próprio motor SQLite que um agendamento ou vínculo associe serviços, profissionais ou clientes pertencentes a outro estabelecimento.
3. **Isolamento de Mídia no R2:**
   - Todos os uploads são gravados sob o prefixo `tenants/{tenantId}/{folder}/{assetId}.{ext}` e indexados na tabela `MediaAssets(TenantId, ObjectKey)`.
   - Exclusões validam `WHERE TenantId = ? AND ObjectKey = ?` antes de remover do bucket R2.
4. **Criptografia de Segredos por Tenant:**
   - Tokens do Telegram e credenciais da Meta são cifrados com `AES-GCM` (`v1:<iv>:<cipher>`) usando `ENCRYPTION_KEY` antes de persistir em `ChatbotConfigurations.ConfigurationJson`, e nunca são retornados em texto plano para o cliente.

## 3. Organização de Diretórios

- `migrations/` — Migrations SQL versionadas do D1 (`0001_initial.sql`).
- `seeds/` — Scripts SQL opcionais de demonstração (`demo.sql`).
- `src/shared/` — Contratos TypeScript e schemas Zod compartilhados (`types.ts`, `schemas.ts`).
- `src/worker/` — API REST modularizada por domínio (`auth`, `onboarding`, `public`, `admin`, `media`, `scheduling`, `chatbot`, `superadmin`, `seo`).
- `src/web/` — SPA React + Tailwind CSS + React Router + React Hook Form (`pages/`, `components/`, `lib/`).
- `tests/` — Suíte automatizada Vitest executando dentro do runtime Cloudflare Workers com D1 e R2 reais.
