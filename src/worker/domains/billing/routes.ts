import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '@worker/types';
import { requireTenantAccess } from '@worker/middleware/auth';
import { sha256Hex } from '@worker/lib/crypto';
import { generateId } from '@worker/lib/crypto';
import { logSystemEvent } from '@worker/lib/logger';
import {
  activatePaidBillingPeriod,
  createOrReuseOpenInvoice,
  ensureTrialSubscriptionForTenant,
  evaluateAndSyncSubscription,
  getBillingConfig,
  mapInvoiceRow,
  notifyManualInvoicePayment
} from './service';
import { MercadoPagoPixProvider, resolvePaymentProvider } from './provider';

export const billingAdminRoutes = new Hono<AppEnv>();

billingAdminRoutes.use('*', requireTenantAccess());

billingAdminRoutes.get('/status', async (c) => {
  const tenantId = c.get('tenantId')!;
  const subscription =
    (await evaluateAndSyncSubscription(c.env.DB, tenantId)) ||
    (await ensureTrialSubscriptionForTenant(c.env.DB, tenantId));

  const config = await getBillingConfig(c.env.DB);
  const provider = resolvePaymentProvider(config.provider, c.env);

  const openInvoiceRow = await c.env.DB.prepare(
    `SELECT * FROM BillingInvoices
     WHERE TenantId = ? AND Status IN ('pending', 'awaiting_confirmation')
     ORDER BY CreatedAt DESC
     LIMIT 1`
  )
    .bind(tenantId)
    .first<any>();

  const effectivePixKey = config.pixKey || c.env.PIX_RECEIVER_KEY || '';

  return c.json({
    subscription,
    config: {
      provider: provider.name,
      monthlyPriceCents: config.monthlyPriceCents,
      trialDays: config.trialDays,
      graceDays: config.graceDays,
      pixConfigured:
        provider.name === 'mercadopago' ? Boolean(c.env.MERCADOPAGO_ACCESS_TOKEN) : Boolean(effectivePixKey.trim()),
      pixKey: provider.name === 'manual_pix' ? effectivePixKey : undefined,
      pixReceiverName:
        provider.name === 'manual_pix'
          ? config.pixReceiverName || c.env.PIX_RECEIVER_NAME || 'BarberSaaS'
          : undefined
    },
    openInvoice: openInvoiceRow ? mapInvoiceRow(openInvoiceRow) : null
  });
});

billingAdminRoutes.get('/invoices', async (c) => {
  const tenantId = c.get('tenantId')!;
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM BillingInvoices WHERE TenantId = ? ORDER BY CreatedAt DESC LIMIT 50`
  )
    .bind(tenantId)
    .all<any>();

  return c.json({
    invoices: results.map(mapInvoiceRow)
  });
});

billingAdminRoutes.post(
  '/checkout',
  requireTenantAccess(['owner', 'admin']),
  async (c) => {
    const tenantId = c.get('tenantId')!;
    const user = c.get('user')!;
    const tenant = await c.env.DB.prepare(
      `SELECT Name FROM Tenants WHERE Id = ?`
    )
      .bind(tenantId)
      .first<{ Name: string }>();

    const origin = new URL(c.req.url).origin;
    try {
      const invoice = await createOrReuseOpenInvoice({
        db: c.env.DB,
        env: c.env,
        tenantId,
        tenantName: tenant?.Name || 'Barbearia',
        payerEmail: user.email,
        webhookUrl: `${origin}/api/webhooks/payments/mercadopago`
      });
      return c.json({ invoice }, 201);
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : 'Falha ao gerar cobrança Pix' },
        400
      );
    }
  }
);

const notifyPaymentSchema = z.object({
  payerNote: z.string().trim().max(300).default('')
});

billingAdminRoutes.post(
  '/invoices/:id/notify-payment',
  requireTenantAccess(['owner', 'admin']),
  async (c) => {
    const tenantId = c.get('tenantId')!;
    const invoiceId = c.req.param('id');
    if (!invoiceId) {
      return c.json({ error: 'Fatura não informada' }, 400);
    }
    const body = await c.req.json().catch(() => ({}));
    const parsed = notifyPaymentSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Observação inválida' }, 400);
    }

    const updated = await notifyManualInvoicePayment({
      db: c.env.DB,
      tenantId,
      invoiceId,
      payerNote: parsed.data.payerNote
    });

    if (!updated) {
      return c.json({ error: 'Fatura não encontrada' }, 404);
    }

    return c.json({ invoice: updated });
  }
);

// ─── Webhooks de Pagamento (Mercado Pago pronto para ativação futura) ─────────
export const billingWebhookRoutes = new Hono<AppEnv>();

billingWebhookRoutes.post('/:provider', async (c) => {
  const providerName = c.req.param('provider');
  if (providerName !== 'mercadopago') {
    return c.json({ error: 'Provedor de pagamento não suportado para webhook' }, 400);
  }

  const rawBody = await c.req.text();
  const provider = new MercadoPagoPixProvider();
  const event = await provider.verifyWebhook(c.req.raw, rawBody, c.env);

  if (!event) {
    await logSystemEvent(c.env.DB, {
      level: 'warn',
      source: 'billing.webhook.mercadopago',
      message: 'Webhook Mercado Pago rejeitado por assinatura inválida ou payload incompleto'
    });
    return c.json({ error: 'Assinatura do webhook inválida' }, 401);
  }

  const alreadyProcessed = await c.env.DB.prepare(
    `SELECT Id FROM BillingWebhookEvents WHERE Provider = ? AND ProviderEventId = ?`
  )
    .bind(event.provider, event.providerEventId)
    .first<{ Id: string }>();

  if (alreadyProcessed) {
    return c.json({ ok: true, idempotent: true });
  }

  const invoice = await c.env.DB.prepare(
    `SELECT Id, TenantId, AmountInCents, Status FROM BillingInvoices WHERE Id = ?`
  )
    .bind(event.invoiceId)
    .first<{ Id: string; TenantId: string; AmountInCents: number; Status: string }>();

  if (!invoice) {
    return c.json({ ok: true, ignored: 'invoice_not_found' });
  }

  const payloadHash = await sha256Hex(rawBody);
  await c.env.DB.prepare(
    `INSERT OR IGNORE INTO BillingWebhookEvents (Id, Provider, ProviderEventId, EventType, PayloadHash)
     VALUES (?, ?, ?, ?, ?)`
  )
    .bind(generateId(), event.provider, event.providerEventId, event.eventType, payloadHash)
    .run();

  if (event.status === 'approved' && invoice.Status !== 'paid') {
    await activatePaidBillingPeriod({
      db: c.env.DB,
      tenantId: invoice.TenantId,
      invoiceId: invoice.Id,
      actorLabel: 'webhook:mercadopago'
    });
  } else if (event.status === 'rejected' && invoice.Status !== 'paid') {
    await c.env.DB.prepare(
      `UPDATE BillingInvoices SET Status = 'failed', UpdatedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE Id = ?`
    )
      .bind(invoice.Id)
      .run();
  }

  return c.json({ ok: true });
});
