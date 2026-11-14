import { Hono } from 'hono';
import type { AppEnv } from '@worker/types';
import { requireTenantAccess } from '@worker/middleware/auth';
import { chatbotConfigSchema } from '@shared/schemas';
import {
  encryptSecret,
  generateId,
  generateToken,
  maskSecret,
  resolveEncryptionKey,
  sha256Hex
} from '@worker/lib/crypto';
import { TenantResolver } from './TenantResolver';
import { ChatbotService } from './ChatbotService';
import { TelegramProvider, type TelegramUpdate } from './TelegramProvider';
import { WhatsAppProvider, type WhatsAppWebhookPayload } from './WhatsAppProvider';
import { logSystemEvent } from '@worker/lib/logger';

export const chatbotAdminRoutes = new Hono<AppEnv>();
export const chatbotWebhookRoutes = new Hono<AppEnv>();

chatbotAdminRoutes.use('*', requireTenantAccess(['owner', 'admin', 'manager']));

chatbotAdminRoutes.get('/', async (c) => {
  const tenantId = c.get('tenantId')!;
  const origin = new URL(c.req.url).origin;

  const [tg, wa, tgSecretRow] = await Promise.all([
    TenantResolver.resolveForAdmin(c.env, tenantId, 'telegram'),
    TenantResolver.resolveForAdmin(c.env, tenantId, 'whatsapp'),
    c.env.DB.prepare(
      `SELECT CASE WHEN WebhookSecretHash != '' THEN 1 ELSE 0 END AS HasSecret
       FROM ChatbotConfigurations WHERE TenantId = ? AND Provider = 'telegram'`
    )
      .bind(tenantId)
      .first<{ HasSecret: number }>()
  ]);

  return c.json({
    configs: [
      {
        provider: 'telegram',
        isEnabled: tg?.isEnabled ?? false,
        welcomeMessage: tg?.welcomeMessage ?? '',
        awayMessage: tg?.awayMessage ?? '',
        hasToken: Boolean(tg?.secrets.botToken),
        maskedToken: maskSecret(tg?.secrets.botToken),
        botUsername: tg?.secrets.botUsername || '',
        webhookUrl: `${origin}/api/webhooks/telegram/${tenantId}`,
        webhookRegistered: tgSecretRow?.HasSecret === 1
      },
      {
        provider: 'whatsapp',
        isEnabled: wa?.isEnabled ?? false,
        welcomeMessage: wa?.welcomeMessage ?? '',
        awayMessage: wa?.awayMessage ?? '',
        hasToken: Boolean(wa?.secrets.accessToken),
        maskedToken: maskSecret(wa?.secrets.accessToken),
        phoneNumberId: wa?.secrets.phoneNumberId || '',
        webhookUrl: `${origin}/api/webhooks/whatsapp/${tenantId}`
      }
    ]
  });
});

