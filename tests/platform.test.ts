import { env, SELF } from 'cloudflare:test';
import { describe, expect, it, vi } from 'vitest';
import { hashPassword, sha256Hex } from '@worker/lib/crypto';
import { ChatbotService } from '@worker/domains/chatbot/ChatbotService';
import { TenantResolver } from '@worker/domains/chatbot/TenantResolver';
import { TelegramProvider } from '@worker/domains/chatbot/TelegramProvider';

function extractCookie(res: Response): string {
  const raw = res.headers.get('set-cookie') || '';
  const match = raw.match(/barbersaas_session=[^;]+/);
  return match ? match[0] : '';
}

function getNextWeekdayDate(targetDayOfWeek: number, daysAheadMin = 3): string {
  const now = new Date();
  for (let i = daysAheadMin; i < 20; i++) {
    const d = new Date(now.getTime() + i * 86_400_000);
    if (d.getUTCDay() === targetDayOfWeek) {
      return d.toISOString().slice(0, 10);
    }
  }
  throw new Error('Could not find target weekday');
}

async function registerAndOnboardShop(params: {
  name: string;
  email: string;
  businessName: string;
  slug: string;
  serviceName: string;
  servicePriceCents: number;
  profName: string;
}) {
  const regRes = await SELF.fetch('http://example.com/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: params.name,
      email: params.email,
      password: 'Password@123'
    })
  });
  expect(regRes.status).toBe(201);
  const cookie = extractCookie(regRes);
  expect(cookie).toContain('barbersaas_session=');

  const onboardRes = await SELF.fetch('http://example.com/api/onboarding/complete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie
    },
    body: JSON.stringify({
      profile: {
        businessName: params.businessName,
        slug: params.slug,
        tagline: `Tagline ${params.businessName}`,
        description: `Descrição ${params.businessName}`,
        phone: '(11) 98888-7777',
        primaryColor: '#d97706',
        secondaryColor: '#0f172a',
        accentColor: '#f59e0b'
      },
      workingHours: [
        { dayOfWeek: 0, startTime: '09:00', endTime: '17:00', isAvailable: false },
        { dayOfWeek: 1, startTime: '09:00', endTime: '19:00', isAvailable: false },
        { dayOfWeek: 2, startTime: '09:00', endTime: '18:00', breakStart: '12:00', breakEnd: '13:00', isAvailable: true },
        { dayOfWeek: 3, startTime: '09:00', endTime: '18:00', breakStart: '12:00', breakEnd: '13:00', isAvailable: true },
        { dayOfWeek: 4, startTime: '09:00', endTime: '18:00', breakStart: '12:00', breakEnd: '13:00', isAvailable: true },
        { dayOfWeek: 5, startTime: '09:00', endTime: '18:00', breakStart: '12:00', breakEnd: '13:00', isAvailable: true },
        { dayOfWeek: 6, startTime: '09:00', endTime: '16:00', isAvailable: true }
      ],
      services: [
        {
          name: params.serviceName,
          description: 'Serviço completo',
          priceInCents: params.servicePriceCents,
          durationMinutes: 30,
          isActive: true
        }
      ],
      professionals: [
        {
          name: params.profName,
          specialties: 'Corte e Barba',
          description: 'Barbeiro sênior',
          isActive: true,
          serviceIds: []
        }
      ],
      publish: true
    })
  });
  expect(onboardRes.status).toBe(200);
  const onboardJson = (await onboardRes.json()) as {
    tenant: { id: string; slug: string };
  };

  const pubRes = await SELF.fetch(`http://example.com/api/public/${onboardJson.tenant.slug}`);
  expect(pubRes.status).toBe(200);
  const pubJson = (await pubRes.json()) as {
    services: Array<{ id: string; name: string }>;
    professionals: Array<{ id: string; name: string }>;
  };

  return {
    cookie,
    tenantId: onboardJson.tenant.id,
    slug: onboardJson.tenant.slug,
    serviceId: pubJson.services[0].id,
    professionalId: pubJson.professionals[0].id
  };
}

