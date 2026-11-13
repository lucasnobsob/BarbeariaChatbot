import {
  createValidatedAppointment,
  getAvailableSlots,
  getTenantBookingSettings,
  rescheduleValidatedAppointment,
  utcIsoToLocalDateAndTime
} from '@worker/domains/scheduling/engine';

export class AppointmentHandler {
  static async listServices(db: D1Database, tenantId: string) {
    const { results } = await db
      .prepare(
        `SELECT Id, Name, Description, PriceInCents, DurationMinutes
         FROM Services WHERE TenantId = ? AND IsActive = 1 ORDER BY Name ASC`
      )
      .bind(tenantId)
      .all<{
        Id: string;
        Name: string;
        Description: string;
        PriceInCents: number;
        DurationMinutes: number;
      }>();
    return results;
  }

  static async listProfessionals(
    db: D1Database,
    tenantId: string,
    serviceId?: string
  ) {
    if (serviceId) {
      const { results } = await db
        .prepare(
          `SELECT p.Id, p.Name, p.Specialties
           FROM Professionals p
           INNER JOIN ProfessionalServices ps ON ps.TenantId = p.TenantId AND ps.ProfessionalId = p.Id
           WHERE p.TenantId = ? AND p.IsActive = 1 AND ps.ServiceId = ?
           ORDER BY p.Name ASC`
        )
        .bind(tenantId, serviceId)
        .all<{ Id: string; Name: string; Specialties: string }>();
      return results;
    }

    const { results } = await db
      .prepare(
        `SELECT Id, Name, Specialties FROM Professionals WHERE TenantId = ? AND IsActive = 1 ORDER BY Name ASC`
      )
      .bind(tenantId)
      .all<{ Id: string; Name: string; Specialties: string }>();
    return results;
  }

  static async getAvailableDatesAndSlots(params: {
    db: D1Database;
    tenantId: string;
    date: string;
    serviceId: string;
    professionalId: string;
    nowMs?: number;
  }) {
    return getAvailableSlots({
      db: params.db,
      tenantId: params.tenantId,
      date: params.date,
      serviceId: params.serviceId,
      professionalId: params.professionalId,
      nowMs: params.nowMs
    });
  }

  static async bookAppointment(params: {
    db: D1Database;
    tenantId: string;
    serviceId: string;
    professionalId: string;
    startAt: string;
    customerName: string;
    customerPhone: string;
    source: 'telegram' | 'whatsapp';
    nowMs?: number;
  }) {
    return createValidatedAppointment({
      db: params.db,
      tenantId: params.tenantId,
      serviceId: params.serviceId,
      professionalId: params.professionalId,
      startAt: params.startAt,
      customerName: params.customerName,
      customerPhone: params.customerPhone,
      source: params.source,
      nowMs: params.nowMs
    });
  }

  static async findAppointmentByCode(
    db: D1Database,
    tenantId: string,
    confirmationCode: string
  ) {
    const clean = confirmationCode.trim().toUpperCase();
    return db
      .prepare(
        `SELECT a.Id, a.ServiceId, a.ProfessionalId, a.StartAt, a.Status, a.ConfirmationCode,
                s.Name AS ServiceName, p.Name AS ProfessionalName, c.Name AS CustomerName
         FROM Appointments a
         INNER JOIN Services s ON s.TenantId = a.TenantId AND s.Id = a.ServiceId
         INNER JOIN Professionals p ON p.TenantId = a.TenantId AND p.Id = a.ProfessionalId
         INNER JOIN Customers c ON c.TenantId = a.TenantId AND c.Id = a.CustomerId
         WHERE a.TenantId = ? AND a.ConfirmationCode = ?`
      )
      .bind(tenantId, clean)
      .first<{
        Id: string;
        ServiceId: string;
        ProfessionalId: string;
        StartAt: string;
        Status: string;
        ConfirmationCode: string;
        ServiceName: string;
        ProfessionalName: string;
        CustomerName: string;
      }>();
  }

  static async cancelByCode(
    db: D1Database,
    tenantId: string,
    confirmationCode: string
  ): Promise<{ ok: boolean; message: string }> {
    const appt = await this.findAppointmentByCode(db, tenantId, confirmationCode);
    if (!appt) {
      return {
        ok: false,
        message: 'Não encontrei nenhum agendamento com este código neste estabelecimento.'
      };
    }
    if (appt.Status === 'cancelled') {
      return { ok: true, message: `O agendamento ${appt.ConfirmationCode} já estava cancelado.` };
    }

    await db
      .prepare(
        `UPDATE Appointments SET Status = 'cancelled', UpdatedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE TenantId = ? AND Id = ?`
      )
      .bind(tenantId, appt.Id)
      .run();

    return {
      ok: true,
      message: `Agendamento ${appt.ConfirmationCode} (${appt.ServiceName} com ${appt.ProfessionalName}) cancelado com sucesso.`
    };
  }

  static async rescheduleById(params: {
    db: D1Database;
    tenantId: string;
    appointmentId: string;
    newStartAt: string;
    nowMs?: number;
  }) {
    return rescheduleValidatedAppointment({
      db: params.db,
      tenantId: params.tenantId,
      appointmentId: params.appointmentId,
      newStartAt: params.newStartAt,
      nowMs: params.nowMs
    });
  }

  static async formatLocalDateTime(db: D1Database, tenantId: string, iso: string) {
    const settings = await getTenantBookingSettings(db, tenantId);
    const local = utcIsoToLocalDateAndTime(iso, settings.timezoneOffsetMinutes);
    const [y, m, d] = local.date.split('-');
    return `${d}/${m}/${y} às ${local.time}`;
  }
}
