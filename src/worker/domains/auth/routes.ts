import { Hono } from 'hono';
import { setCookie, deleteCookie, getCookie } from 'hono/cookie';
import type { AppEnv } from '@worker/types';
import { registerSchema, loginSchema } from '@shared/schemas';
import {
  generateId,
  generateToken,
  hashPassword,
  sha256Hex,
  verifyPassword
} from '@worker/lib/crypto';
import { verifyTurnstileToken } from '@worker/lib/turnstile';
import {
  SESSION_COOKIE_NAME,
  rateLimitMiddleware,
  requireAuth
} from '@worker/middleware/auth';
import { logSystemEvent } from '@worker/lib/logger';
import { evaluateAndSyncSubscription } from '@worker/domains/billing/service';
import type { AuthUser, TenantStatus, UserRole } from '@shared/types';

export const authRoutes = new Hono<AppEnv>();

function buildCookieOptions(reqUrl: string, expiresAt: Date) {
  const isHttps = new URL(reqUrl).protocol === 'https:';
  return {
    httpOnly: true,
    secure: isHttps,
    sameSite: 'Lax' as const,
    path: '/',
    expires: expiresAt
  };
}

authRoutes.get('/me', async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({
      user: null,
      turnstileSiteKey: c.env.TURNSTILE_SITE_KEY || '1x00000000000000000000AA'
    });
  }

  const subscription = user.tenantId
    ? await evaluateAndSyncSubscription(c.env.DB, user.tenantId)
    : null;

  return c.json({
    user: {
      ...user,
      subscription
    },
    turnstileSiteKey: c.env.TURNSTILE_SITE_KEY || '1x00000000000000000000AA'
  });
});

authRoutes.post(
  '/register',
  rateLimitMiddleware('auth-register', 10, 60_000),
  async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: parsed.error.issues[0]?.message || 'Dados inválidos' },
        400
      );
    }

    const allowReg = await c.env.DB.prepare(
      `SELECT SettingValue FROM PlatformSettings WHERE SettingKey = 'allow_new_registrations'`
    ).first<{ SettingValue: string }>();
    if (allowReg?.SettingValue === 'false') {
      return c.json({ error: 'Novos cadastros estão temporariamente suspensos' }, 403);
    }

    const ip = c.req.header('CF-Connecting-IP');
    const turnstileOk = await verifyTurnstileToken(
      c.env,
      parsed.data.turnstileToken,
      ip
    );
    if (!turnstileOk) {
      return c.json({ error: 'Falha na verificação anti-robô (Turnstile)' }, 400);
    }

    const existing = await c.env.DB.prepare(
      `SELECT Id FROM Users WHERE Email = ?`
    )
      .bind(parsed.data.email)
      .first<{ Id: string }>();
    if (existing) {
      return c.json({ error: 'Este e-mail já está cadastrado' }, 409);
    }

    const userId = generateId();
    const passwordHash = await hashPassword(parsed.data.password);

    await c.env.DB.prepare(
      `INSERT INTO Users (Id, Name, Email, PasswordHash, IsSuperAdmin, Status)
       VALUES (?, ?, ?, ?, 0, 'active')`
    )
      .bind(userId, parsed.data.name, parsed.data.email, passwordHash)
      .run();

    const sessionToken = generateToken(32);
    const tokenHash = await sha256Hex(sessionToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await c.env.DB.prepare(
      `INSERT INTO Sessions (Id, UserId, TenantId, TokenHash, ExpiresAt)
       VALUES (?, ?, NULL, ?, ?)`
    )
      .bind(generateId(), userId, tokenHash, expiresAt.toISOString())
      .run();

    setCookie(c, SESSION_COOKIE_NAME, sessionToken, buildCookieOptions(c.req.url, expiresAt));

    const user: AuthUser = {
      id: userId,
      name: parsed.data.name,
      email: parsed.data.email,
      isSuperAdmin: false,
      tenantId: null,
      tenantSlug: null,
      tenantStatus: null,
      role: null
    };

    return c.json({ user }, 201);
  }
);

