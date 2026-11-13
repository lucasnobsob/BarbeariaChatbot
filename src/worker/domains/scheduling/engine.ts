import {
  generateConfirmationCode,
  generateId
} from '@worker/lib/crypto';
import type { AppointmentSource } from '@shared/types';

export interface TenantBookingSettings {
  slotIntervalMinutes: number;
  minAdvanceMinutes: number;
  maxAdvanceDays: number;
  allowPublicCancellation: boolean;
  timezoneOffsetMinutes: number;
}

export interface AvailableSlot {
  time: string; // HH:MM local
  startAt: string; // ISO UTC
  endAt: string; // ISO UTC
}

function parseTimeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function minutesToHHMM(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function localDateTimeToUtcIso(
  dateStr: string,
  minutesFromMidnight: number,
  timezoneOffsetMinutes: number
): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const localUtcBase = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  // local = utc + offset => utc = local - offset
  const utcMs = localUtcBase + (minutesFromMidnight - timezoneOffsetMinutes) * 60_000;
  return new Date(utcMs).toISOString();
}

export function utcIsoToLocalDateAndTime(
  iso: string,
  timezoneOffsetMinutes: number
): { date: string; time: string; minutes: number; dayOfWeek: number } {
  const ms = Date.parse(iso) + timezoneOffsetMinutes * 60_000;
  const d = new Date(ms);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const hh = d.getUTCHours();
  const mm = d.getUTCMinutes();
  return {
    date: `${year}-${month}-${day}`,
    time: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`,
    minutes: hh * 60 + mm,
    dayOfWeek: d.getUTCDay()
  };
}

export function getLocalDayOfWeek(dateStr: string): number {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export async function getTenantBookingSettings(
  db: D1Database,
  tenantId: string
): Promise<TenantBookingSettings> {
  const { results } = await db
    .prepare(`SELECT SettingKey, SettingValue FROM BusinessSettings WHERE TenantId = ?`)
    .bind(tenantId)
    .all<{ SettingKey: string; SettingValue: string }>();

  const map = new Map<string, string>();
  for (const row of results) {
    map.set(row.SettingKey, row.SettingValue);
  }

  return {
    slotIntervalMinutes: Math.max(5, Number(map.get('slot_interval_minutes') ?? 30)),
    minAdvanceMinutes: Math.max(0, Number(map.get('min_advance_minutes') ?? 30)),
    maxAdvanceDays: Math.max(1, Number(map.get('max_advance_days') ?? 30)),
    allowPublicCancellation: (map.get('allow_public_cancellation') ?? 'true') !== 'false',
    timezoneOffsetMinutes: Number(map.get('timezone_offset_minutes') ?? -180)
  };
}

export async function checkProfessionalOffersService(
  db: D1Database,
  tenantId: string,
  professionalId: string,
  serviceId: string
): Promise<boolean> {
  const link = await db
    .prepare(
      `SELECT 1 AS Ok FROM ProfessionalServices
       WHERE TenantId = ? AND ProfessionalId = ? AND ServiceId = ?`
    )
    .bind(tenantId, professionalId, serviceId)
    .first<{ Ok: number }>();
  return Boolean(link);
}

export async function getAvailableSlots(params: {
  db: D1Database;
  tenantId: string;
  date: string; // YYYY-MM-DD
  serviceId: string;
  professionalId: string;
  nowMs?: number;
  bypassAdvanceCheck?: boolean;
}): Promise<{ slots: AvailableSlot[]; error?: string }> {
  const { db, tenantId, date, serviceId, professionalId, bypassAdvanceCheck } = params;
  const nowMs = params.nowMs ?? Date.now();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { slots: [], error: 'Data inválida (use YYYY-MM-DD)' };
  }

  const service = await db
    .prepare(
      `SELECT Id, DurationMinutes, PriceInCents, IsActive
       FROM Services WHERE TenantId = ? AND Id = ?`
    )
    .bind(tenantId, serviceId)
    .first<{ Id: string; DurationMinutes: number; PriceInCents: number; IsActive: number }>();

  if (!service || service.IsActive !== 1) {
    return { slots: [], error: 'Serviço não encontrado ou inativo' };
  }

  const prof = await db
    .prepare(
      `SELECT Id, IsActive FROM Professionals WHERE TenantId = ? AND Id = ?`
    )
    .bind(tenantId, professionalId)
    .first<{ Id: string; IsActive: number }>();

  if (!prof || prof.IsActive !== 1) {
    return { slots: [], error: 'Profissional não encontrado ou inativo' };
  }

  const offers = await checkProfessionalOffersService(db, tenantId, professionalId, serviceId);
  if (!offers) {
    return { slots: [], error: 'Este profissional não realiza o serviço selecionado' };
  }

  const settings = await getTenantBookingSettings(db, tenantId);
  const dayOfWeek = getLocalDayOfWeek(date);

  if (!bypassAdvanceCheck) {
    const todayLocal = utcIsoToLocalDateAndTime(
      new Date(nowMs).toISOString(),
      settings.timezoneOffsetMinutes
    ).date;
    if (date < todayLocal) {
      return { slots: [] };
    }
    const maxDateMs = nowMs + settings.maxAdvanceDays * 86_400_000;
    const maxDateLocal = utcIsoToLocalDateAndTime(
      new Date(maxDateMs).toISOString(),
      settings.timezoneOffsetMinutes
    ).date;
    if (date > maxDateLocal) {
      return { slots: [], error: `Agendamentos permitidos com até ${settings.maxAdvanceDays} dias de antecedência` };
    }
  }

  // Professional-specific working hours override general shop hours
  let wh = await db
    .prepare(
      `SELECT StartTime, EndTime, BreakStart, BreakEnd, IsAvailable
       FROM WorkingHours
       WHERE TenantId = ? AND ProfessionalId = ? AND DayOfWeek = ?`
    )
    .bind(tenantId, professionalId, dayOfWeek)
    .first<{
      StartTime: string;
      EndTime: string;
      BreakStart: string | null;
      BreakEnd: string | null;
      IsAvailable: number;
    }>();

  if (!wh) {
    wh = await db
      .prepare(
        `SELECT StartTime, EndTime, BreakStart, BreakEnd, IsAvailable
         FROM WorkingHours
         WHERE TenantId = ? AND ProfessionalId IS NULL AND DayOfWeek = ?`
      )
      .bind(tenantId, dayOfWeek)
      .first();
  }

  if (!wh || wh.IsAvailable !== 1) {
    return { slots: [] };
  }

  const startMin = parseTimeToMinutes(wh.StartTime);
  const endMin = parseTimeToMinutes(wh.EndTime);
  const breakStartMin = wh.BreakStart ? parseTimeToMinutes(wh.BreakStart) : null;
  const breakEndMin = wh.BreakEnd ? parseTimeToMinutes(wh.BreakEnd) : null;

  const dayStartUtc = localDateTimeToUtcIso(date, 0, settings.timezoneOffsetMinutes);
  const dayEndUtc = localDateTimeToUtcIso(date, 24 * 60, settings.timezoneOffsetMinutes);

  const [{ results: appointments }, { results: blocks }] = await Promise.all([
    db
      .prepare(
        `SELECT StartAt, EndAt FROM Appointments
         WHERE TenantId = ? AND ProfessionalId = ? AND Status = 'confirmed'
           AND StartAt < ? AND EndAt > ?`
      )
      .bind(tenantId, professionalId, dayEndUtc, dayStartUtc)
      .all<{ StartAt: string; EndAt: string }>(),
    db
      .prepare(
        `SELECT StartAt, EndAt FROM BlockedSlots
         WHERE TenantId = ? AND (ProfessionalId IS NULL OR ProfessionalId = ?)
           AND StartAt < ? AND EndAt > ?`
      )
      .bind(tenantId, professionalId, dayEndUtc, dayStartUtc)
      .all<{ StartAt: string; EndAt: string }>()
  ]);

  const busyRanges = [
    ...appointments.map((a) => ({ start: Date.parse(a.StartAt), end: Date.parse(a.EndAt) })),
    ...blocks.map((b) => ({ start: Date.parse(b.StartAt), end: Date.parse(b.EndAt) }))
  ];

  const minAllowedMs = bypassAdvanceCheck
    ? 0
    : nowMs + settings.minAdvanceMinutes * 60_000;

  const slots: AvailableSlot[] = [];
  const duration = service.DurationMinutes;
  const step = settings.slotIntervalMinutes;

  for (let m = startMin; m + duration <= endMin; m += step) {
    const slotEndMin = m + duration;
    if (
      breakStartMin !== null &&
      breakEndMin !== null &&
      m < breakEndMin &&
      slotEndMin > breakStartMin
    ) {
      continue;
    }

    const slotStartIso = localDateTimeToUtcIso(date, m, settings.timezoneOffsetMinutes);
    const slotEndIso = localDateTimeToUtcIso(date, slotEndMin, settings.timezoneOffsetMinutes);
    const slotStartMs = Date.parse(slotStartIso);
    const slotEndMs = Date.parse(slotEndIso);

    if (slotStartMs < minAllowedMs) {
      continue;
    }

    const overlaps = busyRanges.some(
      (r) => slotStartMs < r.end && slotEndMs > r.start
    );
    if (overlaps) {
      continue;
    }

    slots.push({
      time: minutesToHHMM(m),
      startAt: slotStartIso,
      endAt: slotEndIso
    });
  }

  return { slots };
}

export async function createValidatedAppointment(params: {
  db: D1Database;
  tenantId: string;
  serviceId: string;
  professionalId: string;
  startAt: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  notes?: string;
  source: AppointmentSource;
  bypassAdvanceCheck?: boolean;
  nowMs?: number;
}): Promise<{
  ok: true;
  appointment: {
    id: string;
    confirmationCode: string;
    startAt: string;
    endAt: string;
    priceInCents: number;
    serviceName: string;
    professionalName: string;
    customerName: string;
  };
} | {
  ok: false;
  status: 400 | 404 | 409;
  error: string;
}> {
  const { db, tenantId, serviceId, professionalId, startAt, source, bypassAdvanceCheck } = params;

  const parsedStartMs = Date.parse(startAt);
  if (Number.isNaN(parsedStartMs)) {
    return { ok: false, status: 400, error: 'Data/horário de início inválido' };
  }

  const service = await db
    .prepare(
      `SELECT Id, Name, PriceInCents, DurationMinutes, IsActive
       FROM Services WHERE TenantId = ? AND Id = ?`
    )
    .bind(tenantId, serviceId)
    .first<{
      Id: string;
      Name: string;
      PriceInCents: number;
      DurationMinutes: number;
      IsActive: number;
    }>();

  if (!service || service.IsActive !== 1) {
    return { ok: false, status: 404, error: 'Serviço não encontrado neste estabelecimento' };
  }

  const prof = await db
    .prepare(
      `SELECT Id, Name, IsActive FROM Professionals WHERE TenantId = ? AND Id = ?`
    )
    .bind(tenantId, professionalId)
    .first<{ Id: string; Name: string; IsActive: number }>();

  if (!prof || prof.IsActive !== 1) {
    return { ok: false, status: 404, error: 'Profissional não encontrado neste estabelecimento' };
  }

  const offers = await checkProfessionalOffersService(db, tenantId, professionalId, serviceId);
  if (!offers) {
    return { ok: false, status: 400, error: 'Este profissional não atende o serviço escolhido' };
  }

  const settings = await getTenantBookingSettings(db, tenantId);
  const normalizedStartIso = new Date(parsedStartMs).toISOString();
  const local = utcIsoToLocalDateAndTime(normalizedStartIso, settings.timezoneOffsetMinutes);

  const availability = await getAvailableSlots({
    db,
    tenantId,
    date: local.date,
    serviceId,
    professionalId,
    nowMs: params.nowMs,
    bypassAdvanceCheck
  });

  if (availability.error) {
    return { ok: false, status: 400, error: availability.error };
  }

  const matchedSlot = availability.slots.find((s) => Date.parse(s.startAt) === parsedStartMs);
  if (!matchedSlot) {
    return {
      ok: false,
      status: 409,
      error: 'Horário indisponível ou já reservado. Escolha outro horário.'
    };
  }

  // Final race-condition conflict check directly against D1
  const conflict = await db
    .prepare(
      `SELECT Id FROM Appointments
       WHERE TenantId = ? AND ProfessionalId = ? AND Status = 'confirmed'
         AND StartAt < ? AND EndAt > ?
       LIMIT 1`
    )
    .bind(tenantId, professionalId, matchedSlot.endAt, matchedSlot.startAt)
    .first<{ Id: string }>();

  if (conflict) {
    return { ok: false, status: 409, error: 'Este horário acabou de ser reservado' };
  }

  const normalizedPhone = params.customerPhone.replace(/\D/g, '') || params.customerPhone.trim();
  let customer = await db
    .prepare(`SELECT Id, Name FROM Customers WHERE TenantId = ? AND Phone = ?`)
    .bind(tenantId, normalizedPhone)
    .first<{ Id: string; Name: string }>();

  const appointmentId = generateId();
  const confirmationCode = generateConfirmationCode();
  const batch: D1PreparedStatement[] = [];

  if (!customer) {
    const customerId = generateId();
    customer = { Id: customerId, Name: params.customerName };
    batch.push(
      db
        .prepare(
          `INSERT INTO Customers (Id, TenantId, Name, Phone, Email)
           VALUES (?, ?, ?, ?, ?)`
        )
        .bind(customerId, tenantId, params.customerName, normalizedPhone, params.customerEmail ?? '')
    );
  } else {
    batch.push(
      db
        .prepare(
          `UPDATE Customers SET Name = ?, Email = CASE WHEN ? != '' THEN ? ELSE Email END,
             UpdatedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE TenantId = ? AND Id = ?`
        )
        .bind(
          params.customerName,
          params.customerEmail ?? '',
          params.customerEmail ?? '',
          tenantId,
          customer.Id
        )
    );
  }

  batch.push(
    db
      .prepare(
        `INSERT INTO Appointments (
          Id, TenantId, CustomerId, ServiceId, ProfessionalId,
          StartAt, EndAt, Status, PriceInCents, ConfirmationCode, Notes, Source
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, ?, ?)`
      )
      .bind(
        appointmentId,
        tenantId,
        customer.Id,
        serviceId,
        professionalId,
        matchedSlot.startAt,
        matchedSlot.endAt,
        service.PriceInCents,
        confirmationCode,
        params.notes ?? '',
        source
      ),
    db
      .prepare(
        `INSERT INTO NotificationLogs (Id, TenantId, AppointmentId, Channel, NotificationType, Status)
         VALUES (?, ?, ?, ?, 'booking_confirmed', 'recorded')`
      )
      .bind(generateId(), tenantId, appointmentId, source)
  );

  await db.batch(batch);

  return {
    ok: true,
    appointment: {
      id: appointmentId,
      confirmationCode,
      startAt: matchedSlot.startAt,
      endAt: matchedSlot.endAt,
      priceInCents: service.PriceInCents,
      serviceName: service.Name,
      professionalName: prof.Name,
      customerName: params.customerName
    }
  };
}

export async function rescheduleValidatedAppointment(params: {
  db: D1Database;
  tenantId: string;
  appointmentId: string;
  newStartAt: string;
  newProfessionalId?: string;
  bypassAdvanceCheck?: boolean;
  nowMs?: number;
}): Promise<{ ok: true; startAt: string; endAt: string } | { ok: false; status: 400 | 404 | 409; error: string }> {
  const { db, tenantId, appointmentId, newStartAt, newProfessionalId, bypassAdvanceCheck } = params;

  const existing = await db
    .prepare(
      `SELECT Id, ServiceId, ProfessionalId, Status
       FROM Appointments WHERE TenantId = ? AND Id = ?`
    )
    .bind(tenantId, appointmentId)
    .first<{ Id: string; ServiceId: string; ProfessionalId: string; Status: string }>();

  if (!existing) {
    return { ok: false, status: 404, error: 'Agendamento não encontrado' };
  }
  if (existing.Status === 'cancelled') {
    return { ok: false, status: 400, error: 'Não é possível reagendar um horário cancelado' };
  }

  const profId = newProfessionalId || existing.ProfessionalId;
  const parsedStartMs = Date.parse(newStartAt);
  if (Number.isNaN(parsedStartMs)) {
    return { ok: false, status: 400, error: 'Novo horário inválido' };
  }

  const service = await db
    .prepare(`SELECT DurationMinutes FROM Services WHERE TenantId = ? AND Id = ?`)
    .bind(tenantId, existing.ServiceId)
    .first<{ DurationMinutes: number }>();
  if (!service) {
    return { ok: false, status: 404, error: 'Serviço não encontrado' };
  }

  const offers = await checkProfessionalOffersService(db, tenantId, profId, existing.ServiceId);
  if (!offers) {
    return { ok: false, status: 400, error: 'Este profissional não atende o serviço deste agendamento' };
  }

  const settings = await getTenantBookingSettings(db, tenantId);
  const startIso = new Date(parsedStartMs).toISOString();
  const endIso = new Date(parsedStartMs + service.DurationMinutes * 60_000).toISOString();
  const local = utcIsoToLocalDateAndTime(startIso, settings.timezoneOffsetMinutes);

  // Temporarily ignore current appointment by checking availability if slot matches OR conflict excluding self
  const availability = await getAvailableSlots({
    db,
    tenantId,
    date: local.date,
    serviceId: existing.ServiceId,
    professionalId: profId,
    nowMs: params.nowMs,
    bypassAdvanceCheck
  });

  const matched = availability.slots.find((s) => Date.parse(s.startAt) === parsedStartMs);
  if (!matched) {
    // Check if the only blocker was the appointment itself (same professional overlapping self)
    const otherConflict = await db
      .prepare(
        `SELECT Id FROM Appointments
         WHERE TenantId = ? AND ProfessionalId = ? AND Status = 'confirmed' AND Id != ?
           AND StartAt < ? AND EndAt > ?`
      )
      .bind(tenantId, profId, appointmentId, endIso, startIso)
      .first<{ Id: string }>();
    const blockConflict = await db
      .prepare(
        `SELECT Id FROM BlockedSlots
         WHERE TenantId = ? AND (ProfessionalId IS NULL OR ProfessionalId = ?)
           AND StartAt < ? AND EndAt > ?`
      )
      .bind(tenantId, profId, endIso, startIso)
      .first<{ Id: string }>();

    if (otherConflict || blockConflict || availability.error) {
      return {
        ok: false,
        status: 409,
        error: availability.error || 'Novo horário indisponível'
      };
    }

    // Verify it is within working hours & not in break
    const dayOfWeek = getLocalDayOfWeek(local.date);
    let wh = await db
      .prepare(
        `SELECT StartTime, EndTime, BreakStart, BreakEnd, IsAvailable
         FROM WorkingHours WHERE TenantId = ? AND ProfessionalId = ? AND DayOfWeek = ?`
      )
      .bind(tenantId, profId, dayOfWeek)
      .first<{ StartTime: string; EndTime: string; BreakStart: string | null; BreakEnd: string | null; IsAvailable: number }>();
    if (!wh) {
      wh = await db
        .prepare(
          `SELECT StartTime, EndTime, BreakStart, BreakEnd, IsAvailable
           FROM WorkingHours WHERE TenantId = ? AND ProfessionalId IS NULL AND DayOfWeek = ?`
        )
        .bind(tenantId, dayOfWeek)
        .first();
    }
    if (!wh || wh.IsAvailable !== 1) {
      return { ok: false, status: 409, error: 'Estabelecimento fechado neste dia' };
    }
    const startMin = local.minutes;
    const endMin = startMin + service.DurationMinutes;
    if (startMin < parseTimeToMinutes(wh.StartTime) || endMin > parseTimeToMinutes(wh.EndTime)) {
      return { ok: false, status: 409, error: 'Horário fora do expediente' };
    }
    if (
      wh.BreakStart &&
      wh.BreakEnd &&
      startMin < parseTimeToMinutes(wh.BreakEnd) &&
      endMin > parseTimeToMinutes(wh.BreakStart)
    ) {
      return { ok: false, status: 409, error: 'Horário em intervalo de descanso' };
    }
  }

  await db
    .prepare(
      `UPDATE Appointments
       SET ProfessionalId = ?, StartAt = ?, EndAt = ?, UpdatedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE TenantId = ? AND Id = ?`
    )
    .bind(profId, startIso, endIso, tenantId, appointmentId)
    .run();

  return { ok: true, startAt: startIso, endAt: endIso };
}
