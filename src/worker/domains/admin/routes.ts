import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '@worker/types';
import { requireTenantAccess } from '@worker/middleware/auth';
import {
  adminAppointmentSchema,
  blockedSlotSchema,
  businessProfileSchema,
  businessSettingsSchema,
  galleryImageSchema,
  professionalSchema,
  serviceCategorySchema,
  serviceSchema,
  slugify,
  workingHoursArraySchema
} from '@shared/schemas';
import { generateId } from '@worker/lib/crypto';
import {
  createValidatedAppointment,
  getAvailableSlots,
  getTenantBookingSettings,
  localDateTimeToUtcIso,
  rescheduleValidatedAppointment,
  utcIsoToLocalDateAndTime
} from '@worker/domains/scheduling/engine';

export const adminRoutes = new Hono<AppEnv>();

adminRoutes.use('*', requireTenantAccess());

// ─── Dashboard ───────────────────────────────────────────────────────────────
adminRoutes.get('/dashboard', async (c) => {
  const tenantId = c.get('tenantId')!;
  const settings = await getTenantBookingSettings(c.env.DB, tenantId);
  const nowIso = new Date().toISOString();
  const todayLocal = utcIsoToLocalDateAndTime(nowIso, settings.timezoneOffsetMinutes).date;
  const dayStartUtc = localDateTimeToUtcIso(todayLocal, 0, settings.timezoneOffsetMinutes);
  const dayEndUtc = localDateTimeToUtcIso(todayLocal, 24 * 60, settings.timezoneOffsetMinutes);

  const [
    todayApptsRes,
    upcomingRes,
    customersCountRow,
    completedCountRow,
    topServicesRes,
    servicesRes,
    profsRes
  ] = await Promise.all([
    c.env.DB.prepare(
      `SELECT a.Id, a.StartAt, a.EndAt, a.Status, a.PriceInCents, a.ConfirmationCode, a.Source,
              c.Name AS CustomerName, c.Phone AS CustomerPhone,
              s.Name AS ServiceName, p.Name AS ProfessionalName
       FROM Appointments a
       INNER JOIN Customers c ON c.TenantId = a.TenantId AND c.Id = a.CustomerId
       INNER JOIN Services s ON s.TenantId = a.TenantId AND s.Id = a.ServiceId
       INNER JOIN Professionals p ON p.TenantId = a.TenantId AND p.Id = a.ProfessionalId
       WHERE a.TenantId = ? AND a.StartAt >= ? AND a.StartAt < ?
       ORDER BY a.StartAt ASC`
    )
      .bind(tenantId, dayStartUtc, dayEndUtc)
      .all(),
    c.env.DB.prepare(
      `SELECT a.Id, a.StartAt, a.EndAt, a.Status, a.ConfirmationCode,
              c.Name AS CustomerName, c.Phone AS CustomerPhone,
              s.Name AS ServiceName, p.Name AS ProfessionalName
       FROM Appointments a
       INNER JOIN Customers c ON c.TenantId = a.TenantId AND c.Id = a.CustomerId
       INNER JOIN Services s ON s.TenantId = a.TenantId AND s.Id = a.ServiceId
       INNER JOIN Professionals p ON p.TenantId = a.TenantId AND p.Id = a.ProfessionalId
       WHERE a.TenantId = ? AND a.Status = 'confirmed' AND a.StartAt >= ?
       ORDER BY a.StartAt ASC
       LIMIT 10`
    )
      .bind(tenantId, nowIso)
      .all(),
    c.env.DB.prepare(`SELECT COUNT(*) AS Total FROM Customers WHERE TenantId = ?`)
      .bind(tenantId)
      .first<{ Total: number }>(),
    c.env.DB.prepare(
      `SELECT COUNT(*) AS Total FROM Appointments WHERE TenantId = ? AND Status IN ('confirmed', 'completed')`
    )
      .bind(tenantId)
      .first<{ Total: number }>(),
    c.env.DB.prepare(
      `SELECT s.Id, s.Name, COUNT(a.Id) AS TotalBookings
       FROM Services s
       LEFT JOIN Appointments a ON a.TenantId = s.TenantId AND a.ServiceId = s.Id AND a.Status != 'cancelled'
       WHERE s.TenantId = ?
       GROUP BY s.Id, s.Name
       ORDER BY TotalBookings DESC
       LIMIT 5`
    )
      .bind(tenantId)
      .all(),
    c.env.DB.prepare(
      `SELECT Id FROM Services WHERE TenantId = ? AND IsActive = 1 LIMIT 1`
    )
      .bind(tenantId)
      .first<{ Id: string }>(),
    c.env.DB.prepare(
      `SELECT Id FROM Professionals WHERE TenantId = ? AND IsActive = 1`
    )
      .bind(tenantId)
      .all<{ Id: string }>()
  ]);

  let availableSlotsToday = 0;
  if (servicesRes && profsRes.results.length > 0) {
    for (const p of profsRes.results.slice(0, 5)) {
      const slotsRes = await getAvailableSlots({
        db: c.env.DB,
        tenantId,
        date: todayLocal,
        serviceId: servicesRes.Id,
        professionalId: p.Id
      });
      availableSlotsToday += slotsRes.slots.length;
    }
  }

  return c.json({
    todayDate: todayLocal,
    todayAppointments: todayApptsRes.results,
    upcomingAppointments: upcomingRes.results,
    totalCustomers: customersCountRow?.Total ?? 0,
    totalAppointments: completedCountRow?.Total ?? 0,
    topServices: topServicesRes.results,
    availableSlotsToday
  });
});