authRoutes.post(
  '/login',
  rateLimitMiddleware('auth-login', 15, 60_000),
  async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: parsed.error.issues[0]?.message || 'Credenciais inválidas' },
        400
      );
    }

    const ip = c.req.header('CF-Connecting-IP');
    const turnstileOk = await verifyTurnstileToken(
      c.env,
      parsed.data.turnstileToken,
      ip
    );
    if (!turnstileOk) {
      return c.json({ error: 'Falha na verificação anti-robô (Turnstile)' }, 400);
    }

    const userRow = await c.env.DB.prepare(
      `SELECT Id, Name, Email, PasswordHash, IsSuperAdmin, Status
       FROM Users WHERE Email = ?`
    )
      .bind(parsed.data.email)
      .first<{
        Id: string;
        Name: string;
        Email: string;
        PasswordHash: string;
        IsSuperAdmin: number;
        Status: string;
      }>();

    if (!userRow) {
      return c.json({ error: 'E-mail ou senha incorretos' }, 401);
    }

    if (userRow.Status !== 'active') {
      return c.json({ error: 'Esta conta está bloqueada' }, 403);
    }

    const valid = await verifyPassword(parsed.data.password, userRow.PasswordHash);
    if (!valid) {
      return c.json({ error: 'E-mail ou senha incorretos' }, 401);
    }

    const membership = await c.env.DB.prepare(
      `SELECT tu.TenantId, tu.Role, t.Slug AS TenantSlug, t.Status AS TenantStatus
       FROM TenantUsers tu
       INNER JOIN Tenants t ON t.Id = tu.TenantId
       WHERE tu.UserId = ?
       ORDER BY tu.CreatedAt ASC
       LIMIT 1`
    )
      .bind(userRow.Id)
      .first<{
        TenantId: string;
        Role: UserRole;
        TenantSlug: string;
        TenantStatus: TenantStatus;
      }>();

    const sessionToken = generateToken(32);
    const tokenHash = await sha256Hex(sessionToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await c.env.DB.prepare(
      `INSERT INTO Sessions (Id, UserId, TenantId, TokenHash, ExpiresAt)
       VALUES (?, ?, ?, ?, ?)`
    )
      .bind(
        generateId(),
        userRow.Id,
        membership?.TenantId ?? null,
        tokenHash,
        expiresAt.toISOString()
      )
      .run();

    setCookie(c, SESSION_COOKIE_NAME, sessionToken, buildCookieOptions(c.req.url, expiresAt));

    const user: AuthUser = {
      id: userRow.Id,
      name: userRow.Name,
      email: userRow.Email,
      isSuperAdmin: userRow.IsSuperAdmin === 1,
      tenantId: membership?.TenantId ?? null,
      tenantSlug: membership?.TenantSlug ?? null,
      tenantStatus: membership?.TenantStatus ?? null,
      role: membership?.Role ?? null
    };

    return c.json({ user });
  }
);

authRoutes.post('/logout', async (c) => {
  const token = getCookie(c, SESSION_COOKIE_NAME);
  if (token) {
    const tokenHash = await sha256Hex(token);
    await c.env.DB.prepare(`DELETE FROM Sessions WHERE TokenHash = ?`)
      .bind(tokenHash)
      .run();
  }
  deleteCookie(c, SESSION_COOKIE_NAME, { path: '/' });
  return c.json({ ok: true });
});

authRoutes.post('/switch-tenant', requireAuth, async (c) => {
  const user = c.get('user')!;
  const body = (await c.req.json().catch(() => null)) as { tenantId?: string } | null;
  const targetTenantId = body?.tenantId;
  if (!targetTenantId) {
    return c.json({ error: 'tenantId obrigatório' }, 400);
  }

  const membership = await c.env.DB.prepare(
    `SELECT tu.TenantId, tu.Role, t.Slug AS TenantSlug, t.Status AS TenantStatus
     FROM TenantUsers tu
     INNER JOIN Tenants t ON t.Id = tu.TenantId
     WHERE tu.UserId = ? AND tu.TenantId = ?`
  )
    .bind(user.id, targetTenantId)
    .first<{
      TenantId: string;
      Role: UserRole;
      TenantSlug: string;
      TenantStatus: TenantStatus;
    }>();

  if (!membership) {
    await logSystemEvent(c.env.DB, {
      tenantId: targetTenantId,
      level: 'warn',
      source: 'auth.switch-tenant',
      message: 'Tentativa de troca para tenant sem vínculo',
      meta: { userId: user.id, targetTenantId }
    });
    return c.json({ error: 'Acesso negado a este estabelecimento' }, 403);
  }

  const token = getCookie(c, SESSION_COOKIE_NAME);
  if (token) {
    const tokenHash = await sha256Hex(token);
    await c.env.DB.prepare(`UPDATE Sessions SET TenantId = ? WHERE TokenHash = ?`)
      .bind(membership.TenantId, tokenHash)
      .run();
  }

  return c.json({
    user: {
      ...user,
      tenantId: membership.TenantId,
      tenantSlug: membership.TenantSlug,
      tenantStatus: membership.TenantStatus,
      role: membership.Role
    }
  });
});
