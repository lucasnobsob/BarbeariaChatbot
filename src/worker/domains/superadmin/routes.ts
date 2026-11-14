import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '@worker/types';
import { requireSuperAdmin } from '@worker/middleware/auth';
import { logSystemEvent } from '@worker/lib/logger';
import {
  activatePaidBillingPeriod,
  ensureTrialSubscriptionForTenant,
  evaluateAndSyncSubscription
} from '@worker/domains/billing/service';

export const superAdminRoutes = new Hono<AppEnv>();

superAdminRoutes.use('*', requireSuperAdmin);

superAdminRoutes.get('/overview', async (c) => {
  const [
    tenantsRow,
    activeTenantsRow,
    usersRow,
    apptsRow,
    errorsRow,
    subRows,
    pendingConfirmRow
  ] = await Promise.all([
    c.env.DB.prepare(`SELECT COUNT(*) AS Total FROM Tenants`).first<{ Total: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) AS Total FROM Tenants WHERE Status = 'active'`).first<{
      Total: number;
    }>(),
    c.env.DB.prepare(`SELECT COUNT(*) AS Total FROM Users`).first<{ Total: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) AS Total FROM Appointments`).first<{ Total: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) AS Total FROM SystemLogs WHERE Level = 'error'`).first<{
      Total: number;
    }>(),
    c.env.DB.prepare(
      `SELECT Status, COUNT(*) AS Total, SUM(CASE WHEN Status = 'active' THEN PriceInCents ELSE 0 END) AS MrrCents
       FROM Subscriptions GROUP BY Status`
    ).all<{ Status: string; Total: number; MrrCents: number }>(),
    c.env.DB.prepare(
      `SELECT COUNT(*) AS Total FROM BillingInvoices WHERE Status = 'awaiting_confirmation'`
    ).first<{ Total: number }>()
  ]);

  const bySubStatus: Record<string, number> = {};
  let mrrCents = 0;
  for (const r of subRows.results) {
    bySubStatus[r.Status] = r.Total;
    mrrCents += r.MrrCents || 0;
  }

  return c.json({
    stats: {
      totalTenants: tenantsRow?.Total ?? 0,
      activeTenants: activeTenantsRow?.Total ?? 0,
      totalUsers: usersRow?.Total ?? 0,
      totalAppointments: apptsRow?.Total ?? 0,
      totalErrors: errorsRow?.Total ?? 0,
      billing: {
        trialing: bySubStatus.trialing ?? 0,
        active: bySubStatus.active ?? 0,
        pastDue: bySubStatus.past_due ?? 0,
        suspended: bySubStatus.suspended ?? 0,
        exempt: bySubStatus.exempt ?? 0,
        awaitingConfirmation: pendingConfirmRow?.Total ?? 0,
        mrrCents
      }
    }
  });
});

superAdminRoutes.get('/tenants', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT t.Id, t.Name, t.Slug, t.Status, t.CreatedAt, t.UpdatedAt,
            bp.BusinessName, bp.City, bp.State, bp.Phone, bp.Email,
            s.Status AS SubscriptionStatus, s.TrialEndsAt, s.CurrentPeriodEnd, s.GracePeriodEndsAt, s.PriceInCents,
            (SELECT COUNT(*) FROM TenantUsers tu WHERE tu.TenantId = t.Id) AS UserCount,
            (SELECT COUNT(*) FROM Appointments a WHERE a.TenantId = t.Id) AS AppointmentCount
     FROM Tenants t
     LEFT JOIN BusinessProfiles bp ON bp.TenantId = t.Id
     LEFT JOIN Subscriptions s ON s.TenantId = t.Id
     ORDER BY t.CreatedAt DESC`
  ).all();

  return c.json({ tenants: results });
});

superAdminRoutes.patch('/tenants/:id/status', async (c) => {
  const id = c.req.param('id');
  const body = (await c.req.json().catch(() => null)) as { status?: string } | null;
  const parsed = z.enum(['active', 'inactive', 'blocked', 'onboarding']).safeParse(body?.status);
  if (!parsed.success) {
    return c.json({ error: 'Status inválido' }, 400);
  }

  const res = await c.env.DB.prepare(
    `UPDATE Tenants SET Status = ?, UpdatedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE Id = ?`
  )
    .bind(parsed.data, id)
    .run();

  if ((res.meta.changes ?? 0) === 0) {
    return c.json({ error: 'Estabelecimento não encontrado' }, 404);
  }

  await logSystemEvent(c.env.DB, {
    tenantId: id,
    level: 'info',
    source: 'superadmin.tenants',
    message: `Status do estabelecimento alterado para ${parsed.data}`,
    meta: { actorUserId: c.get('user')!.id }
  });

  return c.json({ ok: true });
});