// ─── Website & Profile ───────────────────────────────────────────────────────
adminRoutes.get('/website', async (c) => {
  const tenantId = c.get('tenantId')!;
  const [tenant, profile] = await Promise.all([
    c.env.DB.prepare(`SELECT Id, Name, Slug, CustomDomain, Status FROM Tenants WHERE Id = ?`)
      .bind(tenantId)
      .first<{ Id: string; Name: string; Slug: string; CustomDomain: string | null; Status: string }>(),
    c.env.DB.prepare(`SELECT * FROM BusinessProfiles WHERE TenantId = ?`)
      .bind(tenantId)
      .first<Record<string, unknown>>()
  ]);

  if (!tenant || !profile) {
    return c.json({ error: 'Estabelecimento não encontrado' }, 404);
  }

  return c.json({
    tenant: {
      id: tenant.Id,
      name: tenant.Name,
      slug: tenant.Slug,
      customDomain: tenant.CustomDomain,
      status: tenant.Status
    },
    profile: {
      id: String(profile.Id),
      tenantId: String(profile.TenantId),
      businessName: String(profile.BusinessName),
      tagline: String(profile.Tagline || ''),
      heroSubtitle: String(profile.HeroSubtitle || ''),
      description: String(profile.Description || ''),
      aboutText: String(profile.AboutText || ''),
      footerText: String(profile.FooterText || ''),
      templateKey: String(profile.TemplateKey || 'classic-luxury'),
      logoUrl: String(profile.LogoUrl || ''),
      coverImageUrl: String(profile.CoverImageUrl || ''),
      primaryColor: String(profile.PrimaryColor || '#d97706'),
      secondaryColor: String(profile.SecondaryColor || '#0f172a'),
      accentColor: String(profile.AccentColor || '#f59e0b'),
      showGallery: profile.ShowGallery === 1,
      showTeam: profile.ShowTeam === 1,
      showMap: profile.ShowMap === 1,
      phone: String(profile.Phone || ''),
      whatsAppNumber: String(profile.WhatsAppNumber || ''),
      telegramUsername: String(profile.TelegramUsername || ''),
      email: String(profile.Email || ''),
      instagram: String(profile.Instagram || ''),
      postalCode: String(profile.PostalCode || ''),
      street: String(profile.Street || ''),
      number: String(profile.Number || ''),
      neighborhood: String(profile.Neighborhood || ''),
      city: String(profile.City || ''),
      state: String(profile.State || ''),
      complement: String(profile.Complement || ''),
      latitude: profile.Latitude !== null ? Number(profile.Latitude) : null,
      longitude: profile.Longitude !== null ? Number(profile.Longitude) : null
    }
  });
});

adminRoutes.put(
  '/website',
  requireTenantAccess(['owner', 'admin', 'manager']),
  async (c) => {
    const tenantId = c.get('tenantId')!;
    const body = await c.req.json().catch(() => null);
    const parsed = businessProfileSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message || 'Dados inválidos' }, 400);
    }

    const p = parsed.data;
    let newSlug: string | null = null;
    if (p.slug) {
      const clean = slugify(p.slug);
      const conflict = await c.env.DB.prepare(
        `SELECT Id FROM Tenants WHERE Slug = ? AND Id != ?`
      )
        .bind(clean, tenantId)
        .first<{ Id: string }>();
      if (conflict) {
        return c.json({ error: 'Este slug já está sendo usado por outra barbearia' }, 409);
      }
      newSlug = clean;
    }

    const stmts: D1PreparedStatement[] = [
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
    ];

    if (newSlug) {
      stmts.push(
        c.env.DB.prepare(
          `UPDATE Tenants SET Name = ?, Slug = ?, UpdatedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE Id = ?`
        ).bind(p.businessName, newSlug, tenantId)
      );
    } else {
      stmts.push(
        c.env.DB.prepare(
          `UPDATE Tenants SET Name = ?, UpdatedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE Id = ?`
        ).bind(p.businessName, tenantId)
      );
    }

    await c.env.DB.batch(stmts);
    return c.json({ ok: true, slug: newSlug });
  }
);

// ─── Settings & Working Hours ────────────────────────────────────────────────
adminRoutes.get('/settings', async (c) => {
  const tenantId = c.get('tenantId')!;
  const settings = await getTenantBookingSettings(c.env.DB, tenantId);
  return c.json({ settings });
});

adminRoutes.put(
  '/settings',
  requireTenantAccess(['owner', 'admin', 'manager']),
  async (c) => {
    const tenantId = c.get('tenantId')!;
    const body = await c.req.json().catch(() => null);
    const parsed = businessSettingsSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message || 'Configurações inválidas' }, 400);
    }

    const pairs: Array<[string, string]> = [
      ['slot_interval_minutes', String(parsed.data.slotIntervalMinutes)],
      ['min_advance_minutes', String(parsed.data.minAdvanceMinutes)],
      ['max_advance_days', String(parsed.data.maxAdvanceDays)],
      ['allow_public_cancellation', String(parsed.data.allowPublicCancellation)],
      ['timezone_offset_minutes', String(parsed.data.timezoneOffsetMinutes)]
    ];

    await c.env.DB.batch(
      pairs.map(([k, v]) =>
        c.env.DB.prepare(
          `INSERT INTO BusinessSettings (Id, TenantId, SettingKey, SettingValue)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(TenantId, SettingKey) DO UPDATE SET SettingValue = excluded.SettingValue`
        ).bind(generateId(), tenantId, k, v)
      )
    );

    return c.json({ ok: true, settings: parsed.data });
  }
);

