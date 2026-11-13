import { Hono } from 'hono';
import type { AppEnv } from '@worker/types';
import type { PublicBarbershopPayload, TenantStatus } from '@shared/types';
import { publicBookingSchema } from '@shared/schemas';
import { verifyTurnstileToken } from '@worker/lib/turnstile';
import { rateLimitMiddleware } from '@worker/middleware/auth';
import {
  createValidatedAppointment,
  getAvailableSlots,
  getTenantBookingSettings,
  rescheduleValidatedAppointment
} from '@worker/domains/scheduling/engine';

export const publicRoutes = new Hono<AppEnv>();

async function resolvePublicTenant(
  db: D1Database,
  slug: string,
  allowPreviewForTenantId?: string | null
) {
  const tenant = await db
    .prepare(`SELECT Id, Name, Slug, Status FROM Tenants WHERE Slug = ?`)
    .bind(slug.toLowerCase())
    .first<{ Id: string; Name: string; Slug: string; Status: TenantStatus }>();

  if (!tenant) return null;
  if (tenant.Status === 'active') return tenant;
  if (allowPreviewForTenantId && tenant.Id === allowPreviewForTenantId && tenant.Status !== 'blocked') {
    return tenant;
  }
  return null;
}

publicRoutes.get('/showcase', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT t.Slug, bp.BusinessName, bp.Tagline, bp.City, bp.State, bp.LogoUrl, bp.CoverImageUrl, bp.PrimaryColor
     FROM Tenants t
     INNER JOIN BusinessProfiles bp ON bp.TenantId = t.Id
     WHERE t.Status = 'active'
     ORDER BY t.CreatedAt DESC
     LIMIT 6`
  ).all();

  return c.json({ barbershops: results });
});

publicRoutes.get('/:slug', async (c) => {
  const slug = c.req.param('slug');
  const preview = c.req.query('preview') === '1';
  const tenant = await resolvePublicTenant(
    c.env.DB,
    slug,
    preview ? c.get('tenantId') : null
  );

  if (!tenant) {
    return c.json({ error: 'Barbearia não encontrada' }, 404);
  }

  const [
    profileRow,
    categoriesRes,
    servicesRes,
    professionalsRes,
    profServicesRes,
    hoursRes,
    galleryRes,
    settings
  ] = await Promise.all([
    c.env.DB.prepare(`SELECT * FROM BusinessProfiles WHERE TenantId = ?`)
      .bind(tenant.Id)
      .first<Record<string, unknown>>(),
    c.env.DB.prepare(
      `SELECT Id, TenantId, Name, Description, IsActive
       FROM ServiceCategories WHERE TenantId = ? AND IsActive = 1 ORDER BY Name ASC`
    )
      .bind(tenant.Id)
      .all<Record<string, unknown>>(),
    c.env.DB.prepare(
      `SELECT Id, TenantId, CategoryId, Name, Description, PriceInCents, DurationMinutes, ImageUrl, IsActive
       FROM Services WHERE TenantId = ? AND IsActive = 1 ORDER BY Name ASC`
    )
      .bind(tenant.Id)
      .all<Record<string, unknown>>(),
    c.env.DB.prepare(
      `SELECT Id, TenantId, Name, Description, Specialties, PhotoUrl, IsActive
       FROM Professionals WHERE TenantId = ? AND IsActive = 1 ORDER BY Name ASC`
    )
      .bind(tenant.Id)
      .all<Record<string, unknown>>(),
    c.env.DB.prepare(
      `SELECT ProfessionalId, ServiceId FROM ProfessionalServices WHERE TenantId = ?`
    )
      .bind(tenant.Id)
      .all<{ ProfessionalId: string; ServiceId: string }>(),
    c.env.DB.prepare(
      `SELECT Id, TenantId, ProfessionalId, DayOfWeek, StartTime, EndTime, BreakStart, BreakEnd, IsAvailable
       FROM WorkingHours WHERE TenantId = ? AND ProfessionalId IS NULL ORDER BY DayOfWeek ASC`
    )
      .bind(tenant.Id)
      .all<Record<string, unknown>>(),
    c.env.DB.prepare(
      `SELECT Id, TenantId, ImageUrl, Caption, DisplayOrder, IsActive
       FROM GalleryImages WHERE TenantId = ? AND IsActive = 1 ORDER BY DisplayOrder ASC`
    )
      .bind(tenant.Id)
      .all<Record<string, unknown>>(),
    getTenantBookingSettings(c.env.DB, tenant.Id)
  ]);

  if (!profileRow) {
    return c.json({ error: 'Perfil da barbearia não encontrado' }, 404);
  }

  const serviceIdsByProf = new Map<string, string[]>();
  for (const link of profServicesRes.results) {
    const arr = serviceIdsByProf.get(link.ProfessionalId) ?? [];
    arr.push(link.ServiceId);
    serviceIdsByProf.set(link.ProfessionalId, arr);
  }

  const payload: PublicBarbershopPayload = {
    tenant: {
      id: tenant.Id,
      name: tenant.Name,
      slug: tenant.Slug,
      status: tenant.Status
    },
    profile: {
      id: String(profileRow.Id),
      tenantId: String(profileRow.TenantId),
      businessName: String(profileRow.BusinessName),
      tagline: String(profileRow.Tagline || ''),
      heroSubtitle: String(profileRow.HeroSubtitle || ''),
      description: String(profileRow.Description || ''),
      aboutText: String(profileRow.AboutText || ''),
      footerText: String(profileRow.FooterText || ''),
      templateKey: (profileRow.TemplateKey as PublicBarbershopPayload['profile']['templateKey']) || 'classic-luxury',
      logoUrl: String(profileRow.LogoUrl || ''),
      coverImageUrl: String(profileRow.CoverImageUrl || ''),
      primaryColor: String(profileRow.PrimaryColor || '#d97706'),
      secondaryColor: String(profileRow.SecondaryColor || '#0f172a'),
      accentColor: String(profileRow.AccentColor || '#f59e0b'),
      showGallery: profileRow.ShowGallery === 1,
      showTeam: profileRow.ShowTeam === 1,
      showMap: profileRow.ShowMap === 1,
      phone: String(profileRow.Phone || ''),
      whatsAppNumber: String(profileRow.WhatsAppNumber || ''),
      telegramUsername: String(profileRow.TelegramUsername || ''),
      email: String(profileRow.Email || ''),
      instagram: String(profileRow.Instagram || ''),
      postalCode: String(profileRow.PostalCode || ''),
      street: String(profileRow.Street || ''),
      number: String(profileRow.Number || ''),
      neighborhood: String(profileRow.Neighborhood || ''),
      city: String(profileRow.City || ''),
      state: String(profileRow.State || ''),
      complement: String(profileRow.Complement || ''),
      latitude: profileRow.Latitude !== null ? Number(profileRow.Latitude) : null,
      longitude: profileRow.Longitude !== null ? Number(profileRow.Longitude) : null
    },
    categories: categoriesRes.results.map((cat) => ({
      id: String(cat.Id),
      tenantId: String(cat.TenantId),
      name: String(cat.Name),
      description: String(cat.Description || ''),
      isActive: cat.IsActive === 1
    })),
    services: servicesRes.results.map((srv) => ({
      id: String(srv.Id),
      tenantId: String(srv.TenantId),
      categoryId: srv.CategoryId ? String(srv.CategoryId) : null,
      name: String(srv.Name),
      description: String(srv.Description || ''),
      priceInCents: Number(srv.PriceInCents),
      durationMinutes: Number(srv.DurationMinutes),
      imageUrl: String(srv.ImageUrl || ''),
      isActive: srv.IsActive === 1
    })),
    professionals: professionalsRes.results.map((p) => ({
      id: String(p.Id),
      tenantId: String(p.TenantId),
      name: String(p.Name),
      description: String(p.Description || ''),
      specialties: String(p.Specialties || ''),
      photoUrl: String(p.PhotoUrl || ''),
      isActive: p.IsActive === 1,
      serviceIds: serviceIdsByProf.get(String(p.Id)) ?? []
    })),
    workingHours: hoursRes.results.map((h) => ({
      id: String(h.Id),
      tenantId: String(h.TenantId),
      professionalId: null,
      dayOfWeek: Number(h.DayOfWeek),
      startTime: String(h.StartTime),
      endTime: String(h.EndTime),
      breakStart: h.BreakStart ? String(h.BreakStart) : null,
      breakEnd: h.BreakEnd ? String(h.BreakEnd) : null,
      isAvailable: h.IsAvailable === 1
    })),
    gallery: galleryRes.results.map((g) => ({
      id: String(g.Id),
      tenantId: String(g.TenantId),
      imageUrl: String(g.ImageUrl),
      caption: String(g.Caption || ''),
      displayOrder: Number(g.DisplayOrder),
      isActive: g.IsActive === 1
    })),
    settings: {
      slotIntervalMinutes: settings.slotIntervalMinutes,
      minAdvanceMinutes: settings.minAdvanceMinutes,
      maxAdvanceDays: settings.maxAdvanceDays,
      allowPublicCancellation: settings.allowPublicCancellation
    }
  };

  return c.json(payload);
});

publicRoutes.get('/:slug/slots', async (c) => {
  const slug = c.req.param('slug');
  const tenant = await resolvePublicTenant(c.env.DB, slug, c.get('tenantId'));
  if (!tenant) {
    return c.json({ error: 'Barbearia não encontrada' }, 404);
  }

  const date = c.req.query('date') || '';
  const serviceId = c.req.query('serviceId') || '';
  const professionalId = c.req.query('professionalId') || '';

  if (!date || !serviceId || !professionalId) {
    return c.json({ error: 'Informe date, serviceId e professionalId' }, 400);
  }

  const result = await getAvailableSlots({
    db: c.env.DB,
    tenantId: tenant.Id,
    date,
    serviceId,
    professionalId
  });

  return c.json(result);
});

publicRoutes.post(
  '/:slug/appointments',
  rateLimitMiddleware('public-booking', 15, 60_000),
  async (c) => {
    const slug = c.req.param('slug') || '';
    const tenant = await resolvePublicTenant(c.env.DB, slug);
    if (!tenant) {
      return c.json({ error: 'Barbearia não encontrada ou inativa' }, 404);
    }

    const body = await c.req.json().catch(() => null);
    const parsed = publicBookingSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message || 'Dados inválidos' }, 400);
    }

    const turnstileOk = await verifyTurnstileToken(
      c.env,
      parsed.data.turnstileToken,
      c.req.header('CF-Connecting-IP')
    );
    if (!turnstileOk) {
      return c.json({ error: 'Falha na verificação anti-robô (Turnstile)' }, 400);
    }

    const result = await createValidatedAppointment({
      db: c.env.DB,
      tenantId: tenant.Id,
      serviceId: parsed.data.serviceId,
      professionalId: parsed.data.professionalId,
      startAt: parsed.data.startAt,
      customerName: parsed.data.customerName,
      customerPhone: parsed.data.customerPhone,
      customerEmail: parsed.data.customerEmail,
      notes: parsed.data.notes,
      source: 'web'
    });

    if (!result.ok) {
      return c.json({ error: result.error }, result.status);
    }

    return c.json({ appointment: result.appointment }, 201);
  }
);

publicRoutes.get('/:slug/appointments/lookup', async (c) => {
  const slug = c.req.param('slug');
  const tenant = await resolvePublicTenant(c.env.DB, slug);
  if (!tenant) return c.json({ error: 'Barbearia não encontrada' }, 404);

  const code = (c.req.query('code') || '').trim().toUpperCase();
  const name = (c.req.query('name') || '').trim().toLowerCase();
  const phone = (c.req.query('phone') || '').replace(/\D/g, '');

  const conditions = ['a.TenantId = ?'];
  const bindings: unknown[] = [tenant.Id];

  if (code) {
    conditions.push('a.ConfirmationCode = ?');
    bindings.push(code);
  }
  if (name) {
    conditions.push('LOWER(c.Name) LIKE ?');
    bindings.push(`%${name}%`);
  }
  if (phone) {
    conditions.push('c.Phone LIKE ?');
    bindings.push(`%${phone}%`);
  }

  const res = await c.env.DB.prepare(
    `SELECT a.Id, a.StartAt, a.EndAt, a.Status, a.PriceInCents, a.ConfirmationCode,
            a.ServiceId, a.ProfessionalId,
            s.Name AS ServiceName, p.Name AS ProfessionalName, c.Name AS CustomerName
     FROM Appointments a
     INNER JOIN Customers c ON c.TenantId = a.TenantId AND c.Id = a.CustomerId
     INNER JOIN Services s ON s.TenantId = a.TenantId AND s.Id = a.ServiceId
     INNER JOIN Professionals p ON p.TenantId = a.TenantId AND p.Id = a.ProfessionalId
     WHERE ${conditions.join(' AND ')}
     ORDER BY a.StartAt DESC
     LIMIT 20`
  )
    .bind(...bindings)
    .all();

  const appointments = res.results || [];
  if (code && appointments.length === 0) {
    return c.json({ error: 'Agendamento não encontrado com este código' }, 404);
  }

  return c.json({
    appointments,
    appointment: appointments[0] ?? null
  });
});

publicRoutes.post('/:slug/appointments/cancel', async (c) => {
  const slug = c.req.param('slug');
  const tenant = await resolvePublicTenant(c.env.DB, slug);
  if (!tenant) return c.json({ error: 'Barbearia não encontrada' }, 404);

  const settings = await getTenantBookingSettings(c.env.DB, tenant.Id);
  if (!settings.allowPublicCancellation) {
    return c.json({ error: 'Cancelamento online desabilitado pelo estabelecimento' }, 403);
  }

  const body = (await c.req.json().catch(() => null)) as {
    appointmentId?: string;
    code?: string;
    phone?: string;
  } | null;
  const appointmentId = (body?.appointmentId || '').trim();
  const code = (body?.code || '').trim().toUpperCase();
  const phone = (body?.phone || '').replace(/\D/g, '');
  if (!code || (!phone && !appointmentId)) {
    return c.json({ error: 'Informe os dados do agendamento para cancelar' }, 400);
  }

  const appt = appointmentId
    ? await c.env.DB.prepare(
        `SELECT a.Id, a.Status
         FROM Appointments a
         WHERE a.TenantId = ? AND a.Id = ? AND a.ConfirmationCode = ?`
      )
        .bind(tenant.Id, appointmentId, code)
        .first<{ Id: string; Status: string }>()
    : await c.env.DB.prepare(
        `SELECT a.Id, a.Status
         FROM Appointments a
         INNER JOIN Customers c ON c.TenantId = a.TenantId AND c.Id = a.CustomerId
         WHERE a.TenantId = ? AND a.ConfirmationCode = ? AND c.Phone = ?`
      )
        .bind(tenant.Id, code, phone)
        .first<{ Id: string; Status: string }>();

  if (!appt) {
    return c.json({ error: 'Agendamento não encontrado' }, 404);
  }
  if (appt.Status === 'cancelled') {
    return c.json({ ok: true, status: 'cancelled' });
  }

  await c.env.DB.prepare(
    `UPDATE Appointments SET Status = 'cancelled', UpdatedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     WHERE TenantId = ? AND Id = ?`
  )
    .bind(tenant.Id, appt.Id)
    .run();

  return c.json({ ok: true, status: 'cancelled' });
});

publicRoutes.post('/:slug/appointments/reschedule', async (c) => {
  const slug = c.req.param('slug');
  const tenant = await resolvePublicTenant(c.env.DB, slug);
  if (!tenant) return c.json({ error: 'Barbearia não encontrada' }, 404);

  const body = (await c.req.json().catch(() => null)) as {
    appointmentId?: string;
    code?: string;
    phone?: string;
    newStartAt?: string;
    newProfessionalId?: string;
  } | null;

  const appointmentId = (body?.appointmentId || '').trim();
  const code = (body?.code || '').trim().toUpperCase();
  const phone = (body?.phone || '').replace(/\D/g, '');
  if (!code || (!phone && !appointmentId) || !body?.newStartAt) {
    return c.json({ error: 'Informe o agendamento e o novo horário' }, 400);
  }

  const appt = appointmentId
    ? await c.env.DB.prepare(
        `SELECT a.Id
         FROM Appointments a
         WHERE a.TenantId = ? AND a.Id = ? AND a.ConfirmationCode = ?`
      )
        .bind(tenant.Id, appointmentId, code)
        .first<{ Id: string }>()
    : await c.env.DB.prepare(
        `SELECT a.Id
         FROM Appointments a
         INNER JOIN Customers c ON c.TenantId = a.TenantId AND c.Id = a.CustomerId
         WHERE a.TenantId = ? AND a.ConfirmationCode = ? AND c.Phone = ?`
      )
        .bind(tenant.Id, code, phone)
        .first<{ Id: string }>();

  if (!appt) {
    return c.json({ error: 'Agendamento não encontrado' }, 404);
  }

  const result = await rescheduleValidatedAppointment({
    db: c.env.DB,
    tenantId: tenant.Id,
    appointmentId: appt.Id,
    newStartAt: body.newStartAt,
    newProfessionalId: body.newProfessionalId
  });

  if (!result.ok) {
    return c.json({ error: result.error }, result.status);
  }

  return c.json({ ok: true, startAt: result.startAt, endAt: result.endAt });
});
