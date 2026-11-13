import type { Context, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import type { AppEnv } from '@worker/types';
import { sha256Hex } from '@worker/lib/crypto';
import type { AuthUser, TenantStatus, UserRole } from '@shared/types';
import { checkRateLimit } from '@worker/lib/rateLimit';

export const SESSION_COOKIE_NAME = 'barbersaas_session';

interface SessionRow {
  UserId: string;
  UserName: string;
  UserEmail: string;
  IsSuperAdmin: number;
  UserStatus: string;
  TenantId: string | null;
  TenantSlug: string | null;
  TenantStatus: TenantStatus | null;
  Role: UserRole | null;
  ExpiresAt: string;
}

export async function resolveAuth(c: Context<AppEnv>, next: Next): Promise<Response | void> {
  c.set('user', null);
  c.set('tenantId', null);
  c.set('role', null);

  const token = getCookie(c, SESSION_COOKIE_NAME);
  if (!token) {
    await next();
    return;
  }

  const tokenHash = await sha256Hex(token);
  const nowIso = new Date().toISOString();

  const row = await c.env.DB.prepare(
    `SELECT
       s.UserId,
       u.Name AS UserName,
       u.Email AS UserEmail,
       u.IsSuperAdmin,
       u.Status AS UserStatus,
       s.TenantId,
       t.Slug AS TenantSlug,
       t.Status AS TenantStatus,
       tu.Role,
       s.ExpiresAt
     FROM Sessions s
     INNER JOIN Users u ON u.Id = s.UserId
     LEFT JOIN Tenants t ON t.Id = s.TenantId
     LEFT JOIN TenantUsers tu ON tu.TenantId = s.TenantId AND tu.UserId = s.UserId
     WHERE s.TokenHash = ? AND s.ExpiresAt > ?`
  )
    .bind(tokenHash, nowIso)
    .first<SessionRow>();

  if (!row || row.UserStatus !== 'active') {
    await next();
    return;
  }

  const authUser: AuthUser = {
    id: row.UserId,
    name: row.UserName,
    email: row.UserEmail,
    isSuperAdmin: row.IsSuperAdmin === 1,
    tenantId: row.TenantId,
    tenantSlug: row.TenantSlug,
    tenantStatus: row.TenantStatus,
    role: row.Role
  };

  c.set('user', authUser);
  c.set('tenantId', row.TenantId);
  c.set('role', row.Role);

  await next();
}

export async function requireAuth(c: Context<AppEnv>, next: Next): Promise<Response | void> {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Autenticação necessária' }, 401);
  }
  await next();
}

export function requireTenantAccess(allowedRoles?: UserRole[]) {
  return async (c: Context<AppEnv>, next: Next): Promise<Response | void> => {
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Autenticação necessária' }, 401);
    }
    const tenantId = c.get('tenantId');
    const role = c.get('role');
    if (!tenantId || !role) {
      return c.json({ error: 'Nenhum estabelecimento vinculado à sessão' }, 403);
    }
    if (user.tenantStatus === 'blocked') {
      return c.json({ error: 'Este estabelecimento foi bloqueado pela administração da plataforma' }, 403);
    }
    if (allowedRoles && !allowedRoles.includes(role)) {
      return c.json({ error: 'Permissão insuficiente para esta operação' }, 403);
    }
    await next();
  };
}

export async function requireSuperAdmin(c: Context<AppEnv>, next: Next): Promise<Response | void> {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Autenticação necessária' }, 401);
  }
  if (!user.isSuperAdmin) {
    return c.json({ error: 'Acesso restrito ao superadministrador' }, 403);
  }
  await next();
}

export async function csrfOriginCheck(c: Context<AppEnv>, next: Next): Promise<Response | void> {
  const method = c.req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    await next();
    return;
  }
  const origin = c.req.header('Origin');
  if (origin) {
    const reqUrl = new URL(c.req.url);
    if (origin !== reqUrl.origin) {
      return c.json({ error: 'Origem da requisição inválida (CSRF)' }, 403);
    }
  }
  await next();
}

export function rateLimitMiddleware(prefix: string, maxRequests: number, windowMs: number) {
  return async (c: Context<AppEnv>, next: Next): Promise<Response | void> => {
    if (c.env.ENVIRONMENT === 'test') {
      await next();
      return;
    }
    const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'local';
    if (!checkRateLimit(`${prefix}:${ip}`, maxRequests, windowMs)) {
      return c.json({ error: 'Muitas requisições. Tente novamente em instantes.' }, 429);
    }
    await next();
  };
}