adminRoutes.get('/working-hours', async (c) => {
  const tenantId = c.get('tenantId')!;
  const professionalId = c.req.query('professionalId') || null;
  const query = professionalId
    ? c.env.DB.prepare(
        `SELECT Id, DayOfWeek, StartTime, EndTime, BreakStart, BreakEnd, IsAvailable
         FROM WorkingHours WHERE TenantId = ? AND ProfessionalId = ? ORDER BY DayOfWeek ASC`
      ).bind(tenantId, professionalId)
    : c.env.DB.prepare(
        `SELECT Id, DayOfWeek, StartTime, EndTime, BreakStart, BreakEnd, IsAvailable
         FROM WorkingHours WHERE TenantId = ? AND ProfessionalId IS NULL ORDER BY DayOfWeek ASC`
      ).bind(tenantId);

  const { results } = await query.all<Record<string, unknown>>();
  return c.json({
    hours: results.map((h) => ({
      id: String(h.Id),
      dayOfWeek: Number(h.DayOfWeek),
      startTime: String(h.StartTime),
      endTime: String(h.EndTime),
      breakStart: h.BreakStart ? String(h.BreakStart) : null,
      breakEnd: h.BreakEnd ? String(h.BreakEnd) : null,
      isAvailable: h.IsAvailable === 1
    }))
  });
});

adminRoutes.put(
  '/working-hours',
  requireTenantAccess(['owner', 'admin', 'manager']),
  async (c) => {
    const tenantId = c.get('tenantId')!;
    const body = await c.req.json().catch(() => null);
    const parsed = workingHoursArraySchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message || 'Horários inválidos' }, 400);
    }

    const profId = parsed.data.professionalId || null;
    if (profId) {
      const prof = await c.env.DB.prepare(
        `SELECT Id FROM Professionals WHERE TenantId = ? AND Id = ?`
      )
        .bind(tenantId, profId)
        .first();
      if (!prof) return c.json({ error: 'Profissional não encontrado' }, 404);
    }

    const stmts: D1PreparedStatement[] = [
      profId
        ? c.env.DB.prepare(
            `DELETE FROM WorkingHours WHERE TenantId = ? AND ProfessionalId = ?`
          ).bind(tenantId, profId)
        : c.env.DB.prepare(
            `DELETE FROM WorkingHours WHERE TenantId = ? AND ProfessionalId IS NULL`
          ).bind(tenantId)
    ];

    for (const h of parsed.data.hours) {
      stmts.push(
        c.env.DB.prepare(
          `INSERT INTO WorkingHours (Id, TenantId, ProfessionalId, DayOfWeek, StartTime, EndTime, BreakStart, BreakEnd, IsAvailable)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          generateId(),
          tenantId,
          profId,
          h.dayOfWeek,
          h.startTime,
          h.endTime,
          h.breakStart ?? null,
          h.breakEnd ?? null,
          h.isAvailable ? 1 : 0
        )
      );
    }

    await c.env.DB.batch(stmts);
    return c.json({ ok: true });
  }
);

// ─── Service Categories ──────────────────────────────────────────────────────
adminRoutes.get('/categories', async (c) => {
  const tenantId = c.get('tenantId')!;
  const { results } = await c.env.DB.prepare(
    `SELECT Id, TenantId, Name, Description, IsActive FROM ServiceCategories WHERE TenantId = ? ORDER BY Name ASC`
  )
    .bind(tenantId)
    .all<Record<string, unknown>>();
  return c.json({
    categories: results.map((r) => ({
      id: String(r.Id),
      tenantId: String(r.TenantId),
      name: String(r.Name),
      description: String(r.Description || ''),
      isActive: r.IsActive === 1
    }))
  });
});

adminRoutes.post(
  '/categories',
  requireTenantAccess(['owner', 'admin', 'manager']),
  async (c) => {
    const tenantId = c.get('tenantId')!;
    const parsed = serviceCategorySchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message || 'Categoria inválida' }, 400);
    }
    const id = generateId();
    await c.env.DB.prepare(
      `INSERT INTO ServiceCategories (Id, TenantId, Name, Description, IsActive) VALUES (?, ?, ?, ?, ?)`
    )
      .bind(id, tenantId, parsed.data.name, parsed.data.description, parsed.data.isActive ? 1 : 0)
      .run();
    return c.json({ category: { id, tenantId, ...parsed.data } }, 201);
  }
);

adminRoutes.delete(
  '/categories/:id',
  requireTenantAccess(['owner', 'admin', 'manager']),
  async (c) => {
    const tenantId = c.get('tenantId')!;
    const id = c.req.param('id') || '';
    await c.env.DB.batch([
      c.env.DB.prepare(
        `UPDATE Services SET CategoryId = NULL WHERE TenantId = ? AND CategoryId = ?`
      ).bind(tenantId, id),
      c.env.DB.prepare(
        `DELETE FROM ServiceCategories WHERE TenantId = ? AND Id = ?`
      ).bind(tenantId, id)
    ]);
    return c.json({ ok: true });
  }
);

// ─── Services ────────────────────────────────────────────────────────────────
adminRoutes.get('/services', async (c) => {
  const tenantId = c.get('tenantId')!;
  const { results } = await c.env.DB.prepare(
    `SELECT Id, TenantId, CategoryId, Name, Description, PriceInCents, DurationMinutes, ImageUrl, IsActive
     FROM Services WHERE TenantId = ? ORDER BY Name ASC`
  )
    .bind(tenantId)
    .all<Record<string, unknown>>();
  return c.json({
    services: results.map((r) => ({
      id: String(r.Id),
      tenantId: String(r.TenantId),
      categoryId: r.CategoryId ? String(r.CategoryId) : null,
      name: String(r.Name),
      description: String(r.Description || ''),
      priceInCents: Number(r.PriceInCents),
      durationMinutes: Number(r.DurationMinutes),
      imageUrl: String(r.ImageUrl || ''),
      isActive: r.IsActive === 1
    }))
  });
});

adminRoutes.post(
  '/services',
  requireTenantAccess(['owner', 'admin', 'manager']),
  async (c) => {
    const tenantId = c.get('tenantId')!;
    const parsed = serviceSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message || 'Dados inválidos' }, 400);
    }

    const [countRow, limitRow] = await Promise.all([
      c.env.DB.prepare(`SELECT COUNT(*) AS Total FROM Services WHERE TenantId = ?`)
        .bind(tenantId)
        .first<{ Total: number }>(),
      c.env.DB.prepare(
        `SELECT SettingValue FROM PlatformSettings WHERE SettingKey = 'max_services_per_tenant'`
      ).first<{ SettingValue: string }>()
    ]);
    const maxServices = Number(limitRow?.SettingValue || 50);
    if ((countRow?.Total ?? 0) >= maxServices) {
      return c.json({ error: `Limite de ${maxServices} serviços atingido` }, 403);
    }

    if (parsed.data.categoryId) {
      const cat = await c.env.DB.prepare(
        `SELECT Id FROM ServiceCategories WHERE TenantId = ? AND Id = ?`
      )
        .bind(tenantId, parsed.data.categoryId)
        .first();
      if (!cat) {
        return c.json({ error: 'Categoria não pertence a este estabelecimento' }, 400);
      }
    }

    const id = generateId();
    await c.env.DB.prepare(
      `INSERT INTO Services (Id, TenantId, CategoryId, Name, Description, PriceInCents, DurationMinutes, ImageUrl, IsActive)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        id,
        tenantId,
        parsed.data.categoryId ?? null,
        parsed.data.name,
        parsed.data.description,
        parsed.data.priceInCents,
        parsed.data.durationMinutes,
        parsed.data.imageUrl,
        parsed.data.isActive ? 1 : 0
      )
      .run();

    return c.json({ service: { id, tenantId, ...parsed.data } }, 201);
  }
);

