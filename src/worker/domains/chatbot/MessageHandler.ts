import { AppointmentHandler } from './AppointmentHandler';
import { getTenantBookingSettings, utcIsoToLocalDateAndTime } from '@worker/domains/scheduling/engine';

export interface ChatSessionContext {
  serviceId?: string;
  serviceName?: string;
  professionalId?: string;
  professionalName?: string;
  date?: string;
  slots?: Array<{ time: string; startAt: string }>;
  selectedStartAt?: string;
  selectedTime?: string;
  customerName?: string;
  rescheduleAppointmentId?: string;
  rescheduleServiceId?: string;
  rescheduleProfessionalId?: string;
}

export interface HandleMessageInput {
  db: D1Database;
  tenantId: string;
  tenantName: string;
  welcomeMessage: string;
  awayMessage: string;
  source: 'telegram' | 'whatsapp';
  currentState: string;
  context: ChatSessionContext;
  text: string;
  nowMs?: number;
}

export interface HandleMessageResult {
  reply: string;
  nextState: string;
  nextContext: ChatSessionContext;
}

const DAY_NAMES = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

function formatPrice(cents: number): string {
  return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
}

function normalizeDateInput(raw: string, timezoneOffsetMinutes: number, nowMs: number): string | null {
  const clean = raw.trim().toLowerCase();
  if (clean === 'hoje') {
    return utcIsoToLocalDateAndTime(new Date(nowMs).toISOString(), timezoneOffsetMinutes).date;
  }
  if (clean === 'amanha' || clean === 'amanhã') {
    return utcIsoToLocalDateAndTime(
      new Date(nowMs + 86_400_000).toISOString(),
      timezoneOffsetMinutes
    ).date;
  }
  const brMatch = clean.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) {
    return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;
  }
  const isoMatch = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return clean;
  }
  return null;
}

function buildMainMenu(tenantName: string, welcomeMessage: string): string {
  const intro = welcomeMessage.trim()
    ? welcomeMessage.trim()
    : `Olá! Bem-vindo(a) à *${tenantName}*.`;
  return [
    intro,
    '',
    'Como posso ajudar hoje? Responda com o número da opção:',
    '1 - Ver serviços e preços',
    '2 - Ver profissionais',
    '3 - Agendar horário',
    '4 - Cancelar agendamento',
    '5 - Reagendar horário',
    '6 - Horários e localização',
    '7 - Falar com um atendente'
  ].join('\n');
}

