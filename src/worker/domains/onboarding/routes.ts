import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { z } from 'zod';
import type { AppEnv } from '@worker/types';
import {
  businessProfileSchema,
  professionalSchema,
  serviceSchema,
  slugify,
  workingHourSchema
} from '@shared/schemas';
import { generateId, sha256Hex } from '@worker/lib/crypto';
import {
  SESSION_COOKIE_NAME,
  requireAuth,
  requireTenantAccess
} from '@worker/middleware/auth';
import { ensureTrialSubscriptionForTenant } from '@worker/domains/billing/service';

export const onboardingRoutes = new Hono<AppEnv>();

const RESERVED_SLUGS = new Set([
  'admin',
  'superadmin',
  'login',
  'register',
  'api',
  'media',
  'assets',
  'b',
  'sitemap',
  'robots',
  'onboarding'
]);

const DEFAULT_HOURS = [
  { dayOfWeek: 0, startTime: '09:00', endTime: '17:00', breakStart: null, breakEnd: null, isAvailable: false },
  { dayOfWeek: 1, startTime: '09:00', endTime: '19:00', breakStart: '12:00', breakEnd: '13:00', isAvailable: false },
  { dayOfWeek: 2, startTime: '09:00', endTime: '19:00', breakStart: '12:00', breakEnd: '13:00', isAvailable: true },
  { dayOfWeek: 3, startTime: '09:00', endTime: '19:00', breakStart: '12:00', breakEnd: '13:00', isAvailable: true },
  { dayOfWeek: 4, startTime: '09:00', endTime: '19:00', breakStart: '12:00', breakEnd: '13:00', isAvailable: true },
  { dayOfWeek: 5, startTime: '09:00', endTime: '20:00', breakStart: '12:00', breakEnd: '13:00', isAvailable: true },
  { dayOfWeek: 6, startTime: '09:00', endTime: '17:00', breakStart: null, breakEnd: null, isAvailable: true }
];

async function resolveUniqueSlug(db: D1Database, rawSlug: string, excludeTenantId?: string): Promise<string> {
  const base = slugify(rawSlug) || 'barbearia';
  let candidate = RESERVED_SLUGS.has(base) ? `${base}-barbearia` : base;
  for (let i = 0; i < 20; i++) {
    const check = i === 0 ? candidate : `${candidate}-${i + 1}`;
    const existing = await db
      .prepare(`SELECT Id FROM Tenants WHERE Slug = ?`)
      .bind(check)
      .first<{ Id: string }>();
    if (!existing || existing.Id === excludeTenantId) {
      return check;
    }
  }
  return `${candidate}-${generateId().slice(0, 6)}`;
}

onboardingRoutes.get('/check-slug', requireAuth, async (c) => {
  const raw = c.req.query('slug') || '';
  const slug = slugify(raw);
  if (slug.length < 3) {
    return c.json({ available: false, slug, reason: 'Mínimo de 3 caracteres' });
  }
  if (RESERVED_SLUGS.has(slug)) {
    return c.json({ available: false, slug, reason: 'Endereço reservado pela plataforma' });
  }
  const existing = await c.env.DB.prepare(`SELECT Id FROM Tenants WHERE Slug = ?`)
    .bind(slug)
    .first<{ Id: string }>();
  const currentTenantId = c.get('tenantId');
  const available = !existing || existing.Id === currentTenantId;
  return c.json({
    available,
    slug,
    reason: available ? null : 'Este endereço já está em uso por outra barbearia'
  });
});

const startSchema = z.object({
  businessName: z.string().trim().min(2).max(120),
  slug: z.string().trim().optional(),
  description: z.string().trim().max(1000).default(''),
  phone: z.string().trim().max(40).default(''),
  email: z.string().trim().max(150).default(''),
  instagram: z.string().trim().max(100).default(''),
  whatsAppNumber: z.string().trim().max(40).default(''),
  telegramUsername: z.string().trim().max(60).default('')
});