adminRoutes.put(
  '/services/:id',
  requireTenantAccess(['owner', 'admin', 'manager']),
  async (c) => {
    const tenantId = c.get('tenantId')!;
    const id = c.req.param('id') || '';
    const parsed = serviceSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message || 'Dados inválidos' }, 400);
    }

    if (parsed.data.categoryId) {
      const cat = await c.env.DB.prepare(
        `SELECT Id FROM ServiceCategories WHERE TenantId = ? AND Id = ?`
      )
        .bind(tenantId, parsed.data.categoryId)
        .first();
      if (!cat) {
        return c.json({ error: 'Categoria inválida' }, 400);
      }
    }

    const res = await c.env.DB.prepare(
      `UPDATE Services
       SET CategoryId = ?, Name = ?, Description = ?, PriceInCents = ?, DurationMinutes = ?, ImageUrl = ?, IsActive = ?
       WHERE TenantId = ? AND Id = ?`
    )
      .bind(
        parsed.data.categoryId ?? null,
        parsed.data.name,
        parsed.data.description,
        parsed.data.priceInCents,
        parsed.data.durationMinutes,
        parsed.data.imageUrl,
        parsed.data.isActive ? 1 : 0,
        tenantId,
        id
      )
      .run();

    if ((res.meta.changes ?? 0) === 0) {
      return c.json({ error: 'Serviço não encontrado' }, 404);
    }

    return c.json({ ok: true });
  }
);

adminRoutes.delete(
  '/services/:id',
  requireTenantAccess(['owner', 'admin', 'manager']),
  async (c) => {
    const tenantId = c.get('tenantId')!;
    const id = c.req.param('id') || '';
    const linked = await c.env.DB.prepare(
      `SELECT Id FROM Appointments WHERE TenantId = ? AND ServiceId = ? LIMIT 1`
    )
      .bind(tenantId, id)
      .first();

    if (linked) {
      // Soft-disable if historical appointments exist
      const res = await c.env.DB.prepare(
        `UPDATE Services SET IsActive = 0 WHERE TenantId = ? AND Id = ?`
      )
        .bind(tenantId, id)
        .run();
      if ((res.meta.changes ?? 0) === 0) return c.json({ error: 'Serviço não encontrado' }, 404);
      return c.json({ ok: true, softDisabled: true });
    }

    const res = await c.env.DB.prepare(
      `DELETE FROM Services WHERE TenantId = ? AND Id = ?`
    )
      .bind(tenantId, id)
      .run();
    if ((res.meta.changes ?? 0) === 0) return c.json({ error: 'Serviço não encontrado' }, 404);
    return c.json({ ok: true });
  }
);