describe('Plataforma SaaS Multi-Tenant — Testes Automatizados', () => {
  it('Multi-tenancy, Agendamento, Personalização, Chatbot e Superadmin', async () => {
    // ── 1. Criar duas barbearias independentes (Alpha e Beta) ─────────────
    const alpha = await registerAndOnboardShop({
      name: 'Dono Alpha',
      email: 'alpha@barber.test',
      businessName: 'Barbearia Alpha',
      slug: 'barbearia-alpha',
      serviceName: 'Corte Alpha',
      servicePriceCents: 5000,
      profName: 'Barbeiro Alpha'
    });

    const beta = await registerAndOnboardShop({
      name: 'Dono Beta',
      email: 'beta@barber.test',
      businessName: 'Barbearia Beta',
      slug: 'barbearia-beta',
      serviceName: 'Corte Beta',
      servicePriceCents: 7500,
      profName: 'Barbeiro Beta'
    });

    expect(alpha.tenantId).not.toBe(beta.tenantId);

    // ── 2. Isolamento de Serviços, Profissionais, Agenda e Clientes ───────
    const alphaServicesRes = await SELF.fetch('http://example.com/api/admin/services', {
      headers: { Cookie: alpha.cookie }
    });
    const alphaServices = (await alphaServicesRes.json()) as { services: Array<{ id: string; name: string }> };
    expect(alphaServices.services.some((s) => s.id === alpha.serviceId)).toBe(true);
    expect(alphaServices.services.some((s) => s.id === beta.serviceId)).toBe(false);

    // Tentativa de Alpha alterar/excluir serviço de Beta deve falhar (404/403)
    const crossEditService = await SELF.fetch(`http://example.com/api/admin/services/${beta.serviceId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: alpha.cookie },
      body: JSON.stringify({
        name: 'Hackeado',
        priceInCents: 100,
        durationMinutes: 30,
        isActive: true
      })
    });
    expect(crossEditService.status).toBe(404);

    const crossDeleteService = await SELF.fetch(`http://example.com/api/admin/services/${beta.serviceId}`, {
      method: 'DELETE',
      headers: { Cookie: alpha.cookie }
    });
    expect(crossDeleteService.status).toBe(404);

    // Tentativa de Alpha criar profissional vinculado a serviço de Beta deve falhar (400)
    const crossLinkProf = await SELF.fetch('http://example.com/api/admin/professionals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: alpha.cookie },
      body: JSON.stringify({
        name: 'Invasor',
        isActive: true,
        serviceIds: [beta.serviceId]
      })
    });
    expect(crossLinkProf.status).toBe(400);

    // Tentativa de trocar para tenant de Beta sem vínculo deve falhar (403)
    const crossSwitch = await SELF.fetch('http://example.com/api/auth/switch-tenant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: alpha.cookie },
      body: JSON.stringify({ tenantId: beta.tenantId })
    });
    expect(crossSwitch.status).toBe(403);

    // ── 3. Agendamento: válido, indisponível, duplicado, incompatível, cancelamento, reagendamento ─
    const wednesday = getNextWeekdayDate(3, 3); // Quarta-feira aberta
    const monday = getNextWeekdayDate(1, 3); // Segunda-feira fechada

    // Dia fechado deve retornar 0 horários
    const closedSlotsRes = await SELF.fetch(
      `http://example.com/api/public/${alpha.slug}/slots?date=${monday}&serviceId=${alpha.serviceId}&professionalId=${alpha.professionalId}`
    );
    const closedSlots = (await closedSlotsRes.json()) as { slots: unknown[] };
    expect(closedSlots.slots.length).toBe(0);

    // Dia aberto deve retornar horários (respeitando pausa 12:00-13:00)
    const openSlotsRes = await SELF.fetch(
      `http://example.com/api/public/${alpha.slug}/slots?date=${wednesday}&serviceId=${alpha.serviceId}&professionalId=${alpha.professionalId}`
    );
    const openSlots = (await openSlotsRes.json()) as {
      slots: Array<{ time: string; startAt: string }>;
    };
    expect(openSlots.slots.length).toBeGreaterThan(4);
    expect(openSlots.slots.some((s) => s.time === '12:00' || s.time === '12:30')).toBe(false);

    const chosenSlot = openSlots.slots[0];
    const secondSlot = openSlots.slots[1];

    // Agendamento válido na Barbearia Alpha
    const bookRes = await SELF.fetch(`http://example.com/api/public/${alpha.slug}/appointments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        serviceId: alpha.serviceId,
        professionalId: alpha.professionalId,
        startAt: chosenSlot.startAt,
        customerName: 'Cliente Alpha',
        customerPhone: '11911112222'
      })
    });
    expect(bookRes.status).toBe(201);
    const bookJson = (await bookRes.json()) as {
      appointment: { id: string; confirmationCode: string };
    };
    expect(bookJson.appointment.confirmationCode).toMatch(/^BRB-/);

    // Reserva duplicada no mesmo horário deve retornar 409 Conflict
    const dupBookRes = await SELF.fetch(`http://example.com/api/public/${alpha.slug}/appointments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        serviceId: alpha.serviceId,
        professionalId: alpha.professionalId,
        startAt: chosenSlot.startAt,
        customerName: 'Outro Cliente',
        customerPhone: '11933334444'
      })
    });
    expect(dupBookRes.status).toBe(409);

    // Serviço incompatível (criar serviço extra sem vincular ao profissional e tentar agendar)
    const extraSrvRes = await SELF.fetch('http://example.com/api/admin/services', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: alpha.cookie },
      body: JSON.stringify({
        name: 'Pigmentação Exclusiva',
        priceInCents: 9000,
        durationMinutes: 45,
        isActive: true
      })
    });
    const extraSrv = (await extraSrvRes.json()) as { service: { id: string } };
    const incompatibleRes = await SELF.fetch(
      `http://example.com/api/public/${alpha.slug}/appointments`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceId: extraSrv.service.id,
          professionalId: alpha.professionalId,
          startAt: secondSlot.startAt,
          customerName: 'Cliente Teste',
          customerPhone: '11955556666'
        })
      }
    );
    expect(incompatibleRes.status).toBe(400);

    // Beta NÃO pode ver agendamentos nem clientes de Alpha
    const betaApptsRes = await SELF.fetch('http://example.com/api/admin/appointments', {
      headers: { Cookie: beta.cookie }
    });
    const betaAppts = (await betaApptsRes.json()) as { appointments: Array<{ Id: string }> };
    expect(betaAppts.appointments.length).toBe(0);

    const betaCustomersRes = await SELF.fetch('http://example.com/api/admin/customers', {
      headers: { Cookie: beta.cookie }
    });
    const betaCustomers = (await betaCustomersRes.json()) as { customers: unknown[] };
    expect(betaCustomers.customers.length).toBe(0);

    // Beta NÃO pode cancelar ou reagendar agendamento de Alpha
    const crossStatusRes = await SELF.fetch(
      `http://example.com/api/admin/appointments/${bookJson.appointment.id}/status`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: beta.cookie },
        body: JSON.stringify({ status: 'cancelled' })
      }
    );
    expect(crossStatusRes.status).toBe(404);

    // Reagendamento público válido em Alpha
    const reschedRes = await SELF.fetch(
      `http://example.com/api/public/${alpha.slug}/appointments/reschedule`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: bookJson.appointment.confirmationCode,
          phone: '11911112222',
          newStartAt: secondSlot.startAt
        })
      }
    );
    expect(reschedRes.status).toBe(200);

    // Cancelamento público válido em Alpha
    const cancelRes = await SELF.fetch(
      `http://example.com/api/public/${alpha.slug}/appointments/cancel`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: bookJson.appointment.confirmationCode,
          phone: '11911112222'
        })
      }
    );
    expect(cancelRes.status).toBe(200);

    // ── 4. Isolamento de Imagens (R2) e Personalização do Website ─────────
    // Monta um WebP válido mínimo (magic bytes RIFF....WEBP)
    const fakeWebP = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x1a, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
      0x56, 0x50, 0x38, 0x20, 0x0e, 0x00, 0x00, 0x00
    ]);
    const formData = new FormData();
    formData.append('file', new File([fakeWebP], 'logo.webp', { type: 'image/webp' }));
    formData.append('folder', 'logos');

    const uploadRes = await SELF.fetch('http://example.com/api/admin/media/upload', {
      method: 'POST',
      headers: { Cookie: alpha.cookie },
      body: formData
    });
    expect(uploadRes.status).toBe(201);
    const uploadJson = (await uploadRes.json()) as { url: string; objectKey: string };
    expect(uploadJson.objectKey).toContain(`tenants/${alpha.tenantId}/`);

    // Beta NÃO pode excluir imagem pertencente a Alpha (403)
    const crossDeleteMedia = await SELF.fetch('http://example.com/api/admin/media', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Cookie: beta.cookie },
      body: JSON.stringify({ objectKey: uploadJson.objectKey })
    });
    expect(crossDeleteMedia.status).toBe(403);

    // Personalizar website de Alpha (logo, cores, telefone, endereço, galeria)
    const updateSiteRes = await SELF.fetch('http://example.com/api/admin/website', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: alpha.cookie },
      body: JSON.stringify({
        businessName: 'Alpha Luxury Barber',
        logoUrl: uploadJson.url,
        primaryColor: '#10b981',
        secondaryColor: '#111827',
        accentColor: '#34d399',
        phone: '(11) 97777-6666',
        street: 'Rua Augusta',
        number: '500',
        city: 'São Paulo',
        state: 'SP'
      })
    });
    expect(updateSiteRes.status).toBe(200);

    const addGalleryRes = await SELF.fetch('http://example.com/api/admin/gallery', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: alpha.cookie },
      body: JSON.stringify({
        imageUrl: uploadJson.url,
        caption: 'Salão principal Alpha',
        displayOrder: 0,
        isActive: true
      })
    });
    expect(addGalleryRes.status).toBe(201);

    const alphaPublicRes = await SELF.fetch(`http://example.com/api/public/${alpha.slug}`);
    const alphaPublic = (await alphaPublicRes.json()) as {
      profile: {
        businessName: string;
        logoUrl: string;
        primaryColor: string;
        phone: string;
        street: string;
      };
      gallery: Array<{ caption: string }>;
    };
    expect(alphaPublic.profile.businessName).toBe('Alpha Luxury Barber');
    expect(alphaPublic.profile.logoUrl).toBe(uploadJson.url);
    expect(alphaPublic.profile.primaryColor).toBe('#10b981');
    expect(alphaPublic.profile.phone).toBe('(11) 97777-6666');
    expect(alphaPublic.profile.street).toBe('Rua Augusta');
    expect(alphaPublic.gallery[0].caption).toBe('Salão principal Alpha');

    // ── 5. Chatbot Multi-Tenant (Configuração, Fluxo Completo e Isolamento) ─
    const saveTgAlpha = await SELF.fetch('http://example.com/api/admin/chatbot', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: alpha.cookie },
      body: JSON.stringify({
        provider: 'telegram',
        isEnabled: true,
        botToken: '123456:SECRET_ALPHA_TOKEN',
        botUsername: '@AlphaBarberBot',
        welcomeMessage: 'Bem-vindo à Alpha!'
      })
    });
    expect(saveTgAlpha.status).toBe(200);

    // Token nunca é exposto em texto plano ao frontend
    const getChatbotRes = await SELF.fetch('http://example.com/api/admin/chatbot', {
      headers: { Cookie: alpha.cookie }
    });
    const getChatbot = (await getChatbotRes.json()) as {
      configs: Array<{ provider: string; hasToken: boolean; maskedToken: string }>;
    };
    const tgCfg = getChatbot.configs.find((c) => c.provider === 'telegram')!;
    expect(tgCfg.hasToken).toBe(true);
    expect(tgCfg.maskedToken).not.toContain('SECRET_ALPHA_TOKEN');

    // Webhook Telegram sem secret válido deve falhar (403)
    const secretHash = await sha256Hex('alpha-webhook-secret');
    await env.DB.prepare(
      `UPDATE ChatbotConfigurations SET WebhookSecretHash = ? WHERE TenantId = ? AND Provider = 'telegram'`
    )
      .bind(secretHash, alpha.tenantId)
      .run();

    const forgedWebhook = await SELF.fetch(
      `http://example.com/api/webhooks/telegram/${alpha.tenantId}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Telegram-Bot-Api-Secret-Token': 'wrong-secret'
        },
        body: JSON.stringify({ update_id: 1, message: { message_id: 1, chat: { id: 99 }, text: 'oi' } })
      }
    );
    expect(forgedWebhook.status).toBe(403);

    // Fluxo conversacional completo no Chatbot da Barbearia Alpha (isolado de Beta)
    const resolvedAlpha = await TenantResolver.resolveTelegramWebhook(
      env as any,
      alpha.tenantId,
      'alpha-webhook-secret'
    );
    expect(resolvedAlpha).not.toBeNull();

    const stepMenu = await ChatbotService.handleIncomingText({
      db: env.DB,
      tenant: resolvedAlpha!,
      externalUserId: 'tg-user-101',
      text: 'oi',
      source: 'telegram',
      dispatchReply: false
    });
    expect(stepMenu.reply).toContain('Bem-vindo à Alpha!');

    // Consultar serviços: deve listar Corte Alpha e NUNCA Corte Beta
    const stepServices = await ChatbotService.handleIncomingText({
      db: env.DB,
      tenant: resolvedAlpha!,
      externalUserId: 'tg-user-101',
      text: '1',
      source: 'telegram',
      dispatchReply: false
    });
    expect(stepServices.reply).toContain('Corte Alpha');
    expect(stepServices.reply).not.toContain('Corte Beta');

    // Iniciar agendamento pelo chatbot
    const sStart = await ChatbotService.handleIncomingText({
      db: env.DB,
      tenant: resolvedAlpha!,
      externalUserId: 'tg-user-101',
      text: '3',
      source: 'telegram',
      dispatchReply: false
    });
    expect(sStart.state).toBe('booking_service');

    const sSrv = await ChatbotService.handleIncomingText({
      db: env.DB,
      tenant: resolvedAlpha!,
      externalUserId: 'tg-user-101',
      text: '1',
      source: 'telegram',
      dispatchReply: false
    });
    expect(sSrv.state).toBe('booking_professional');

    const sProf = await ChatbotService.handleIncomingText({
      db: env.DB,
      tenant: resolvedAlpha!,
      externalUserId: 'tg-user-101',
      text: '1',
      source: 'telegram',
      dispatchReply: false
    });
    expect(sProf.state).toBe('booking_date');

    const sDate = await ChatbotService.handleIncomingText({
      db: env.DB,
      tenant: resolvedAlpha!,
      externalUserId: 'tg-user-101',
      text: wednesday,
      source: 'telegram',
      dispatchReply: false
    });
    expect(sDate.state).toBe('booking_slot');

    const sSlot = await ChatbotService.handleIncomingText({
      db: env.DB,
      tenant: resolvedAlpha!,
      externalUserId: 'tg-user-101',
      text: '1',
      source: 'telegram',
      dispatchReply: false
    });
    expect(sSlot.state).toBe('booking_name');

    const sName = await ChatbotService.handleIncomingText({
      db: env.DB,
      tenant: resolvedAlpha!,
      externalUserId: 'tg-user-101',
      text: 'Marcos Telegram',
      source: 'telegram',
      dispatchReply: false
    });
    expect(sName.state).toBe('booking_phone');

    const sConfirm = await ChatbotService.handleIncomingText({
      db: env.DB,
      tenant: resolvedAlpha!,
      externalUserId: 'tg-user-101',
      text: '11988881111',
      source: 'telegram',
      dispatchReply: false
    });
    expect(sConfirm.reply).toContain('Agendamento confirmado');
    const codeMatch = sConfirm.reply.match(/BRB-[A-Z0-9]{6}/);
    expect(codeMatch).not.toBeNull();
    const botBookingCode = codeMatch![0];

    // Cancelar pelo chatbot
    await ChatbotService.handleIncomingText({
      db: env.DB,
      tenant: resolvedAlpha!,
      externalUserId: 'tg-user-101',
      text: '4',
      source: 'telegram',
      dispatchReply: false
    });
    const cancelBot = await ChatbotService.handleIncomingText({
      db: env.DB,
      tenant: resolvedAlpha!,
      externalUserId: 'tg-user-101',
      text: botBookingCode,
      source: 'telegram',
      dispatchReply: false
    });
    expect(cancelBot.reply).toContain('cancelado com sucesso');

    // ── 6. Superadministrador e SEO ───────────────────────────────────────
    const forbiddenSuper = await SELF.fetch('http://example.com/api/superadmin/overview', {
      headers: { Cookie: alpha.cookie }
    });
    expect(forbiddenSuper.status).toBe(403);

    // Inserir usuário superadmin e autenticar
    const superHash = await hashPassword('Super@123456');
    await env.DB.prepare(
      `INSERT INTO Users (Id, Name, Email, PasswordHash, IsSuperAdmin, Status)
       VALUES ('super-1', 'Super Admin', 'super@saas.test', ?, 1, 'active')`
    )
      .bind(superHash)
      .run();

    const superLogin = await SELF.fetch('http://example.com/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'super@saas.test', password: 'Super@123456' })
    });
    expect(superLogin.status).toBe(200);
    const superCookie = extractCookie(superLogin);

    const overviewRes = await SELF.fetch('http://example.com/api/superadmin/overview', {
      headers: { Cookie: superCookie }
    });
    expect(overviewRes.status).toBe(200);
    const overview = (await overviewRes.json()) as {
      stats: { totalTenants: number; activeTenants: number };
    };
    expect(overview.stats.totalTenants).toBeGreaterThanOrEqual(2);

    // Sitemap inclui ambas barbearias ativas
    const sitemapRes = await SELF.fetch('http://example.com/sitemap.xml');
    expect(sitemapRes.status).toBe(200);
    const sitemapText = await sitemapRes.text();
    expect(sitemapText).toContain(`/b/${alpha.slug}`);
    expect(sitemapText).toContain(`/b/${beta.slug}`);

    // ── 7. BlockedSlots, Lookup cruzado e Superadmin bloqueando tenant ────
    const blockStart = secondSlot.startAt;
    const blockEnd = new Date(Date.parse(blockStart) + 30 * 60_000).toISOString();
    const blockRes = await SELF.fetch('http://example.com/api/admin/blocked-slots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: alpha.cookie },
      body: JSON.stringify({
        professionalId: alpha.professionalId,
        startAt: blockStart,
        endAt: blockEnd,
        reason: 'Manutenção'
      })
    });
    expect(blockRes.status).toBe(201);

    const blockedAttempt = await SELF.fetch(
      `http://example.com/api/public/${alpha.slug}/appointments`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceId: alpha.serviceId,
          professionalId: alpha.professionalId,
          startAt: blockStart,
          customerName: 'Cliente Bloqueado',
          customerPhone: '11922223333'
        })
      }
    );
    expect(blockedAttempt.status).toBe(409);

    // Lookup do código de Alpha na página pública de Beta deve retornar 404
    const crossLookup = await SELF.fetch(
      `http://example.com/api/public/${beta.slug}/appointments/lookup?code=${bookJson.appointment.confirmationCode}&phone=11911112222`
    );
    expect(crossLookup.status).toBe(404);

    // Superadmin bloqueia Beta -> Beta perde acesso admin (403) e página pública some (404)
    const blockTenantRes = await SELF.fetch(
      `http://example.com/api/superadmin/tenants/${beta.tenantId}/status`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: superCookie },
        body: JSON.stringify({ status: 'blocked' })
      }
    );
    expect(blockTenantRes.status).toBe(200);

    const betaBlockedAdmin = await SELF.fetch('http://example.com/api/admin/dashboard', {
      headers: { Cookie: beta.cookie }
    });
    expect(betaBlockedAdmin.status).toBe(403);

    const betaBlockedPublic = await SELF.fetch(`http://example.com/api/public/${beta.slug}`);
    expect(betaBlockedPublic.status).toBe(404);

    // ── 8. Auditoria e Fluxo Real de Webhook Telegram (HTTP + sendMessage) ──
    expect(TelegramProvider.normalizeToken('bot123456:ABC_DEF-0123456789abcdefghij')).toBe(
      '123456:ABC_DEF-0123456789abcdefghij'
    );

    const tgGetProbe = await SELF.fetch(
      `http://example.com/api/webhooks/telegram/${alpha.tenantId}`
    );
    expect(tgGetProbe.status).toBe(405);
    const tgGetProbeJson = (await tgGetProbe.json()) as { expectedMethod: string };
    expect(tgGetProbeJson.expectedMethod).toBe('POST');

    const tgUnauthorized = await SELF.fetch(
      `http://example.com/api/webhooks/telegram/${alpha.tenantId}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ update_id: 1 })
      }
    );
    expect(tgUnauthorized.status).toBe(403);

    const tgForbiddenWrongSecret = await SELF.fetch(
      `http://example.com/api/webhooks/telegram/${alpha.tenantId}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Telegram-Bot-Api-Secret-Token': 'wrong-secret'
        },
        body: JSON.stringify({ update_id: 2 })
      }
    );
    expect(tgForbiddenWrongSecret.status).toBe(403);

    const originalFetch = globalThis.fetch;
    const telegramCalls: Array<{ url: string; body?: Record<string, unknown> }> = [];
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.startsWith('https://api.telegram.org/bot')) {
        const parsedBody = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
        telegramCalls.push({ url, body: parsedBody });
        if (url.endsWith('/getMe')) {
          return new Response(
            JSON.stringify({ ok: true, result: { id: 999, username: 'AlphaBarberTestBot' } }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (url.endsWith('/getWebhookInfo')) {
          return new Response(
            JSON.stringify({
              ok: true,
              result: {
                url: `http://example.com/api/webhooks/telegram/${alpha.tenantId}`,
                pending_update_count: 0
              }
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (url.endsWith('/sendMessage')) {
          if (parsedBody?.parse_mode === 'Markdown') {
            return new Response(
              JSON.stringify({ ok: false, error_code: 400, description: "Bad Request: can't parse entities" }),
              { status: 400, headers: { 'Content-Type': 'application/json' } }
            );
          }
          return new Response(JSON.stringify({ ok: true, result: { message_id: 77 } }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }
      return originalFetch(input as RequestInfo, init);
    });

    try {
      const statusRes = await SELF.fetch('http://example.com/api/admin/chatbot/telegram/status', {
        headers: { Cookie: alpha.cookie }
      });
      expect(statusRes.status).toBe(200);
      const statusJson = (await statusRes.json()) as {
        configured: boolean;
        bot?: { username?: string };
        webhook?: { url?: string };
      };
      expect(statusJson.configured).toBe(true);
      expect(statusJson.bot?.username).toBe('AlphaBarberTestBot');
      expect(statusJson.webhook?.url).toContain(alpha.tenantId);

      const tgWebhookOk = await SELF.fetch(
        `http://example.com/api/webhooks/telegram/${alpha.tenantId}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Telegram-Bot-Api-Secret-Token': 'alpha-webhook-secret'
          },
          body: JSON.stringify({
            update_id: 1001,
            message: {
              message_id: 55,
              chat: { id: 888999, type: 'private' },
              from: { id: 888999, first_name: 'Carlos_Teste' },
              text: 'menu'
            }
          })
        }
      );
      expect(tgWebhookOk.status).toBe(200);
      const sendCalls = telegramCalls.filter((c) => c.url.endsWith('/sendMessage'));
      expect(sendCalls.length).toBe(2);
      expect(sendCalls[0].body?.parse_mode).toBe('Markdown');
      expect(sendCalls[1].body?.parse_mode).toBeUndefined();
      expect(String(sendCalls[1].body?.text)).toContain('1 - Ver serviços');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