onboardingRoutes.post('/start', requireAuth, async (c) => {
  const user = c.get('user')!;
  if (c.get('tenantId')) {
    return c.json({ error: 'Você já possui uma barbearia vinculada à conta' }, 409);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = startSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message || 'Dados inválidos' }, 400);
  }

  const slug = await resolveUniqueSlug(
    c.env.DB,
    parsed.data.slug || parsed.data.businessName
  );
  const tenantId = generateId();
  const profileId = generateId();

  const statements: D1PreparedStatement[] = [
    c.env.DB.prepare(
      `INSERT INTO Tenants (Id, Name, Slug, Status) VALUES (?, ?, ?, 'onboarding')`
    ).bind(tenantId, parsed.data.businessName, slug),
    c.env.DB.prepare(
      `INSERT INTO TenantUsers (Id, TenantId, UserId, Role) VALUES (?, ?, ?, 'owner')`
    ).bind(generateId(), tenantId, user.id),
    c.env.DB.prepare(
      `INSERT INTO BusinessProfiles (
         Id, TenantId, BusinessName, Tagline, Description, Phone, Email, Instagram, WhatsAppNumber, TelegramUsername
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      profileId,
      tenantId,
      parsed.data.businessName,
      'Estilo, precisão e atendimento sob medida.',
      parsed.data.description,
      parsed.data.phone,
      parsed.data.email,
      parsed.data.instagram,
      parsed.data.whatsAppNumber,
      parsed.data.telegramUsername
    ),
    c.env.DB.prepare(
      `INSERT INTO BusinessSettings (Id, TenantId, SettingKey, SettingValue) VALUES
       (?, ?, 'slot_interval_minutes', '30'),
       (?, ?, 'min_advance_minutes', '30'),
       (?, ?, 'max_advance_days', '30'),
       (?, ?, 'allow_public_cancellation', 'true'),
       (?, ?, 'timezone_offset_minutes', '-180')`
    ).bind(
      generateId(), tenantId,
      generateId(), tenantId,
      generateId(), tenantId,
      generateId(), tenantId,
      generateId(), tenantId
    )
  ];

  for (const h of DEFAULT_HOURS) {
    statements.push(
      c.env.DB.prepare(
        `INSERT INTO WorkingHours (Id, TenantId, ProfessionalId, DayOfWeek, StartTime, EndTime, BreakStart, BreakEnd, IsAvailable)
         VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?)`
      ).bind(
        generateId(),
        tenantId,
        h.dayOfWeek,
        h.startTime,
        h.endTime,
        h.breakStart,
        h.breakEnd,
        h.isAvailable ? 1 : 0
      )
    );
  }

  await c.env.DB.batch(statements);

  const sessionToken = getCookie(c, SESSION_COOKIE_NAME);
  if (sessionToken) {
    const tokenHash = await sha256Hex(sessionToken);
    await c.env.DB.prepare(`UPDATE Sessions SET TenantId = ? WHERE TokenHash = ?`)
      .bind(tenantId, tokenHash)
      .run();
  }

  return c.json(
    {
      tenant: {
        id: tenantId,
        name: parsed.data.businessName,
        slug,
        status: 'onboarding'
      }
    },
    201
  );
});

const completeSchema = z.object({
  profile: businessProfileSchema,
  workingHours: z.array(workingHourSchema).min(1).max(7).optional(),
  services: z.array(serviceSchema).max(20).optional(),
  professionals: z.array(professionalSchema).max(15).optional(),
  publish: z.boolean().default(true)
});

onboardingRoutes.post('/complete', requireAuth, async (c) => {
  const user = c.get('user')!;
  const body = await c.req.json().catch(() => null);
  const parsed = completeSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message || 'Dados inválidos' }, 400);
  }

  const existingTenantId = c.get('tenantId');
  const p = parsed.data.profile;
  const slug = await resolveUniqueSlug(
    c.env.DB,
    p.slug || p.businessName,
    existingTenantId ?? undefined
  );
  const tenantId = existingTenantId || generateId();
  const status = parsed.data.publish ? 'active' : 'onboarding';

  const statements: D1PreparedStatement[] = [];

  if (!existingTenantId) {
    statements.push(
      c.env.DB.prepare(
        `INSERT INTO Tenants (Id, Name, Slug, Status) VALUES (?, ?, ?, ?)`
      ).bind(tenantId, p.businessName, slug, status),
      c.env.DB.prepare(
        `INSERT INTO TenantUsers (Id, TenantId, UserId, Role) VALUES (?, ?, ?, 'owner')`
      ).bind(generateId(), tenantId, user.id),
      c.env.DB.prepare(
        `INSERT INTO BusinessProfiles (
          Id, TenantId, BusinessName, Tagline, HeroSubtitle, Description, AboutText, FooterText,
          TemplateKey, LogoUrl, CoverImageUrl, PrimaryColor, SecondaryColor, AccentColor,
          ShowGallery, ShowTeam, ShowMap, Phone, WhatsAppNumber, TelegramUsername, Email, Instagram,
          PostalCode, Street, Number, Neighborhood, City, State, Complement, Latitude, Longitude
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        generateId(),
        tenantId,
        p.businessName,
        p.tagline,
        p.heroSubtitle,
        p.description,
        p.aboutText,
        p.footerText,
        p.templateKey,
        p.logoUrl,
        p.coverImageUrl,
        p.primaryColor,
        p.secondaryColor,
        p.accentColor,
        p.showGallery ? 1 : 0,
        p.showTeam ? 1 : 0,
        p.showMap ? 1 : 0,
        p.phone,
        p.whatsAppNumber,
        p.telegramUsername,
        p.email,
        p.instagram,
        p.postalCode,
        p.street,
        p.number,
        p.neighborhood,
        p.city,
        p.state,
        p.complement,
        p.latitude ?? null,
        p.longitude ?? null
      ),
      c.env.DB.prepare(
        `INSERT OR IGNORE INTO BusinessSettings (Id, TenantId, SettingKey, SettingValue) VALUES
         (?, ?, 'slot_interval_minutes', '30'),
         (?, ?, 'min_advance_minutes', '30'),
         (?, ?, 'max_advance_days', '30'),
         (?, ?, 'allow_public_cancellation', 'true'),
         (?, ?, 'timezone_offset_minutes', '-180')`
      ).bind(
        generateId(), tenantId,
        generateId(), tenantId,
        generateId(), tenantId,
        generateId(), tenantId,
        generateId(), tenantId
      )
    );
  } else {
    statements.push(
      c.env.DB.prepare(
        `UPDATE Tenants SET Name = ?, Slug = ?, Status = ?, UpdatedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE Id = ?`
      ).bind(p.businessName, slug, status, tenantId),
      c.env.DB.prepare(
        `UPDATE BusinessProfiles SET
          BusinessName = ?, Tagline = ?, HeroSubtitle = ?, Description = ?, AboutText = ?, FooterText = ?,
          TemplateKey = ?, LogoUrl = ?, CoverImageUrl = ?, PrimaryColor = ?, SecondaryColor = ?, AccentColor = ?,
          ShowGallery = ?, ShowTeam = ?, ShowMap = ?, Phone = ?, WhatsAppNumber = ?, TelegramUsername = ?,
          Email = ?, Instagram = ?, PostalCode = ?, Street = ?, Number = ?, Neighborhood = ?, City = ?,
          State = ?, Complement = ?, Latitude = ?, Longitude = ?,
          UpdatedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE TenantId = ?`
      ).bind(
        p.businessName,
        p.tagline,
        p.heroSubtitle,
        p.description,
        p.aboutText,
        p.footerText,
        p.templateKey,
        p.logoUrl,
        p.coverImageUrl,
        p.primaryColor,
        p.secondaryColor,
        p.accentColor,
        p.showGallery ? 1 : 0,
        p.showTeam ? 1 : 0,
        p.showMap ? 1 : 0,
        p.phone,
        p.whatsAppNumber,
        p.telegramUsername,
        p.email,
        p.instagram,
        p.postalCode,
        p.street,
        p.number,
        p.neighborhood,
        p.city,
        p.state,
        p.complement,
        p.latitude ?? null,
        p.longitude ?? null,
        tenantId
      )
    );
  }

  const hours = parsed.data.workingHours ?? DEFAULT_HOURS;
  statements.push(
    c.env.DB.prepare(`DELETE FROM WorkingHours WHERE TenantId = ? AND ProfessionalId IS NULL`).bind(tenantId)
  );
  for (const h of hours) {
    statements.push(
      c.env.DB.prepare(
        `INSERT INTO WorkingHours (Id, TenantId, ProfessionalId, DayOfWeek, StartTime, EndTime, BreakStart, BreakEnd, IsAvailable)
         VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?)`
      ).bind(
        generateId(),
        tenantId,
        h.dayOfWeek,
        h.startTime,
        h.endTime,
        h.breakStart ?? null,
        h.breakEnd ?? null,
        h.isAvailable ? 1 : 0
      )
    );
  }

  const createdServiceIds: string[] = [];
  if (parsed.data.services && parsed.data.services.length > 0) {
    for (const s of parsed.data.services) {
      const sId = generateId();
      createdServiceIds.push(sId);
      statements.push(
        c.env.DB.prepare(
          `INSERT INTO Services (Id, TenantId, CategoryId, Name, Description, PriceInCents, DurationMinutes, ImageUrl, IsActive)
           VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?)`
        ).bind(
          sId,
          tenantId,
          s.name,
          s.description,
          s.priceInCents,
          s.durationMinutes,
          s.imageUrl,
          s.isActive ? 1 : 0
        )
      );
    }
  }

  if (parsed.data.professionals && parsed.data.professionals.length > 0) {
    for (const prof of parsed.data.professionals) {
      const profId = generateId();
      statements.push(
        c.env.DB.prepare(
          `INSERT INTO Professionals (Id, TenantId, Name, Description, Specialties, PhotoUrl, IsActive)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          profId,
          tenantId,
          prof.name,
          prof.description,
          prof.specialties,
          prof.photoUrl,
          prof.isActive ? 1 : 0
        )
      );
      const linkIds = prof.serviceIds.length > 0 ? prof.serviceIds : createdServiceIds;
      for (const sId of linkIds) {
        statements.push(
          c.env.DB.prepare(
            `INSERT OR IGNORE INTO ProfessionalServices (Id, TenantId, ProfessionalId, ServiceId)
             VALUES (?, ?, ?, ?)`
          ).bind(generateId(), tenantId, profId, sId)
        );
      }
    }
  }

  await c.env.DB.batch(statements);

  const subscription = await ensureTrialSubscriptionForTenant(c.env.DB, tenantId);

  const sessionToken = getCookie(c, SESSION_COOKIE_NAME);
  if (sessionToken) {
    const tokenHash = await sha256Hex(sessionToken);
    await c.env.DB.prepare(`UPDATE Sessions SET TenantId = ? WHERE TokenHash = ?`)
      .bind(tenantId, tokenHash)
      .run();
  }

  return c.json({
    tenant: {
      id: tenantId,
      name: p.businessName,
      slug,
      status
    },
    subscription,
    publicUrl: `/b/${slug}`
  });
});

onboardingRoutes.post(
  '/publish',
  requireTenantAccess(['owner', 'admin']),
  async (c) => {
    const tenantId = c.get('tenantId')!;
    const tenant = await c.env.DB.prepare(
      `SELECT Id, Slug, Status FROM Tenants WHERE Id = ?`
    )
      .bind(tenantId)
      .first<{ Id: string; Slug: string; Status: string }>();
    if (!tenant) return c.json({ error: 'Estabelecimento não encontrado' }, 404);
    if (tenant.Status === 'blocked') {
      return c.json({ error: 'Estabelecimento bloqueado' }, 403);
    }

    await c.env.DB.prepare(
      `UPDATE Tenants SET Status = 'active', UpdatedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE Id = ?`
    )
      .bind(tenantId)
      .run();

    const subscription = await ensureTrialSubscriptionForTenant(c.env.DB, tenantId);

    return c.json({ ok: true, slug: tenant.Slug, publicUrl: `/b/${tenant.Slug}`, subscription });
  }
);