superAdminRoutes.get('/users', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT u.Id, u.Name, u.Email, u.IsSuperAdmin, u.Status, u.CreatedAt,
            GROUP_CONCAT(t.Name, ', ') AS TenantNames
     FROM Users u
     LEFT JOIN TenantUsers tu ON tu.UserId = u.Id
     LEFT JOIN Tenants t ON t.Id = tu.TenantId
     GROUP BY u.Id
     ORDER BY u.CreatedAt DESC`
  ).all();

  return c.json({ users: results });
});

superAdminRoutes.patch('/users/:id/status', async (c) => {
  const id = c.req.param('id');
  if (id === c.get('user')!.id) {
    return c.json({ error: 'Você não pode bloquear sua própria conta' }, 400);
  }

  const body = (await c.req.json().catch(() => null)) as { status?: string } | null;
  const parsed = z.enum(['active', 'blocked']).safeParse(body?.status);
  if (!parsed.success) {
    return c.json({ error: 'Status inválido' }, 400);
  }

  const res = await c.env.DB.prepare(
    `UPDATE Users SET Status = ?, UpdatedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE Id = ?`
  )
    .bind(parsed.data, id)
    .run();

  if ((res.meta.changes ?? 0) === 0) {
    return c.json({ error: 'Usuário não encontrado' }, 404);
  }

  if (parsed.data === 'blocked') {
    await c.env.DB.prepare(`DELETE FROM Sessions WHERE UserId = ?`).bind(id).run();
  }

  return c.json({ ok: true });
});

superAdminRoutes.get('/settings', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT SettingKey, SettingValue, UpdatedAt FROM PlatformSettings ORDER BY SettingKey ASC`
  ).all();
  return c.json({ settings: results });
});

superAdminRoutes.put('/settings', async (c) => {
  const body = (await c.req.json().catch(() => null)) as {
    settings?: Record<string, string>;
  } | null;

  if (!body?.settings || typeof body.settings !== 'object') {
    return c.json({ error: 'settings obrigatório' }, 400);
  }

  const allowedKeys = new Set([
    'max_services_per_tenant',
    'max_professionals_per_tenant',
    'max_gallery_images_per_tenant',
    'max_upload_size_bytes',
    'allow_new_registrations',
    'maintenance_mode',
    'billing_payment_provider',
    'billing_trial_days',
    'billing_grace_days',
    'billing_monthly_price_cents',
    'billing_pix_key',
    'billing_pix_receiver_name',
    'billing_pix_receiver_city'
  ]);

  const stmts: D1PreparedStatement[] = [];
  for (const [k, v] of Object.entries(body.settings)) {
    if (!allowedKeys.has(k)) continue;
    stmts.push(
      c.env.DB.prepare(
        `INSERT INTO PlatformSettings (SettingKey, SettingValue, UpdatedAt)
         VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         ON CONFLICT(SettingKey) DO UPDATE SET
           SettingValue = excluded.SettingValue,
           UpdatedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`
      ).bind(k, String(v))
    );
  }

  if (stmts.length > 0) {
    await c.env.DB.batch(stmts);
  }

  return c.json({ ok: true });
});

superAdminRoutes.get('/logs', async (c) => {
  const level = c.req.query('level') || '';
  let sql = `SELECT Id, TenantId, Level, Source, Message, MetaJson, CreatedAt
             FROM SystemLogs`;
  const binds: unknown[] = [];
  if (level) {
    sql += ` WHERE Level = ?`;
    binds.push(level);
  }
  sql += ` ORDER BY CreatedAt DESC LIMIT 100`;

  const { results } = await c.env.DB.prepare(sql).bind(...binds).all();
  return c.json({ logs: results });
});

// ─── Gestão de Assinaturas e Pagamentos Pix (Superadmin) ─────────────────────
superAdminRoutes.get('/billing/invoices', async (c) => {
  const status = c.req.query('status') || '';
  let sql = `
    SELECT i.Id, i.TenantId, i.SubscriptionId, i.Provider, i.ProviderInvoiceId,
           i.AmountInCents, i.PaymentMethod, i.Status, i.DueDate, i.PaidAt,
           i.PaymentNotifiedAt, i.PayerNote, i.CreatedAt,
           t.Name AS TenantName, t.Slug AS TenantSlug,
           bp.BusinessName,
           s.Status AS SubscriptionStatus
    FROM BillingInvoices i
    INNER JOIN Tenants t ON t.Id = i.TenantId
    LEFT JOIN BusinessProfiles bp ON bp.TenantId = i.TenantId
    LEFT JOIN Subscriptions s ON s.TenantId = i.TenantId
  `;
  const binds: unknown[] = [];
  if (status) {
    sql += ` WHERE i.Status = ?`;
    binds.push(status);
  }
  sql += `
    ORDER BY
      CASE i.Status
        WHEN 'awaiting_confirmation' THEN 0
        WHEN 'pending' THEN 1
        ELSE 2
      END,
      i.CreatedAt DESC
    LIMIT 100
  `;

  const { results } = await c.env.DB.prepare(sql).bind(...binds).all();
  return c.json({ invoices: results });
});

