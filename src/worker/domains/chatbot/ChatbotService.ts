import { generateId } from '@worker/lib/crypto';
import { logSystemEvent } from '@worker/lib/logger';
import type { ResolvedChatbotTenant } from './TenantResolver';
import { MessageHandler, type ChatSessionContext } from './MessageHandler';
import { TelegramProvider } from './TelegramProvider';
import { WhatsAppProvider } from './WhatsAppProvider';

export class ChatbotService {
  static async handleIncomingText(params: {
    db: D1Database;
    tenant: ResolvedChatbotTenant;
    externalUserId: string;
    text: string;
    source: 'telegram' | 'whatsapp';
    sessionProvider?: 'telegram' | 'whatsapp' | 'simulator';
    dispatchReply?: boolean;
    nowMs?: number;
  }): Promise<{ reply: string; state: string }> {
    const {
      db,
      tenant,
      externalUserId,
      text,
      source,
      sessionProvider = source,
      dispatchReply = true,
      nowMs
    } = params;

    const nowIso = new Date(nowMs ?? Date.now()).toISOString();
    let session = await db
      .prepare(
        `SELECT Id, CurrentState, ContextJson, ExpiresAt
         FROM ChatSessions
         WHERE TenantId = ? AND Provider = ? AND ExternalUserId = ?`
      )
      .bind(tenant.tenantId, sessionProvider, externalUserId)
      .first<{ Id: string; CurrentState: string; ContextJson: string; ExpiresAt: string }>();

    let sessionId: string;
    let currentState = 'idle';
    let context: ChatSessionContext = {};

    if (!session || session.ExpiresAt <= nowIso) {
      sessionId = session?.Id || generateId();
      const expiresAt = new Date((nowMs ?? Date.now()) + 2 * 60 * 60 * 1000).toISOString();
      if (!session) {
        await db
          .prepare(
            `INSERT INTO ChatSessions (Id, TenantId, Provider, ExternalUserId, CurrentState, ContextJson, ExpiresAt)
             VALUES (?, ?, ?, ?, 'idle', '{}', ?)`
          )
          .bind(sessionId, tenant.tenantId, sessionProvider, externalUserId, expiresAt)
          .run();
      } else {
        await db
          .prepare(
            `UPDATE ChatSessions SET CurrentState = 'idle', ContextJson = '{}', ExpiresAt = ?, UpdatedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
             WHERE TenantId = ? AND Id = ?`
          )
          .bind(expiresAt, tenant.tenantId, sessionId)
          .run();
      }
    } else {
      sessionId = session.Id;
      currentState = session.CurrentState;
      try {
        context = JSON.parse(session.ContextJson || '{}') as ChatSessionContext;
      } catch {
        context = {};
      }
    }

    await db
      .prepare(
        `INSERT INTO ChatMessages (Id, TenantId, SessionId, Direction, Message)
         VALUES (?, ?, ?, 'inbound', ?)`
      )
      .bind(generateId(), tenant.tenantId, sessionId, text.slice(0, 2000))
      .run();

    const result = await MessageHandler.process({
      db,
      tenantId: tenant.tenantId,
      tenantName: tenant.tenantName,
      welcomeMessage: tenant.welcomeMessage,
      awayMessage: tenant.awayMessage,
      source,
      currentState,
      context,
      text,
      nowMs
    });

    const newExpires = new Date((nowMs ?? Date.now()) + 2 * 60 * 60 * 1000).toISOString();
    await db.batch([
      db
        .prepare(
          `UPDATE ChatSessions
           SET CurrentState = ?, ContextJson = ?, ExpiresAt = ?, UpdatedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE TenantId = ? AND Id = ?`
        )
        .bind(
          result.nextState,
          JSON.stringify(result.nextContext),
          newExpires,
          tenant.tenantId,
          sessionId
        ),
      db
        .prepare(
          `INSERT INTO ChatMessages (Id, TenantId, SessionId, Direction, Message)
           VALUES (?, ?, ?, 'outbound', ?)`
        )
        .bind(generateId(), tenant.tenantId, sessionId, result.reply.slice(0, 4000))
    ]);

    if (dispatchReply) {
      if (source === 'telegram') {
        if (!tenant.secrets.botToken) {
          await logSystemEvent(db, {
            tenantId: tenant.tenantId,
            level: 'warn',
            source: 'chatbot/telegram/sendMessage',
            message: 'Bot token ausente ao tentar enviar resposta pelo Telegram'
          });
        } else {
          try {
            const sendRes = await TelegramProvider.sendMessage(
              tenant.secrets.botToken,
              externalUserId,
              result.reply
            );
            if (!sendRes.ok) {
              await logSystemEvent(db, {
                tenantId: tenant.tenantId,
                level: 'error',
                source: 'chatbot/telegram/sendMessage',
                message: sendRes.description || 'Falha ao enviar resposta pelo Telegram',
                meta: { errorCode: sendRes.errorCode ?? null }
              });
            }
          } catch (err) {
            await logSystemEvent(db, {
              tenantId: tenant.tenantId,
              level: 'error',
              source: 'chatbot/telegram/sendMessage',
              message: err instanceof Error ? err.message : 'Erro de rede ao chamar sendMessage'
            });
          }
        }
      } else if (source === 'whatsapp') {
        if (!tenant.secrets.phoneNumberId || !tenant.secrets.accessToken) {
          await logSystemEvent(db, {
            tenantId: tenant.tenantId,
            level: 'warn',
            source: 'chatbot/whatsapp/sendMessage',
            message: 'Phone Number ID ou Access Token ausente ao tentar enviar resposta no WhatsApp'
          });
        } else {
          try {
            const waRes = await WhatsAppProvider.sendMessage(
              tenant.secrets.phoneNumberId,
              tenant.secrets.accessToken,
              externalUserId,
              result.reply
            );
            if (!waRes.ok) {
              await logSystemEvent(db, {
                tenantId: tenant.tenantId,
                level: 'error',
                source: 'chatbot/whatsapp/sendMessage',
                message: waRes.description || 'Falha ao enviar resposta pelo WhatsApp',
                meta: { errorCode: waRes.errorCode ?? null }
              });
            }
          } catch (err) {
            await logSystemEvent(db, {
              tenantId: tenant.tenantId,
              level: 'error',
              source: 'chatbot/whatsapp/sendMessage',
              message: err instanceof Error ? err.message : 'Erro de rede ao chamar WhatsApp Cloud API'
            });
          }
        }
      }
    }

    return { reply: result.reply, state: result.nextState };
  }
}
