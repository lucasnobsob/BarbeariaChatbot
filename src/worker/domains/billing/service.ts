import type {
  BillingInvoiceItem,
  BillingInvoiceStatus,
  BillingProviderType,
  SubscriptionStatus,
  SubscriptionSummary
} from '@shared/types';
import { generateId } from '@worker/lib/crypto';
import { logSystemEvent } from '@worker/lib/logger';
import type { WorkerBindings } from '@worker/types';
import {
  resolvePaymentProvider,
  type BillingRuntimeConfig
} from './provider';

const DAY_MS = 86_400_000;

interface SubscriptionRow {
  Id: string;
  TenantId: string;
  PlanKey: string;
  Provider: BillingProviderType;
  ProviderCustomerId: string | null;
  ProviderSubscriptionId: string | null;
  Status: SubscriptionStatus;
  PriceInCents: number;
  TrialStartsAt: string;
  TrialEndsAt: string;
  CurrentPeriodStart: string | null;
  CurrentPeriodEnd: string | null;
  GracePeriodEndsAt: string | null;
  CanceledAt: string | null;
}

interface InvoiceRow {
  Id: string;
  TenantId: string;
  SubscriptionId: string;
  Provider: BillingProviderType;
  ProviderInvoiceId: string | null;
  AmountInCents: number;
  PaymentMethod: 'pix' | 'credit_card' | 'manual';
  Status: BillingInvoiceStatus;
  DueDate: string;
  PaidAt: string | null;
  PaymentNotifiedAt: string | null;
  PayerNote: string;
  PixCopyPaste: string;
  PixQrCodeBase64: string;
  InvoiceUrl: string;
  CreatedAt: string;
  UpdatedAt: string;
}