superAdminRoutes.post('/billing/invoices/:id/confirm', async (c) => {
  const invoiceId = c.req.param('id');
  const invoice = await c.env.DB.prepare(
    `SELECT Id, TenantId, Status FROM BillingInvoices WHERE Id = ?`
  )
    .bind(invoiceId)
    .first<{ Id: string; TenantId: string; Status: string }>();

  if (!invoice) {
    return c.json({ error: 'Fatura não encontrada' }, 404);
  }

  const subscription = await activatePaidBillingPeriod({
    db: c.env.DB,
    tenantId: invoice.TenantId,
    invoiceId: invoice.Id,
    actorLabel: `superadmin:${c.get('user')!.id}`
  });

  return c.json({ ok: true, subscription });
});

superAdminRoutes.post('/billing/invoices/:id/reject', async (c) => {
  const invoiceId = c.req.param('id');
  const res = await c.env.DB.prepare(
    `UPDATE BillingInvoices
     SET Status = 'pending',
         PaymentNotifiedAt = NULL,
         UpdatedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     WHERE Id = ? AND Status = 'awaiting_confirmation'`
  )
    .bind(invoiceId)
    .run();

  if ((res.meta.changes ?? 0) === 0) {
    return c.json({ error: 'Fatura pendente de confirmação não encontrada' }, 404);
  }

  return c.json({ ok: true });
});

superAdminRoutes.post('/billing/tenants/:tenantId/exempt', async (c) => {
  const tenantId = c.req.param('tenantId');
  const body = (await c.req.json().catch(() => null)) as { exempt?: boolean } | null;
  const shouldExempt = body?.exempt !== false;

  await ensureTrialSubscriptionForTenant(c.env.DB, tenantId);

  if (shouldExempt) {
    await c.env.DB.prepare(
      `UPDATE Subscriptions
       SET Status = 'exempt', GracePeriodEndsAt = NULL, UpdatedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE TenantId = ?`
    )
      .bind(tenantId)
      .run();
  } else {
    await c.env.DB.prepare(
      `UPDATE Subscriptions
       SET Status = 'trialing', UpdatedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE TenantId = ?`
    )
      .bind(tenantId)
      .run();
  }

  const subscription = await evaluateAndSyncSubscription(c.env.DB, tenantId);
  await logSystemEvent(c.env.DB, {
    tenantId,
    level: 'info',
    source: 'superadmin.billing',
    message: shouldExempt
      ? 'Estabelecimento marcado como isento de cobrança (cortesia)'
      : 'Isenção de cobrança removida pelo superadmin',
    meta: { actorUserId: c.get('user')!.id }
  });

  return c.json({ ok: true, subscription });
});

superAdminRoutes.post('/billing/tenants/:tenantId/extend-trial', async (c) => {
  const tenantId = c.req.param('tenantId');
  const body = (await c.req.json().catch(() => null)) as { days?: number } | null;
  const days = Math.max(1, Math.min(365, Number(body?.days || 30)));

  const sub = await ensureTrialSubscriptionForTenant(c.env.DB, tenantId);
  const currentEndMs = Math.max(Date.now(), Date.parse(sub.trialEndsAt) || Date.now());
  const nextTrialEndsAt = new Date(currentEndMs + days * 86_400_000).toISOString();

  await c.env.DB.prepare(
    `UPDATE Subscriptions
     SET Status = 'trialing',
         TrialEndsAt = ?,
         GracePeriodEndsAt = NULL,
         UpdatedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     WHERE TenantId = ?`
  )
    .bind(nextTrialEndsAt, tenantId)
    .run();

  const subscription = await evaluateAndSyncSubscription(c.env.DB, tenantId);
  return c.json({ ok: true, subscription });
});

superAdminRoutes.post('/billing/tenants/:tenantId/manual-activate', async (c) => {
  const tenantId = c.req.param('tenantId');
  const body = (await c.req.json().catch(() => null)) as { days?: number } | null;
  const days = Math.max(1, Math.min(365, Number(body?.days || 30)));

  const subscription = await activatePaidBillingPeriod({
    db: c.env.DB,
    tenantId,
    actorLabel: `superadmin_manual:${c.get('user')!.id}`,
    daysToGrant: days
  });

  return c.json({ ok: true, subscription });
});