chatbotAdminRoutes.put('/', async (c) => {
  const tenantId = c.get('tenantId')!;
  const parsed = chatbotConfigSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0]?.message || 'Configuração inválida' }, 400);
  }

  const data = parsed.data;
  const existing = await TenantResolver.resolveForAdmin(c.env, tenantId, data.provider);
  const encKey = resolveEncryptionKey(c.env.ENCRYPTION_KEY, c.env.ENVIRONMENT);

  let configJsonObj: Record<string, string> = {};
  let webhookSecretHash = '';

  if (data.provider === 'telegram') {
    const rawNewToken = data.botToken?.trim();
    const normalizedNew = rawNewToken ? TelegramProvider.normalizeToken(rawNewToken) : '';
    if (normalizedNew && !TelegramProvider.isValidTokenFormat(normalizedNew)) {
      return c.json(
        {
          error:
            'Formato de Bot Token inválido. Cole apenas o token gerado pelo @BotFather (ex: 123456789:AAF...), sem o prefixo "bot".'
        },
        400
      );
    }
    const botTokenPlain =
      normalizedNew || (existing?.secrets.botToken ? TelegramProvider.normalizeToken(existing.secrets.botToken) : '');
    const botUsername = data.botUsername?.trim() || existing?.secrets.botUsername || '';
    configJsonObj = {
      botToken: botTokenPlain ? await encryptSecret(botTokenPlain, encKey) : '',
      botUsername
    };

    const existingRow = await c.env.DB.prepare(
      `SELECT WebhookSecretHash FROM ChatbotConfigurations WHERE TenantId = ? AND Provider = 'telegram'`
    )
      .bind(tenantId)
      .first<{ WebhookSecretHash: string }>();
    webhookSecretHash = existingRow?.WebhookSecretHash || '';
  } else {
    const accessTokenPlain = data.accessToken?.trim() || existing?.secrets.accessToken || '';
    const appSecretPlain = data.appSecret?.trim() || existing?.secrets.appSecret || '';
    const verifyTokenPlain = data.verifyToken?.trim() || existing?.secrets.verifyToken || '';
    const phoneNumberId = data.phoneNumberId?.trim() || existing?.secrets.phoneNumberId || '';
    configJsonObj = {
      phoneNumberId,
      accessToken: accessTokenPlain ? await encryptSecret(accessTokenPlain, encKey) : '',
      appSecret: appSecretPlain ? await encryptSecret(appSecretPlain, encKey) : '',
      verifyToken: verifyTokenPlain ? await encryptSecret(verifyTokenPlain, encKey) : ''
    };
  }

  await c.env.DB.prepare(
    `INSERT INTO ChatbotConfigurations (
       Id, TenantId, Provider, IsEnabled, ConfigurationJson, WelcomeMessage, AwayMessage, WebhookSecretHash
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(TenantId, Provider) DO UPDATE SET
       IsEnabled = excluded.IsEnabled,
       ConfigurationJson = excluded.ConfigurationJson,
       WelcomeMessage = excluded.WelcomeMessage,
       AwayMessage = excluded.AwayMessage,
       WebhookSecretHash = CASE WHEN excluded.WebhookSecretHash != '' THEN excluded.WebhookSecretHash ELSE ChatbotConfigurations.WebhookSecretHash END,
       UpdatedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`
  )
    .bind(
      generateId(),
      tenantId,
      data.provider,
      data.isEnabled ? 1 : 0,
      JSON.stringify(configJsonObj),
      data.welcomeMessage,
      data.awayMessage,
      webhookSecretHash
    )
    .run();

  return c.json({ ok: true });
});

chatbotAdminRoutes.post('/telegram/register-webhook', async (c) => {
  const tenantId = c.get('tenantId')!;
  const resolved = await TenantResolver.resolveForAdmin(c.env, tenantId, 'telegram');
  if (!resolved?.secrets.botToken) {
    return c.json({ error: 'Configure o token do bot Telegram antes de registrar o webhook' }, 400);
  }

  const normalizedToken = TelegramProvider.normalizeToken(resolved.secrets.botToken);
  const secretToken = generateToken(24);
  const secretHash = await sha256Hex(secretToken);
  const origin = new URL(c.req.url).origin;
  const webhookUrl = `${origin}/api/webhooks/telegram/${tenantId}`;

  const tgRes = await TelegramProvider.setWebhook(
    normalizedToken,
    webhookUrl,
    secretToken
  );

  if (!tgRes.ok) {
    await logSystemEvent(c.env.DB, {
      tenantId,
      level: 'error',
      source: 'chatbot/telegram/setWebhook',
      message: tgRes.description || 'Falha ao registrar webhook na API do Telegram',
      meta: { errorCode: tgRes.error_code ?? null }
    });
    return c.json(
      { error: tgRes.description || 'Falha ao registrar webhook na API do Telegram' },
      502
    );
  }

  await c.env.DB.prepare(
    `UPDATE ChatbotConfigurations SET WebhookSecretHash = ?, UpdatedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     WHERE TenantId = ? AND Provider = 'telegram'`
  )
    .bind(secretHash, tenantId)
    .run();

  return c.json({ ok: true, webhookUrl, isEnabled: resolved.isEnabled });
});