// ─── Professionals ───────────────────────────────────────────────────────────
adminRoutes.get('/professionals', async (c) => {
  const tenantId = c.get('tenantId')!;
  const [profsRes, linksRes] = await Promise.all([
    c.env.DB.prepare(
      `SELECT Id, TenantId, Name, Description, Specialties, PhotoUrl, IsActive
       FROM Professionals WHERE TenantId = ? ORDER BY Name ASC`
    )
      .bind(tenantId)
      .all<Record<string, unknown>>(),
    c.env.DB.prepare(
      `SELECT ProfessionalId, ServiceId FROM ProfessionalServices WHERE TenantId = ?`
    )
      .bind(tenantId)
      .all<{ ProfessionalId: string; ServiceId: string }>()
  ]);

  const map = new Map<string, string[]>();
  for (const l of linksRes.results) {
    const arr = map.get(l.ProfessionalId) ?? [];
    arr.push(l.ServiceId);
    map.set(l.ProfessionalId, arr);
  }

  return c.json({
    professionals: profsRes.results.map((p) => ({
      id: String(p.Id),
      tenantId: String(p.TenantId),
      name: String(p.Name),
      description: String(p.Description || ''),
      specialties: String(p.Specialties || ''),
      photoUrl: String(p.PhotoUrl || ''),
      isActive: p.IsActive === 1,
      serviceIds: map.get(String(p.Id)) ?? []
    }))
  });
});