function parseIntSetting(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

export async function getBillingConfig(db: D1Database): Promise<BillingRuntimeConfig> {
  const { results } = await db
    .prepare(
      `SELECT SettingKey, SettingValue
       FROM PlatformSettings
       WHERE SettingKey IN (
         'billing_payment_provider',
         'billing_trial_days',
         'billing_grace_days',
         'billing_monthly_price_cents',
         'billing_pix_key',
         'billing_pix_receiver_name',
         'billing_pix_receiver_city'
       )`
    )
    .all<{ SettingKey: string; SettingValue: string }>();

  const map: Record<string, string> = {};
  for (const row of results) {
    map[row.SettingKey] = row.SettingValue;
  }

  return {
    provider: map.billing_payment_provider === 'mercadopago' ? 'mercadopago' : 'manual_pix',
    trialDays: parseIntSetting(map.billing_trial_days, 30),
    graceDays: parseIntSetting(map.billing_grace_days, 5),
    monthlyPriceCents: parseIntSetting(map.billing_monthly_price_cents, 5000),
    pixKey: map.billing_pix_key || '',
    pixReceiverName: map.billing_pix_receiver_name || 'BarberSaaS',
    pixReceiverCity: map.billing_pix_receiver_city || 'SAO PAULO'
  };
}

function ceilDaysRemaining(targetIso: string | null, nowMs: number): number | null {
  if (!targetIso) return null;
  const targetMs = Date.parse(targetIso);
  if (!Number.isFinite(targetMs)) return null;
  const diff = targetMs - nowMs;
  if (diff <= 0) return 0;
  return Math.ceil(diff / DAY_MS);
}

export function mapInvoiceRow(row: InvoiceRow): BillingInvoiceItem {
  return {
    id: row.Id,
    tenantId: row.TenantId,
    subscriptionId: row.SubscriptionId,
    provider: row.Provider,
    providerInvoiceId: row.ProviderInvoiceId,
    amountInCents: row.AmountInCents,
    paymentMethod: row.PaymentMethod,
    status: row.Status,
    dueDate: row.DueDate,
    paidAt: row.PaidAt,
    paymentNotifiedAt: row.PaymentNotifiedAt,
    payerNote: row.PayerNote,
    pixCopyPaste: row.PixCopyPaste,
    pixQrCodeBase64: row.PixQrCodeBase64,
    invoiceUrl: row.InvoiceUrl,
    createdAt: row.CreatedAt,
    updatedAt: row.UpdatedAt
  };
}

function toSummary(row: SubscriptionRow, nowMs: number): SubscriptionSummary {
  const isBlocked =
    row.Status === 'suspended' ||
    (row.Status === 'canceled' &&
      (!row.CurrentPeriodEnd || Date.parse(row.CurrentPeriodEnd) <= nowMs));

  const referenceDate =
    row.Status === 'trialing'
      ? row.TrialEndsAt
      : row.Status === 'active' || row.Status === 'canceled'
        ? row.CurrentPeriodEnd
        : null;

  return {
    id: row.Id,
    tenantId: row.TenantId,
    status: row.Status,
    provider: row.Provider,
    priceInCents: row.PriceInCents,
    trialStartsAt: row.TrialStartsAt,
    trialEndsAt: row.TrialEndsAt,
    currentPeriodStart: row.CurrentPeriodStart,
    currentPeriodEnd: row.CurrentPeriodEnd,
    gracePeriodEndsAt: row.GracePeriodEndsAt,
    daysRemaining: ceilDaysRemaining(referenceDate, nowMs),
    graceDaysRemaining:
      row.Status === 'past_due' ? ceilDaysRemaining(row.GracePeriodEndsAt, nowMs) : null,
    isBlocked,
    canOperate: !isBlocked
  };
}

/**
 * Ensures a newly created or published tenant starts its one-time free trial.
 */
export async function ensureTrialSubscriptionForTenant(
  db: D1Database,
  tenantId: string
): Promise<SubscriptionSummary> {
  const existing = await db
    .prepare(`SELECT * FROM Subscriptions WHERE TenantId = ?`)
    .bind(tenantId)
    .first<SubscriptionRow>();
  if (existing) {
    return (await evaluateAndSyncSubscription(db, tenantId))!;
  }

  const config = await getBillingConfig(db);
  const nowMs = Date.now();
  const trialStartsAt = new Date(nowMs).toISOString();
  const trialEndsAt = new Date(nowMs + config.trialDays * DAY_MS).toISOString();
  const id = generateId();

  await db
    .prepare(
      `INSERT OR IGNORE INTO Subscriptions (
         Id, TenantId, PlanKey, Provider, Status, PriceInCents, TrialStartsAt, TrialEndsAt
       ) VALUES (?, ?, 'pro_monthly', ?, 'trialing', ?, ?, ?)`
    )
    .bind(
      id,
      tenantId,
      config.provider,
      config.monthlyPriceCents,
      trialStartsAt,
      trialEndsAt
    )
    .run();

  return (await evaluateAndSyncSubscription(db, tenantId, nowMs))!;
}

/**
 * Evaluates subscription deadlines in real time and persists transitions
 * (trialing/active -> past_due -> suspended) without requiring an external cron job.
 */
export async function evaluateAndSyncSubscription(
  db: D1Database,
  tenantId: string,
  nowMs = Date.now()
): Promise<SubscriptionSummary | null> {
  const row = await db
    .prepare(`SELECT * FROM Subscriptions WHERE TenantId = ?`)
    .bind(tenantId)
    .first<SubscriptionRow>();

  if (!row) return null;
  if (row.Status === 'exempt' || row.Status === 'suspended') {
    return toSummary(row, nowMs);
  }

  const config = await getBillingConfig(db);
  const graceMs = config.graceDays * DAY_MS;

  let nextStatus: SubscriptionStatus = row.Status;
  let nextGraceEndsAt: string | null = row.GracePeriodEndsAt;

  if (row.Status === 'trialing') {
    const trialEndMs = Date.parse(row.TrialEndsAt);
    if (Number.isFinite(trialEndMs) && nowMs > trialEndMs) {
      const calculatedGraceEnd = trialEndMs + graceMs;
      nextGraceEndsAt = new Date(calculatedGraceEnd).toISOString();
      nextStatus = nowMs <= calculatedGraceEnd ? 'past_due' : 'suspended';
    }
  } else if (row.Status === 'active') {
    const periodEndMs = row.CurrentPeriodEnd ? Date.parse(row.CurrentPeriodEnd) : NaN;
    if (Number.isFinite(periodEndMs) && nowMs > periodEndMs) {
      const calculatedGraceEnd = periodEndMs + graceMs;
      nextGraceEndsAt = new Date(calculatedGraceEnd).toISOString();
      nextStatus = nowMs <= calculatedGraceEnd ? 'past_due' : 'suspended';
    }
  } else if (row.Status === 'past_due') {
    const graceEndMs = row.GracePeriodEndsAt ? Date.parse(row.GracePeriodEndsAt) : NaN;
    if (!Number.isFinite(graceEndMs) || nowMs > graceEndMs) {
      nextStatus = 'suspended';
    }
  } else if (row.Status === 'canceled') {
    const periodEndMs = row.CurrentPeriodEnd ? Date.parse(row.CurrentPeriodEnd) : NaN;
    if (!Number.isFinite(periodEndMs) || nowMs > periodEndMs) {
      nextStatus = 'suspended';
    }
  }

  if (nextStatus !== row.Status || nextGraceEndsAt !== row.GracePeriodEndsAt) {
    await db
      .prepare(
        `UPDATE Subscriptions
         SET Status = ?, GracePeriodEndsAt = ?, UpdatedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE Id = ?`
      )
      .bind(nextStatus, nextGraceEndsAt, row.Id)
      .run();

    await logSystemEvent(db, {
      tenantId,
      level: nextStatus === 'suspended' ? 'warn' : 'info',
      source: 'billing.subscription',
      message: `Assinatura atualizada automaticamente de ${row.Status} para ${nextStatus}`
    });

    row.Status = nextStatus;
    row.GracePeriodEndsAt = nextGraceEndsAt;
  }

  return toSummary(row, nowMs);
}

export async function isTenantSubscriptionOperational(
  db: D1Database,
  tenantId: string
): Promise<boolean> {
  const summary = await evaluateAndSyncSubscription(db, tenantId);
  if (!summary) return true;
  return summary.canOperate;
}

export async function createOrReuseOpenInvoice(params: {
  db: D1Database;
  env: WorkerBindings;
  tenantId: string;
  tenantName: string;
  payerEmail: string;
  webhookUrl: string;
}): Promise<BillingInvoiceItem> {
  const { db, env, tenantId, tenantName, payerEmail, webhookUrl } = params;
  const subscription = await ensureTrialSubscriptionForTenant(db, tenantId);
  const config = await getBillingConfig(db);
  const provider = resolvePaymentProvider(config.provider, env);

  const openRow = await db
    .prepare(
      `SELECT * FROM BillingInvoices
       WHERE TenantId = ?
         AND Provider = ?
         AND Status IN ('pending', 'awaiting_confirmation')
         AND AmountInCents = ?
         AND PixCopyPaste != ''
       ORDER BY CreatedAt DESC
       LIMIT 1`
    )
    .bind(tenantId, provider.name, config.monthlyPriceCents)
    .first<InvoiceRow>();

  if (openRow) {
    return mapInvoiceRow(openRow);
  }

  const invoiceId = generateId();
  const dueDateIso = new Date(Date.now() + 3 * DAY_MS).toISOString();
  const charge = await provider.createPixCharge({
    invoiceId,
    tenantId,
    tenantName,
    payerEmail,
    amountInCents: config.monthlyPriceCents,
    dueDateIso,
    webhookUrl,
    config,
    env
  });

  await db
    .prepare(
      `INSERT INTO BillingInvoices (
         Id, TenantId, SubscriptionId, Provider, ProviderInvoiceId, AmountInCents,
         PaymentMethod, Status, DueDate, PixCopyPaste, PixQrCodeBase64, InvoiceUrl
       ) VALUES (?, ?, ?, ?, ?, ?, 'pix', 'pending', ?, ?, ?, ?)`
    )
    .bind(
      invoiceId,
      tenantId,
      subscription.id,
      charge.provider,
      charge.providerInvoiceId,
      config.monthlyPriceCents,
      dueDateIso,
      charge.pixCopyPaste,
      charge.pixQrCodeBase64,
      charge.invoiceUrl
    )
    .run();

  const created = await db
    .prepare(`SELECT * FROM BillingInvoices WHERE Id = ?`)
    .bind(invoiceId)
    .first<InvoiceRow>();

  return mapInvoiceRow(created!);
}

export async function notifyManualInvoicePayment(params: {
  db: D1Database;
  tenantId: string;
  invoiceId: string;
  payerNote: string;
}): Promise<BillingInvoiceItem | null> {
  const invoice = await params.db
    .prepare(`SELECT * FROM BillingInvoices WHERE Id = ? AND TenantId = ?`)
    .bind(params.invoiceId, params.tenantId)
    .first<InvoiceRow>();

  if (!invoice) return null;
  if (invoice.Status === 'paid') {
    return mapInvoiceRow(invoice);
  }

  const nowIso = new Date().toISOString();
  await params.db
    .prepare(
      `UPDATE BillingInvoices
       SET Status = 'awaiting_confirmation',
           PaymentNotifiedAt = ?,
           PayerNote = ?,
           UpdatedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE Id = ? AND TenantId = ?`
    )
    .bind(nowIso, params.payerNote.trim().slice(0, 300), invoice.Id, params.tenantId)
    .run();

  await logSystemEvent(params.db, {
    tenantId: params.tenantId,
    level: 'info',
    source: 'billing.manual_pix',
    message: `Estabelecimento informou pagamento Pix da fatura ${invoice.Id}`,
    meta: { payerNote: params.payerNote.trim().slice(0, 300) }
  });

  const updated = await params.db
    .prepare(`SELECT * FROM BillingInvoices WHERE Id = ?`)
    .bind(invoice.Id)
    .first<InvoiceRow>();
  return mapInvoiceRow(updated!);
}

/**
 * Shared activation path called by both Superadmin manual confirmation
 * and Mercado Pago automatic webhook confirmation.
 */
export async function activatePaidBillingPeriod(params: {
  db: D1Database;
  tenantId: string;
  invoiceId?: string;
  actorLabel: string;
  daysToGrant?: number;
}): Promise<SubscriptionSummary> {
  const { db, tenantId, invoiceId, actorLabel, daysToGrant = 30 } = params;
  const sub = await ensureTrialSubscriptionForTenant(db, tenantId);
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  const existingEndMs = sub.currentPeriodEnd ? Date.parse(sub.currentPeriodEnd) : NaN;
  const baseStartMs =
    sub.status === 'active' && Number.isFinite(existingEndMs) && existingEndMs > nowMs
      ? existingEndMs
      : nowMs;

  const periodStartIso =
    sub.status === 'active' && sub.currentPeriodStart ? sub.currentPeriodStart : nowIso;
  const periodEndIso = new Date(baseStartMs + daysToGrant * DAY_MS).toISOString();

  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `UPDATE Subscriptions
         SET Status = 'active',
             CurrentPeriodStart = ?,
             CurrentPeriodEnd = ?,
             GracePeriodEndsAt = NULL,
             CanceledAt = NULL,
             UpdatedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE TenantId = ?`
      )
      .bind(periodStartIso, periodEndIso, tenantId),
    db
      .prepare(
        `UPDATE Tenants
         SET Status = CASE WHEN Status = 'inactive' THEN 'active' ELSE Status END,
             UpdatedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE Id = ?`
      )
      .bind(tenantId)
  ];

  if (invoiceId) {
    statements.push(
      db
        .prepare(
          `UPDATE BillingInvoices
           SET Status = 'paid',
               PaidAt = ?,
               UpdatedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE Id = ? AND TenantId = ?`
        )
        .bind(nowIso, invoiceId, tenantId)
    );
  }

  await db.batch(statements);

  await logSystemEvent(db, {
    tenantId,
    level: 'info',
    source: 'billing.activation',
    message: `Pagamento confirmado (${actorLabel}); assinatura liberada até ${periodEndIso.slice(0, 10)}`,
    meta: { invoiceId: invoiceId || null, actorLabel }
  });

  return (await evaluateAndSyncSubscription(db, tenantId, nowMs))!;
}
