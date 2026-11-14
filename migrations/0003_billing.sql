-- Migration 0003: SaaS Billing, 30-day Free Trial, 5-day Grace Period, Pix (Manual & Mercado Pago Ready)
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS Subscriptions (
  Id TEXT PRIMARY KEY,
  TenantId TEXT NOT NULL UNIQUE,
  PlanKey TEXT NOT NULL DEFAULT 'pro_monthly',
  Provider TEXT NOT NULL DEFAULT 'manual_pix' CHECK (Provider IN ('manual_pix', 'mercadopago')),
  ProviderCustomerId TEXT,
  ProviderSubscriptionId TEXT,
  Status TEXT NOT NULL CHECK (Status IN ('trialing', 'active', 'past_due', 'suspended', 'canceled', 'exempt')),
  PriceInCents INTEGER NOT NULL DEFAULT 5000 CHECK (PriceInCents >= 0),
  TrialStartsAt TEXT NOT NULL,
  TrialEndsAt TEXT NOT NULL,
  CurrentPeriodStart TEXT,
  CurrentPeriodEnd TEXT,
  GracePeriodEndsAt TEXT,
  CanceledAt TEXT,
  CreatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UpdatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (TenantId) REFERENCES Tenants(Id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS BillingInvoices (
  Id TEXT PRIMARY KEY,
  TenantId TEXT NOT NULL,
  SubscriptionId TEXT NOT NULL,
  Provider TEXT NOT NULL DEFAULT 'manual_pix' CHECK (Provider IN ('manual_pix', 'mercadopago')),
  ProviderInvoiceId TEXT UNIQUE,
  AmountInCents INTEGER NOT NULL CHECK (AmountInCents >= 0),
  PaymentMethod TEXT NOT NULL DEFAULT 'pix' CHECK (PaymentMethod IN ('pix', 'credit_card', 'manual')),
  Status TEXT NOT NULL CHECK (Status IN ('pending', 'awaiting_confirmation', 'paid', 'failed', 'canceled')),
  DueDate TEXT NOT NULL,
  PaidAt TEXT,
  PaymentNotifiedAt TEXT,
  PayerNote TEXT NOT NULL DEFAULT '',
  PixCopyPaste TEXT NOT NULL DEFAULT '',
  PixQrCodeBase64 TEXT NOT NULL DEFAULT '',
  InvoiceUrl TEXT NOT NULL DEFAULT '',
  CreatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UpdatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (TenantId) REFERENCES Tenants(Id) ON DELETE CASCADE,
  FOREIGN KEY (SubscriptionId) REFERENCES Subscriptions(Id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS BillingWebhookEvents (
  Id TEXT PRIMARY KEY,
  Provider TEXT NOT NULL,
  ProviderEventId TEXT NOT NULL,
  EventType TEXT NOT NULL,
  PayloadHash TEXT NOT NULL,
  ProcessedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (Provider, ProviderEventId)
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant_status ON Subscriptions(TenantId, Status);
CREATE INDEX IF NOT EXISTS idx_billing_invoices_tenant_created ON BillingInvoices(TenantId, CreatedAt DESC);
CREATE INDEX IF NOT EXISTS idx_billing_invoices_status ON BillingInvoices(Status, CreatedAt DESC);

INSERT OR IGNORE INTO PlatformSettings (SettingKey, SettingValue) VALUES
  ('billing_payment_provider', 'manual_pix'),
  ('billing_trial_days', '30'),
  ('billing_grace_days', '5'),
  ('billing_monthly_price_cents', '5000'),
  ('billing_pix_key', ''),
  ('billing_pix_receiver_name', 'BarberSaaS'),
  ('billing_pix_receiver_city', 'SAO PAULO');

-- Barbearias já existentes na plataforma entram automaticamente como isentas (cortesia)
INSERT OR IGNORE INTO Subscriptions (
  Id, TenantId, PlanKey, Provider, Status, PriceInCents, TrialStartsAt, TrialEndsAt
)
SELECT
  'sub_exempt_' || Id,
  Id,
  'pro_monthly',
  'manual_pix',
  'exempt',
  5000,
  CreatedAt,
  CreatedAt
FROM Tenants;