adminRoutes.post(
  '/professionals',
  requireTenantAccess(['owner', 'admin', 'manager']),
  async (c) => {
    const tenantId = c.get('tenantId')!;
    const parsed = professionalSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message || 'Dados inválidos' }, 400);
    }

    const [countRow, limitRow] = await Promise.all([
      c.env.DB.prepare(`SELECT COUNT(*) AS Total FROM Professionals WHERE TenantId = ?`)
        .bind(tenantId)
        .first<{ Total: number }>(),
      c.env.DB.prepare(
        `SELECT SettingValue FROM PlatformSettings WHERE SettingKey = 'max_professionals_per_tenant'`
      ).first<{ SettingValue: string }>()
    ]);
    const maxProfs = Number(limitRow?.SettingValue || 25);
    if ((countRow?.Total ?? 0) >= maxProfs) {
      return c.json({ error: `Limite de ${maxProfs} profissionais atingido` }, 403);
    }

    // Validate every serviceId belongs to this tenant
    for (const sId of parsed.data.serviceIds) {
      const srv = await c.env.DB.prepare(
        `SELECT Id FROM Services WHERE TenantId = ? AND Id = ?`
      )
        .bind(tenantId, sId)
        .first();
      if (!srv) {
        return c.json({ error: 'Serviço informado não pertence a este estabelecimento' }, 400);
      }
    }

    const profId = generateId();
    const stmts: D1PreparedStatement[] = [
      c.env.DB.prepare(
        `INSERT INTO Professionals (Id, TenantId, Name, Description, Specialties, PhotoUrl, IsActive)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        profId,
        tenantId,
        parsed.data.name,
        parsed.data.description,
        parsed.data.specialties,
        parsed.data.photoUrl,
        parsed.data.isActive ? 1 : 0
      )
    ];

    for (const sId of parsed.data.serviceIds) {
      stmts.push(
        c.env.DB.prepare(
          `INSERT INTO ProfessionalServices (Id, TenantId, ProfessionalId, ServiceId)
           VALUES (?, ?, ?, ?)`
        ).bind(generateId(), tenantId, profId, sId)
      );
    }

    await c.env.DB.batch(stmts);
    return c.json({ professional: { id: profId, tenantId, ...parsed.data } }, 201);
  }
);

adminRoutes.put(
  '/professionals/:id',
  requireTenantAccess(['owner', 'admin', 'manager']),
  async (c) => {
    const tenantId = c.get('tenantId')!;
    const id = c.req.param('id') || '';
    const parsed = professionalSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message || 'Dados inválidos' }, 400);
    }

    const existing = await c.env.DB.prepare(
      `SELECT Id FROM Professionals WHERE TenantId = ? AND Id = ?`
    )
      .bind(tenantId, id)
      .first();
    if (!existing) {
      return c.json({ error: 'Profissional não encontrado' }, 404);
    }

    for (const sId of parsed.data.serviceIds) {
      const srv = await c.env.DB.prepare(
        `SELECT Id FROM Services WHERE TenantId = ? AND Id = ?`
      )
        .bind(tenantId, sId)
        .first();
      if (!srv) {
        return c.json({ error: 'Serviço inválido' }, 400);
      }
    }

    const stmts: D1PreparedStatement[] = [
      c.env.DB.prepare(
        `UPDATE Professionals SET Name = ?, Description = ?, Specialties = ?, PhotoUrl = ?, IsActive = ?
         WHERE TenantId = ? AND Id = ?`
      ).bind(
        parsed.data.name,
        parsed.data.description,
        parsed.data.specialties,
        parsed.data.photoUrl,
        parsed.data.isActive ? 1 : 0,
        tenantId,
        id
      ),
      c.env.DB.prepare(
        `DELETE FROM ProfessionalServices WHERE TenantId = ? AND ProfessionalId = ?`
      ).bind(tenantId, id)
    ];

    for (const sId of parsed.data.serviceIds) {
      stmts.push(
        c.env.DB.prepare(
          `INSERT INTO ProfessionalServices (Id, TenantId, ProfessionalId, ServiceId)
           VALUES (?, ?, ?, ?)`
        ).bind(generateId(), tenantId, id, sId)
      );
    }

    await c.env.DB.batch(stmts);
    return c.json({ ok: true });
  }
);

adminRoutes.delete(
  '/professionals/:id',
  requireTenantAccess(['owner', 'admin', 'manager']),
  async (c) => {
    const tenantId = c.get('tenantId')!;
    const id = c.req.param('id') || '';
    const linked = await c.env.DB.prepare(
      `SELECT Id FROM Appointments WHERE TenantId = ? AND ProfessionalId = ? LIMIT 1`
    )
      .bind(tenantId, id)
      .first();

    if (linked) {
      const res = await c.env.DB.prepare(
        `UPDATE Professionals SET IsActive = 0 WHERE TenantId = ? AND Id = ?`
      )
        .bind(tenantId, id)
        .run();
      if ((res.meta.changes ?? 0) === 0) return c.json({ error: 'Profissional não encontrado' }, 404);
      return c.json({ ok: true, softDisabled: true });
    }

    const res = await c.env.DB.prepare(
      `DELETE FROM Professionals WHERE TenantId = ? AND Id = ?`
    )
      .bind(tenantId, id)
      .run();
    if ((res.meta.changes ?? 0) === 0) return c.json({ error: 'Profissional não encontrado' }, 404);
    return c.json({ ok: true });
  }
);

// ─── Appointments & Blocked Slots ────────────────────────────────────────────
adminRoutes.get('/appointments', async (c) => {
  const tenantId = c.get('tenantId')!;
  const from = c.req.query('from') || '';
  const to = c.req.query('to') || '';
  const professionalId = c.req.query('professionalId') || '';
  const serviceId = c.req.query('serviceId') || '';

  let sql = `SELECT a.Id, a.TenantId, a.CustomerId, a.ServiceId, a.ProfessionalId,
                    a.StartAt, a.EndAt, a.Status, a.PriceInCents, a.ConfirmationCode,
                    a.Notes, a.Source, a.CreatedAt, a.UpdatedAt,
                    c.Name AS CustomerName, c.Phone AS CustomerPhone,
                    s.Name AS ServiceName, s.DurationMinutes AS ServiceDurationMinutes,
                    p.Name AS ProfessionalName
             FROM Appointments a
             INNER JOIN Customers c ON c.TenantId = a.TenantId AND c.Id = a.CustomerId
             INNER JOIN Services s ON s.TenantId = a.TenantId AND s.Id = a.ServiceId
             INNER JOIN Professionals p ON p.TenantId = a.TenantId AND p.Id = a.ProfessionalId
             WHERE a.TenantId = ?`;
  const binds: unknown[] = [tenantId];

  if (from) {
    sql += ` AND a.StartAt >= ?`;
    binds.push(from);
  }
  if (to) {
    sql += ` AND a.StartAt <= ?`;
    binds.push(to);
  }
  if (professionalId) {
    sql += ` AND a.ProfessionalId = ?`;
    binds.push(professionalId);
  }
  if (serviceId) {
    sql += ` AND a.ServiceId = ?`;
    binds.push(serviceId);
  }
  sql += ` ORDER BY a.StartAt ASC LIMIT 500`;

  const { results } = await c.env.DB.prepare(sql).bind(...binds).all();
  return c.json({ appointments: results });
});

adminRoutes.post(
  '/appointments',
  requireTenantAccess(['owner', 'admin', 'manager', 'receptionist']),
  async (c) => {
    const tenantId = c.get('tenantId')!;
    const parsed = adminAppointmentSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message || 'Dados inválidos' }, 400);
    }

    const result = await createValidatedAppointment({
      db: c.env.DB,
      tenantId,
      serviceId: parsed.data.serviceId,
      professionalId: parsed.data.professionalId,
      startAt: parsed.data.startAt,
      customerName: parsed.data.customerName,
      customerPhone: parsed.data.customerPhone,
      customerEmail: parsed.data.customerEmail,
      notes: parsed.data.notes,
      source: 'admin',
      bypassAdvanceCheck: true
    });

    if (!result.ok) {
      return c.json({ error: result.error }, result.status);
    }
    return c.json({ appointment: result.appointment }, 201);
  }
);

adminRoutes.patch(
  '/appointments/:id/status',
  requireTenantAccess(['owner', 'admin', 'manager', 'receptionist', 'professional']),
  async (c) => {
    const tenantId = c.get('tenantId')!;
    const id = c.req.param('id') || '';
    const body = (await c.req.json().catch(() => null)) as { status?: string } | null;
    const statusSchema = z.enum(['confirmed', 'cancelled', 'completed', 'no_show']);
    const parsed = statusSchema.safeParse(body?.status);
    if (!parsed.success) {
      return c.json({ error: 'Status inválido' }, 400);
    }

    const res = await c.env.DB.prepare(
      `UPDATE Appointments SET Status = ?, UpdatedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE TenantId = ? AND Id = ?`
    )
      .bind(parsed.data, tenantId, id)
      .run();

    if ((res.meta.changes ?? 0) === 0) {
      return c.json({ error: 'Agendamento não encontrado' }, 404);
    }
    return c.json({ ok: true });
  }
);

adminRoutes.post(
  '/appointments/:id/reschedule',
  requireTenantAccess(['owner', 'admin', 'manager', 'receptionist']),
  async (c) => {
    const tenantId = c.get('tenantId')!;
    const id = c.req.param('id') || '';
    const body = (await c.req.json().catch(() => null)) as {
      startAt?: string;
      professionalId?: string;
    } | null;
    if (!body?.startAt) {
      return c.json({ error: 'Informe startAt' }, 400);
    }

    const result = await rescheduleValidatedAppointment({
      db: c.env.DB,
      tenantId,
      appointmentId: id,
      newStartAt: body.startAt,
      newProfessionalId: body.professionalId,
      bypassAdvanceCheck: true
    });

    if (!result.ok) {
      return c.json({ error: result.error }, result.status);
    }
    return c.json({ ok: true, startAt: result.startAt, endAt: result.endAt });
  }
);

adminRoutes.get('/blocked-slots', async (c) => {
  const tenantId = c.get('tenantId')!;
  const { results } = await c.env.DB.prepare(
    `SELECT b.Id, b.TenantId, b.ProfessionalId, b.StartAt, b.EndAt, b.Reason, p.Name AS ProfessionalName
     FROM BlockedSlots b
     LEFT JOIN Professionals p ON p.TenantId = b.TenantId AND p.Id = b.ProfessionalId
     WHERE b.TenantId = ?
     ORDER BY b.StartAt ASC`
  )
    .bind(tenantId)
    .all();
  return c.json({ blockedSlots: results });
});

adminRoutes.post(
  '/blocked-slots',
  requireTenantAccess(['owner', 'admin', 'manager', 'receptionist']),
  async (c) => {
    const tenantId = c.get('tenantId')!;
    const parsed = blockedSlotSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message || 'Dados inválidos' }, 400);
    }

    if (Date.parse(parsed.data.endAt) <= Date.parse(parsed.data.startAt)) {
      return c.json({ error: 'Horário final deve ser maior que o inicial' }, 400);
    }

    if (parsed.data.professionalId) {
      const prof = await c.env.DB.prepare(
        `SELECT Id FROM Professionals WHERE TenantId = ? AND Id = ?`
      )
        .bind(tenantId, parsed.data.professionalId)
        .first();
      if (!prof) return c.json({ error: 'Profissional inválido' }, 400);
    }

    const id = generateId();
    await c.env.DB.prepare(
      `INSERT INTO BlockedSlots (Id, TenantId, ProfessionalId, StartAt, EndAt, Reason)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
      .bind(
        id,
        tenantId,
        parsed.data.professionalId ?? null,
        new Date(parsed.data.startAt).toISOString(),
        new Date(parsed.data.endAt).toISOString(),
        parsed.data.reason
      )
      .run();

    return c.json({ id }, 201);
  }
);