chatbotAdminRoutes.get('/telegram/status', async (c) => {
  const tenantId = c.get('tenantId')!;
  const origin = new URL(c.req.url).origin;
  const expectedWebhookUrl = `${origin}/api/webhooks/telegram/${tenantId}`;

  const [resolved, secretRow] = await Promise.all([
    TenantResolver.resolveForAdmin(c.env, tenantId, 'telegram'),
    c.env.DB.prepare(
      `SELECT CASE WHEN WebhookSecretHash != '' THEN 1 ELSE 0 END AS HasSecret
       FROM ChatbotConfigurations WHERE TenantId = ? AND Provider = 'telegram'`
    )
      .bind(tenantId)
      .first<{ HasSecret: number }>()
  ]);

  const webhookSecretSaved = secretRow?.HasSecret === 1;
  if (!resolved?.secrets.botToken) {
    return c.json({
      configured: false,
      isEnabled: resolved?.isEnabled ?? false,
      webhookSecretSaved,
      expectedWebhookUrl
    });
  }

  const normalizedToken = TelegramProvider.normalizeToken(resolved.secrets.botToken);
  const [meRes, infoRes] = await Promise.all([
    TelegramProvider.getMe(normalizedToken),
    TelegramProvider.getWebhookInfo(normalizedToken)
  ]);

  return c.json({
    configured: true,
    isEnabled: resolved.isEnabled,
    webhookSecretSaved,
    expectedWebhookUrl,
    bot: meRes.ok ? meRes.result ?? null : null,
    botError: !meRes.ok ? meRes.description || 'Token inválido na API do Telegram' : null,
    webhook: infoRes.ok ? infoRes.result ?? null : null,
    webhookError: !infoRes.ok ? infoRes.description || 'Falha ao consultar getWebhookInfo' : null
  });
});

chatbotAdminRoutes.post('/simulate', async (c) => {
  const tenantId = c.get('tenantId')!;
  const body = (await c.req.json().catch(() => null)) as {
    message?: string;
    sessionKey?: string;
  } | null;
  const text = (body?.message || '').trim();
  if (!text) return c.json({ error: 'Informe message' }, 400);

  const resolved =
    (await TenantResolver.resolveForAdmin(c.env, tenantId, 'telegram')) ||
    (await TenantResolver.resolveForAdmin(c.env, tenantId, 'whatsapp'));

  if (!resolved) {
    return c.json({ error: 'Estabelecimento não encontrado' }, 404);
  }

  const result = await ChatbotService.handleIncomingText({
    db: c.env.DB,
    tenant: resolved,
    externalUserId: body?.sessionKey || 'admin-simulator',
    text,
    source: 'telegram',
    sessionProvider: 'simulator',
    dispatchReply: false
  });

  return c.json(result);
});

// ─── Public Webhooks ─────────────────────────────────────────────────────────
chatbotWebhookRoutes.get('/telegram/:tenantId', (c) => {
  return c.json(
    {
      ok: false,
      error: 'Method Not Allowed',
      expectedMethod: 'POST',
      description:
        'Endpoint de webhook Telegram ativo. A Telegram Bot API envia atualizações exclusivamente via POST.'
    },
    405
  );
});