export class MessageHandler {
  static async process(input: HandleMessageInput): Promise<HandleMessageResult> {
    const { db, tenantId, tenantName, welcomeMessage, awayMessage, source } = input;
    const text = input.text.trim();
    const lower = text.toLowerCase();
    const nowMs = input.nowMs ?? Date.now();
    const ctx: ChatSessionContext = { ...input.context };

    // Global commands always return to main menu
    if (
      lower === '/start' ||
      lower === 'menu' ||
      lower === 'oi' ||
      lower === 'olá' ||
      lower === 'ola' ||
      lower === 'voltar' ||
      lower === 'inicio' ||
      lower === 'início'
    ) {
      return {
        reply: buildMainMenu(tenantName, welcomeMessage),
        nextState: 'menu',
        nextContext: {}
      };
    }

    // State machine steps
    if (input.currentState === 'booking_service') {
      const services = await AppointmentHandler.listServices(db, tenantId);
      const idx = Number(text) - 1;
      const chosen = Number.isInteger(idx) ? services[idx] : services.find((s) => s.Name.toLowerCase() === lower);
      if (!chosen) {
        return {
          reply: 'Opção inválida. Digite o número do serviço desejado (ou "menu" para voltar):',
          nextState: 'booking_service',
          nextContext: ctx
        };
      }
      ctx.serviceId = chosen.Id;
      ctx.serviceName = chosen.Name;

      const profs = await AppointmentHandler.listProfessionals(db, tenantId, chosen.Id);
      if (profs.length === 0) {
        return {
          reply: `No momento não há profissionais vinculados ao serviço *${chosen.Name}*. Digite "menu" para voltar.`,
          nextState: 'menu',
          nextContext: {}
        };
      }

      const lines = profs.map((p, i) => `${i + 1} - ${p.Name}${p.Specialties ? ` (${p.Specialties})` : ''}`);
      return {
        reply: `Serviço: *${chosen.Name}* (${formatPrice(chosen.PriceInCents)}).\nEscolha o profissional:\n${lines.join('\n')}`,
        nextState: 'booking_professional',
        nextContext: ctx
      };
    }

    if (input.currentState === 'booking_professional' && ctx.serviceId) {
      const profs = await AppointmentHandler.listProfessionals(db, tenantId, ctx.serviceId);
      const idx = Number(text) - 1;
      const chosen = Number.isInteger(idx) ? profs[idx] : profs.find((p) => p.Name.toLowerCase() === lower);
      if (!chosen) {
        return {
          reply: 'Profissional inválido. Digite o número do profissional desejado (ou "menu" para voltar):',
          nextState: 'booking_professional',
          nextContext: ctx
        };
      }
      ctx.professionalId = chosen.Id;
      ctx.professionalName = chosen.Name;

      return {
        reply: `Profissional: *${chosen.Name}*.\nInforme a data desejada (ex: "hoje", "amanhã", DD/MM/AAAA ou AAAA-MM-DD):`,
        nextState: 'booking_date',
        nextContext: ctx
      };
    }

    if (input.currentState === 'booking_date' && ctx.serviceId && ctx.professionalId) {
      const settings = await getTenantBookingSettings(db, tenantId);
      const dateStr = normalizeDateInput(text, settings.timezoneOffsetMinutes, nowMs);
      if (!dateStr) {
        return {
          reply: 'Data inválida. Envie no formato DD/MM/AAAA (ex: 20/11/2026) ou "hoje" / "amanhã":',
          nextState: 'booking_date',
          nextContext: ctx
        };
      }

      const avail = await AppointmentHandler.getAvailableDatesAndSlots({
        db,
        tenantId,
        date: dateStr,
        serviceId: ctx.serviceId,
        professionalId: ctx.professionalId,
        nowMs
      });

      if (avail.error) {
        return {
          reply: `${avail.error}. Informe outra data:`,
          nextState: 'booking_date',
          nextContext: ctx
        };
      }
      if (avail.slots.length === 0) {
        return {
          reply: `Não há horários disponíveis em ${dateStr}. Informe outra data (DD/MM/AAAA):`,
          nextState: 'booking_date',
          nextContext: ctx
        };
      }

      const limited = avail.slots.slice(0, 12);
      ctx.date = dateStr;
      ctx.slots = limited.map((s) => ({ time: s.time, startAt: s.startAt }));

      const slotLines = limited.map((s, i) => `${i + 1} - ${s.time}`);
      return {
        reply: `Horários disponíveis para ${dateStr}:\n${slotLines.join('\n')}\nResponda com o número do horário:`,
        nextState: 'booking_slot',
        nextContext: ctx
      };
    }

    if (input.currentState === 'booking_slot' && ctx.slots) {
      const idx = Number(text) - 1;
      const chosen = Number.isInteger(idx)
        ? ctx.slots[idx]
        : ctx.slots.find((s) => s.time === text);

      if (!chosen) {
        return {
          reply: 'Horário inválido. Digite o número correspondente ao horário desejado:',
          nextState: 'booking_slot',
          nextContext: ctx
        };
      }

      ctx.selectedStartAt = chosen.startAt;
      ctx.selectedTime = chosen.time;

      return {
        reply: `Horário escolhido: *${chosen.time}*.\nPor favor, informe seu *nome completo*:`,
        nextState: 'booking_name',
        nextContext: ctx
      };
    }

    if (input.currentState === 'booking_name') {
      if (text.length < 2) {
        return {
          reply: 'Informe um nome válido (pelo menos 2 caracteres):',
          nextState: 'booking_name',
          nextContext: ctx
        };
      }
      ctx.customerName = text;
      return {
        reply: 'Agora informe seu *telefone com DDD* (somente números, ex: 11999998888):',
        nextState: 'booking_phone',
        nextContext: ctx
      };
    }

    if (
      input.currentState === 'booking_phone' &&
      ctx.serviceId &&
      ctx.professionalId &&
      ctx.selectedStartAt &&
      ctx.customerName
    ) {
      const digits = text.replace(/\D/g, '');
      if (digits.length < 8) {
        return {
          reply: 'Telefone inválido. Informe com DDD (pelo menos 8 dígitos):',
          nextState: 'booking_phone',
          nextContext: ctx
        };
      }

      const booked = await AppointmentHandler.bookAppointment({
        db,
        tenantId,
        serviceId: ctx.serviceId,
        professionalId: ctx.professionalId,
        startAt: ctx.selectedStartAt,
        customerName: ctx.customerName,
        customerPhone: digits,
        source,
        nowMs
      });

      if (!booked.ok) {
        return {
          reply: `Não foi possível concluir o agendamento: ${booked.error}\nDigite "menu" para recomeçar.`,
          nextState: 'menu',
          nextContext: {}
        };
      }

      const when = await AppointmentHandler.formatLocalDateTime(
        db,
        tenantId,
        booked.appointment.startAt
      );
      return {
        reply: [
          `Agendamento confirmado na *${tenantName}*!`,
          `Código: *${booked.appointment.confirmationCode}*`,
          `Serviço: ${booked.appointment.serviceName} (${formatPrice(booked.appointment.priceInCents)})`,
          `Profissional: ${booked.appointment.professionalName}`,
          `Data/Hora: ${when}`,
          '',
          'Guarde seu código caso precise cancelar ou reagendar. Digite "menu" para outras opções.'
        ].join('\n'),
        nextState: 'menu',
        nextContext: {}
      };
    }

    if (input.currentState === 'cancel_code') {
      const res = await AppointmentHandler.cancelByCode(db, tenantId, text);
      return {
        reply: `${res.message}\n\nDigite "menu" para voltar ao início.`,
        nextState: 'menu',
        nextContext: {}
      };
    }

    if (input.currentState === 'reschedule_code') {
      const appt = await AppointmentHandler.findAppointmentByCode(db, tenantId, text);
      if (!appt || appt.Status === 'cancelled') {
        return {
          reply: 'Agendamento não encontrado ou já cancelado. Verifique o código ou digite "menu":',
          nextState: 'reschedule_code',
          nextContext: {}
        };
      }
      ctx.rescheduleAppointmentId = appt.Id;
      ctx.rescheduleServiceId = appt.ServiceId;
      ctx.rescheduleProfessionalId = appt.ProfessionalId;
      return {
        reply: `Encontrei seu agendamento de *${appt.ServiceName}* com *${appt.ProfessionalName}*.\nInforme a nova data (DD/MM/AAAA, "hoje" ou "amanhã"):`,
        nextState: 'reschedule_date',
        nextContext: ctx
      };
    }

    if (
      input.currentState === 'reschedule_date' &&
      ctx.rescheduleAppointmentId &&
      ctx.rescheduleServiceId &&
      ctx.rescheduleProfessionalId
    ) {
      const settings = await getTenantBookingSettings(db, tenantId);
      const dateStr = normalizeDateInput(text, settings.timezoneOffsetMinutes, nowMs);
      if (!dateStr) {
        return {
          reply: 'Data inválida. Use DD/MM/AAAA:',
          nextState: 'reschedule_date',
          nextContext: ctx
        };
      }
      const avail = await AppointmentHandler.getAvailableDatesAndSlots({
        db,
        tenantId,
        date: dateStr,
        serviceId: ctx.rescheduleServiceId,
        professionalId: ctx.rescheduleProfessionalId,
        nowMs
      });
      if (avail.slots.length === 0) {
        return {
          reply: `Sem horários livres em ${dateStr}. Informe outra data:`,
          nextState: 'reschedule_date',
          nextContext: ctx
        };
      }
      const limited = avail.slots.slice(0, 12);
      ctx.slots = limited.map((s) => ({ time: s.time, startAt: s.startAt }));
      const lines = limited.map((s, i) => `${i + 1} - ${s.time}`);
      return {
        reply: `Novos horários em ${dateStr}:\n${lines.join('\n')}\nDigite o número do horário:`,
        nextState: 'reschedule_slot',
        nextContext: ctx
      };
    }

    if (input.currentState === 'reschedule_slot' && ctx.rescheduleAppointmentId && ctx.slots) {
      const idx = Number(text) - 1;
      const chosen = Number.isInteger(idx)
        ? ctx.slots[idx]
        : ctx.slots.find((s) => s.time === text);
      if (!chosen) {
        return {
          reply: 'Opção inválida. Digite o número do horário:',
          nextState: 'reschedule_slot',
          nextContext: ctx
        };
      }
      const res = await AppointmentHandler.rescheduleById({
        db,
        tenantId,
        appointmentId: ctx.rescheduleAppointmentId,
        newStartAt: chosen.startAt,
        nowMs
      });
      if (!res.ok) {
        return {
          reply: `Não foi possível reagendar: ${res.error}\nDigite "menu" para voltar.`,
          nextState: 'menu',
          nextContext: {}
        };
      }
      const when = await AppointmentHandler.formatLocalDateTime(db, tenantId, res.startAt);
      return {
        reply: `Reagendamento confirmado para *${when}*! Digite "menu" para voltar.`,
        nextState: 'menu',
        nextContext: {}
      };
    }

    // Menu option dispatch (numeric or keyword)
    if (lower === '1' || lower.includes('servi') || lower.includes('preço') || lower.includes('preco')) {
      const services = await AppointmentHandler.listServices(db, tenantId);
      if (services.length === 0) {
        return {
          reply: 'Ainda não há serviços cadastrados neste estabelecimento.',
          nextState: 'menu',
          nextContext: {}
        };
      }
      const list = services
        .map((s) => `• *${s.Name}* — ${formatPrice(s.PriceInCents)} (${s.DurationMinutes} min)`)
        .join('\n');
      return {
        reply: `Nossos serviços na *${tenantName}*:\n\n${list}\n\nDigite "3" para agendar ou "menu" para voltar.`,
        nextState: 'menu',
        nextContext: {}
      };
    }

    if (lower === '2' || lower.includes('profiss') || lower.includes('barbeiro') || lower.includes('equipe')) {
      const profs = await AppointmentHandler.listProfessionals(db, tenantId);
      if (profs.length === 0) {
        return {
          reply: 'Ainda não há profissionais cadastrados.',
          nextState: 'menu',
          nextContext: {}
        };
      }
      const list = profs
        .map((p) => `• *${p.Name}*${p.Specialties ? ` — ${p.Specialties}` : ''}`)
        .join('\n');
      return {
        reply: `Nossa equipe:\n\n${list}\n\nDigite "3" para agendar ou "menu" para voltar.`,
        nextState: 'menu',
        nextContext: {}
      };
    }

    if (lower === '3' || lower.includes('agend') || lower.includes('horário') || lower.includes('horario') || lower.includes('marc')) {
      const services = await AppointmentHandler.listServices(db, tenantId);
      if (services.length === 0) {
        return {
          reply: 'Nenhum serviço ativo disponível para agendamento no momento.',
          nextState: 'menu',
          nextContext: {}
        };
      }
      const list = services
        .map((s, i) => `${i + 1} - ${s.Name} (${formatPrice(s.PriceInCents)}, ${s.DurationMinutes}min)`)
        .join('\n');
      return {
        reply: `Vamos agendar! Escolha o número do serviço:\n${list}`,
        nextState: 'booking_service',
        nextContext: {}
      };
    }

    if (lower === '4' || lower.includes('cancel')) {
      return {
        reply: 'Informe o código de confirmação do seu agendamento (ex: BRB-XXXXXX):',
        nextState: 'cancel_code',
        nextContext: {}
      };
    }

    if (lower === '5' || lower.includes('reagend')) {
      return {
        reply: 'Informe o código de confirmação do agendamento que deseja reagendar (ex: BRB-XXXXXX):',
        nextState: 'reschedule_code',
        nextContext: {}
      };
    }

    if (lower === '6' || lower.includes('local') || lower.includes('endere') || lower.includes('funciona')) {
      const [profile, hoursRes] = await Promise.all([
        db
          .prepare(
            `SELECT Street, Number, Neighborhood, City, State, Complement, Phone
             FROM BusinessProfiles WHERE TenantId = ?`
          )
          .bind(tenantId)
          .first<{
            Street: string;
            Number: string;
            Neighborhood: string;
            City: string;
            State: string;
            Complement: string;
            Phone: string;
          }>(),
        db
          .prepare(
            `SELECT DayOfWeek, StartTime, EndTime, BreakStart, BreakEnd, IsAvailable
             FROM WorkingHours WHERE TenantId = ? AND ProfessionalId IS NULL ORDER BY DayOfWeek ASC`
          )
          .bind(tenantId)
          .all<{
            DayOfWeek: number;
            StartTime: string;
            EndTime: string;
            BreakStart: string | null;
            BreakEnd: string | null;
            IsAvailable: number;
          }>()
      ]);

      const addressParts = [
        profile?.Street && `${profile.Street}, ${profile.Number || 's/n'}`,
        profile?.Neighborhood,
        profile?.City && profile?.State ? `${profile.City}/${profile.State}` : profile?.City
      ].filter(Boolean);

      const hoursText = hoursRes.results
        .map((h) =>
          h.IsAvailable === 1
            ? `${DAY_NAMES[h.DayOfWeek]}: ${h.StartTime} às ${h.EndTime}${h.BreakStart ? ` (pausa ${h.BreakStart}-${h.BreakEnd})` : ''}`
            : `${DAY_NAMES[h.DayOfWeek]}: Fechado`
        )
        .join('\n');

      return {
        reply: [
          `*${tenantName}*`,
          addressParts.length ? `Endereço: ${addressParts.join(' - ')}` : 'Endereço não informado.',
          profile?.Phone ? `Telefone: ${profile.Phone}` : '',
          '',
          'Horários de funcionamento:',
          hoursText || 'Não configurado.'
        ]
          .filter(Boolean)
          .join('\n'),
        nextState: 'menu',
        nextContext: {}
      };
    }

    if (lower === '7' || lower.includes('human') || lower.includes('atendente')) {
      const profile = await db
        .prepare(`SELECT Phone, WhatsAppNumber FROM BusinessProfiles WHERE TenantId = ?`)
        .bind(tenantId)
        .first<{ Phone: string; WhatsAppNumber: string }>();

      const contact = profile?.WhatsAppNumber || profile?.Phone || '';
      const handoff =
        awayMessage.trim() ||
        `Encaminhei sua solicitação para a equipe da *${tenantName}*.${contact ? ` Você também pode ligar/chamar em: ${contact}` : ''}`;

      return {
        reply: `${handoff}\n\nDigite "menu" quando quiser usar o autoatendimento novamente.`,
        nextState: 'human_handoff',
        nextContext: {}
      };
    }

    return {
      reply: buildMainMenu(tenantName, welcomeMessage),
      nextState: 'menu',
      nextContext: {}
    };
  }
}