adminRoutes.delete(
  '/blocked-slots/:id',
  requireTenantAccess(['owner', 'admin', 'manager', 'receptionist']),
  async (c) => {
    const tenantId = c.get('tenantId')!;
    const id = c.req.param('id') || '';
    const res = await c.env.DB.prepare(
      `DELETE FROM BlockedSlots WHERE TenantId = ? AND Id = ?`
    )
      .bind(tenantId, id)
      .run();
    if ((res.meta.changes ?? 0) === 0) return c.json({ error: 'Bloqueio não encontrado' }, 404);
    return c.json({ ok: true });
  }
);

// ─── Customers ───────────────────────────────────────────────────────────────
adminRoutes.get('/customers', async (c) => {
  const tenantId = c.get('tenantId')!;
  const q = (c.req.query('q') || '').trim();
  let sql = `SELECT c.Id, c.TenantId, c.Name, c.Phone, c.Email, c.CreatedAt, c.UpdatedAt,
                    COUNT(a.Id) AS AppointmentCount,
                    MAX(a.StartAt) AS LastAppointmentAt
             FROM Customers c
             LEFT JOIN Appointments a ON a.TenantId = c.TenantId AND a.CustomerId = c.Id
             WHERE c.TenantId = ?`;
  const binds: unknown[] = [tenantId];

  if (q) {
    sql += ` AND (c.Name LIKE ? OR c.Phone LIKE ? OR c.Email LIKE ?)`;
    const like = `%${q}%`;
    binds.push(like, like, like);
  }
  sql += ` GROUP BY c.Id ORDER BY c.UpdatedAt DESC LIMIT 200`;

  const { results } = await c.env.DB.prepare(sql).bind(...binds).all();
  return c.json({ customers: results });
});

adminRoutes.get('/customers/:id', async (c) => {
  const tenantId = c.get('tenantId')!;
  const id = c.req.param('id');
  const customer = await c.env.DB.prepare(
    `SELECT Id, TenantId, Name, Phone, Email, CreatedAt, UpdatedAt
     FROM Customers WHERE TenantId = ? AND Id = ?`
  )
    .bind(tenantId, id)
    .first();

  if (!customer) {
    return c.json({ error: 'Cliente não encontrado' }, 404);
  }

  const { results: appointments } = await c.env.DB.prepare(
    `SELECT a.Id, a.StartAt, a.EndAt, a.Status, a.PriceInCents, a.ConfirmationCode, a.Source,
            s.Name AS ServiceName, p.Name AS ProfessionalName
     FROM Appointments a
     INNER JOIN Services s ON s.TenantId = a.TenantId AND s.Id = a.ServiceId
     INNER JOIN Professionals p ON p.TenantId = a.TenantId AND p.Id = a.ProfessionalId
     WHERE a.TenantId = ? AND a.CustomerId = ?
     ORDER BY a.StartAt DESC`
  )
    .bind(tenantId, id)
    .all();

  return c.json({ customer, appointments });
});