chatbotWebhookRoutes.post('/telegram/:tenantId', async (c) => {
  const tenantId = c.req.param('tenantId');
  const secretHeader = c.req.header('X-Telegram-Bot-Api-Secret-Token');

  const resolved = await TenantResolver.resolveTelegramWebhook(
    c.env,
    tenantId,
    secretHeader
  );
  if (!resolved) {
    const diagRow = await c.env.DB.prepare(
      `SELECT t.Status AS TenantStatus, c.IsEnabled,
              CASE WHEN c.WebhookSecretHash != '' THEN 1 ELSE 0 END AS HasSecret
       FROM Tenants t
       LEFT JOIN ChatbotConfigurations c ON c.TenantId = t.Id AND c.Provider = 'telegram'
       WHERE t.Id = ?`
    )
      .bind(tenantId)
      .first<{ TenantStatus: string; IsEnabled: number | null; HasSecret: number | null }>();

    const reason = !diagRow
      ? 'tenant_not_found'
      : diagRow.TenantStatus !== 'active'
        ? `tenant_status_${diagRow.TenantStatus}`
        : diagRow.IsEnabled !== 1
          ? 'telegram_disabled'
          : !diagRow.HasSecret
            ? 'webhook_secret_not_registered'
            : !secretHeader
              ? 'missing_secret_token_header'
              : 'secret_token_mismatch';

    await logSystemEvent(c.env.DB, {
      tenantId: diagRow ? tenantId : null,
      level: 'warn',
      source: 'chatbot/telegram/webhook',
      message: `Webhook Telegram rejeitado (403): ${reason}`
    });
    return c.json({ error: 'Webhook não autorizado' }, 403);
  }

  const update = (await c.req.json().catch(() => null)) as TelegramUpdate | null;
  if (!update) return c.json({ ok: true });

  const incoming = TelegramProvider.extractIncomingMessage(update);
  if (!incoming) return c.json({ ok: true });

  try {
    await ChatbotService.handleIncomingText({
      db: c.env.DB,
      tenant: resolved,
      externalUserId: incoming.externalUserId,
      text: incoming.text,
      source: 'telegram'
    });
  } catch (err) {
    await logSystemEvent(c.env.DB, {
      tenantId: resolved.tenantId,
      level: 'error',
      source: 'chatbot/telegram/webhook',
      message: err instanceof Error ? err.message : 'Erro ao processar atualização do Telegram'
    });
  }

  return c.json({ ok: true });
});

chatbotWebhookRoutes.get('/whatsapp/:tenantId', async (c) => {
  const tenantId = c.req.param('tenantId');
  const mode = c.req.query('hub.mode');
  const token = c.req.query('hub.verify_token');
  const challenge = c.req.query('hub.challenge');

  const resolved = await TenantResolver.resolveWhatsAppWebhook(c.env, tenantId);
  if (
    !resolved ||
    mode !== 'subscribe' ||
    !token ||
    token !== resolved.secrets.verifyToken
  ) {
    return c.text('Forbidden', 403);
  }
  return c.text(challenge || '', 200);
});

chatbotWebhookRoutes.post('/whatsapp/:tenantId', async (c) => {
  const tenantId = c.req.param('tenantId');
  const resolved = await TenantResolver.resolveWhatsAppWebhook(c.env, tenantId);
  if (!resolved) {
    await logSystemEvent(c.env.DB, {
      tenantId,
      level: 'warn',
      source: 'chatbot/whatsapp/webhook',
      message: 'Webhook WhatsApp rejeitado (403): tenant inativo ou WhatsApp desabilitado'
    });
    return c.json({ error: 'Webhook não autorizado' }, 403);
  }

  const rawBody = await c.req.text();
  const signature = c.req.header('X-Hub-Signature-256');
  const validSig = await WhatsAppProvider.verifySignature(
    rawBody,
    signature,
    resolved.secrets.appSecret
  );
  if (!validSig) {
    const reason = !signature
      ? 'missing_hub_signature_header'
      : !resolved.secrets.appSecret
        ? 'missing_app_secret'
        : 'hmac_signature_mismatch';
    await logSystemEvent(c.env.DB, {
      tenantId: resolved.tenantId,
      level: 'warn',
      source: 'chatbot/whatsapp/webhook',
      message: `Webhook WhatsApp rejeitado (403): ${reason}`
    });
    return c.json({ error: 'Assinatura inválida' }, 403);
  }

  const payload = JSON.parse(rawBody) as WhatsAppWebhookPayload;
  const incoming = WhatsAppProvider.extractIncomingMessage(payload);
  if (!incoming) return c.json({ ok: true });

  try {
    await ChatbotService.handleIncomingText({
      db: c.env.DB,
      tenant: resolved,
      externalUserId: incoming.externalUserId,
      text: incoming.text,
      source: 'whatsapp'
    });
  } catch (err) {
    await logSystemEvent(c.env.DB, {
      tenantId: resolved.tenantId,
      level: 'error',
      source: 'chatbot/whatsapp/webhook',
      message: err instanceof Error ? err.message : 'Erro ao processar mensagem do WhatsApp'
    });
  }

  return c.json({ ok: true });
});
