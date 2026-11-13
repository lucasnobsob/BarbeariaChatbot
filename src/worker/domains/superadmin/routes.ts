import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '@worker/types';
import { requireSuperAdmin } from '@worker/middleware/auth';
import { logSystemEvent } from '@worker/lib/logger';

export const superAdminRoutes = new Hono<AppEnv>();

superAdminRoutes.use('*', requireSuperAdmin);

superAdminRoutes.get('/overview', async (c) => {
  const [tenantsRow, activeTenantsRow, usersRow, apptsRow, errorsRow] = await Promise.all([
    c.env.DB.prepare(`SELECT COUNT(*) AS Total FROM Tenants`).first<{ Total: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) AS Total FROM Tenants WHERE Status = 'active'`).first<{
      Total: number;
    }>(),
    c.env.DB.prepare(`SELECT COUNT(*) AS Total FROM Users`).first<{ Total: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) AS Total FROM Appointments`).first<{ Total: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) AS Total FROM SystemLogs WHERE Level = 'error'`).first<{
      Total: number;
    }>()
  ]);

  return c.json({
    stats: {
      totalTenants: tenantsRow?.Total ?? 0,
      activeTenants: activeTenantsRow?.Total ?? 0,
      totalUsers: usersRow?.Total ?? 0,
      totalAppointments: apptsRow?.Total ?? 0,
      totalErrors: errorsRow?.Total ?? 0
    }
  });
});

superAdminRoutes.get('/tenants', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT t.Id, t.Name, t.Slug, t.Status, t.CreatedAt, t.UpdatedAt,
            bp.BusinessName, bp.City, bp.State, bp.Phone, bp.Email,
            (SELECT COUNT(*) FROM TenantUsers tu WHERE tu.TenantId = t.Id) AS UserCount,
            (SELECT COUNT(*) FROM Appointments a WHERE a.TenantId = t.Id) AS AppointmentCount
     FROM Tenants t
     LEFT JOIN BusinessProfiles bp ON bp.TenantId = t.Id
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
    'maintenance_mode'
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