// ─── Gallery ─────────────────────────────────────────────────────────────────
adminRoutes.get('/gallery', async (c) => {
  const tenantId = c.get('tenantId')!;
  const { results } = await c.env.DB.prepare(
    `SELECT Id, TenantId, ImageUrl, Caption, DisplayOrder, IsActive
     FROM GalleryImages WHERE TenantId = ? ORDER BY DisplayOrder ASC`
  )
    .bind(tenantId)
    .all<Record<string, unknown>>();
  return c.json({
    images: results.map((g) => ({
      id: String(g.Id),
      tenantId: String(g.TenantId),
      imageUrl: String(g.ImageUrl),
      caption: String(g.Caption || ''),
      displayOrder: Number(g.DisplayOrder),
      isActive: g.IsActive === 1
    }))
  });
});

adminRoutes.post(
  '/gallery',
  requireTenantAccess(['owner', 'admin', 'manager']),
  async (c) => {
    const tenantId = c.get('tenantId')!;
    const parsed = galleryImageSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message || 'Dados inválidos' }, 400);
    }

    const [countRow, limitRow] = await Promise.all([
      c.env.DB.prepare(`SELECT COUNT(*) AS Total FROM GalleryImages WHERE TenantId = ?`)
        .bind(tenantId)
        .first<{ Total: number }>(),
      c.env.DB.prepare(
        `SELECT SettingValue FROM PlatformSettings WHERE SettingKey = 'max_gallery_images_per_tenant'`
      ).first<{ SettingValue: string }>()
    ]);
    const maxGallery = Number(limitRow?.SettingValue || 30);
    if ((countRow?.Total ?? 0) >= maxGallery) {
      return c.json({ error: `Limite de ${maxGallery} imagens na galeria atingido` }, 403);
    }

    const id = generateId();
    await c.env.DB.prepare(
      `INSERT INTO GalleryImages (Id, TenantId, ImageUrl, Caption, DisplayOrder, IsActive)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
      .bind(
        id,
        tenantId,
        parsed.data.imageUrl,
        parsed.data.caption,
        parsed.data.displayOrder,
        parsed.data.isActive ? 1 : 0
      )
      .run();

    return c.json({ image: { id, tenantId, ...parsed.data } }, 201);
  }
);

adminRoutes.put(
  '/gallery/reorder',
  requireTenantAccess(['owner', 'admin', 'manager']),
  async (c) => {
    const tenantId = c.get('tenantId')!;
    const body = (await c.req.json().catch(() => null)) as { orderedIds?: string[] } | null;
    if (!body?.orderedIds || !Array.isArray(body.orderedIds)) {
      return c.json({ error: 'orderedIds obrigatório' }, 400);
    }

    await c.env.DB.batch(
      body.orderedIds.map((id, idx) =>
        c.env.DB.prepare(
          `UPDATE GalleryImages SET DisplayOrder = ? WHERE TenantId = ? AND Id = ?`
        ).bind(idx, tenantId, id)
      )
    );
    return c.json({ ok: true });
  }
);

adminRoutes.put(
  '/gallery/:id',
  requireTenantAccess(['owner', 'admin', 'manager']),
  async (c) => {
    const tenantId = c.get('tenantId')!;
    const id = c.req.param('id') || '';
    const parsed = galleryImageSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message || 'Dados inválidos' }, 400);
    }
    const res = await c.env.DB.prepare(
      `UPDATE GalleryImages SET ImageUrl = ?, Caption = ?, DisplayOrder = ?, IsActive = ?
       WHERE TenantId = ? AND Id = ?`
    )
      .bind(
        parsed.data.imageUrl,
        parsed.data.caption,
        parsed.data.displayOrder,
        parsed.data.isActive ? 1 : 0,
        tenantId,
        id
      )
      .run();
    if ((res.meta.changes ?? 0) === 0) return c.json({ error: 'Imagem não encontrada' }, 404);
    return c.json({ ok: true });
  }
);

adminRoutes.delete(
  '/gallery/:id',
  requireTenantAccess(['owner', 'admin', 'manager']),
  async (c) => {
    const tenantId = c.get('tenantId')!;
    const id = c.req.param('id') || '';
    const res = await c.env.DB.prepare(
      `DELETE FROM GalleryImages WHERE TenantId = ? AND Id = ?`
    )
      .bind(tenantId, id)
      .run();
    if ((res.meta.changes ?? 0) === 0) return c.json({ error: 'Imagem não encontrada' }, 404);
    return c.json({ ok: true });
  }
);

// ─── Team Roles (Prepared for future staff management) ───────────────────────
adminRoutes.get('/team', async (c) => {
  const tenantId = c.get('tenantId')!;
  const { results } = await c.env.DB.prepare(
    `SELECT tu.Id, tu.Role, tu.ProfessionalId, tu.CreatedAt, u.Name, u.Email, u.Status
     FROM TenantUsers tu
     INNER JOIN Users u ON u.Id = tu.UserId
     WHERE tu.TenantId = ?
     ORDER BY tu.CreatedAt ASC`
  )
    .bind(tenantId)
    .all();
  return c.json({ members: results });
});
