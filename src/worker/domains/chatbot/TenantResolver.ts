import { decryptSecret, resolveEncryptionKey, sha256Hex } from '@worker/lib/crypto';
import type { WorkerBindings } from '@worker/types';
import type { ChatbotProviderType } from '@shared/types';
import { isTenantSubscriptionOperational } from '@worker/domains/billing/service';

export interface ResolvedChatbotTenant {
  tenantId: string;
  tenantName: string;
  slug: string;
  provider: ChatbotProviderType;
  isEnabled: boolean;
  welcomeMessage: string;
  awayMessage: string;
  secrets: {
    botToken?: string;
    botUsername?: string;
    phoneNumberId?: string;
    accessToken?: string;
    appSecret?: string;
    verifyToken?: string;
  };
}

export class TenantResolver {
  static async resolveForAdmin(
    env: WorkerBindings,
    tenantId: string,
    provider: ChatbotProviderType
  ): Promise<ResolvedChatbotTenant | null> {
    const row = await env.DB.prepare(
      `SELECT t.Id AS TenantId, t.Name AS TenantName, t.Slug, t.Status,
              c.IsEnabled, c.ConfigurationJson, c.WelcomeMessage, c.AwayMessage
       FROM Tenants t
       LEFT JOIN ChatbotConfigurations c ON c.TenantId = t.Id AND c.Provider = ?
       WHERE t.Id = ?`
    )
      .bind(provider, tenantId)
      .first<{
        TenantId: string;
        TenantName: string;
        Slug: string;
        Status: string;
        IsEnabled: number | null;
        ConfigurationJson: string | null;
        WelcomeMessage: string | null;
        AwayMessage: string | null;
      }>();

    if (!row || row.Status === 'blocked') return null;

    const secrets = await this.decryptConfig(env, row.ConfigurationJson);
    return {
      tenantId: row.TenantId,
      tenantName: row.TenantName,
      slug: row.Slug,
      provider,
      isEnabled: row.IsEnabled === 1,
      welcomeMessage: row.WelcomeMessage || '',
      awayMessage: row.AwayMessage || '',
      secrets
    };
  }

  static async resolveTelegramWebhook(
    env: WorkerBindings,
    tenantId: string,
    secretTokenHeader: string | undefined
  ): Promise<ResolvedChatbotTenant | null> {
    const row = await env.DB.prepare(
      `SELECT t.Id AS TenantId, t.Name AS TenantName, t.Slug, t.Status,
              c.IsEnabled, c.ConfigurationJson, c.WelcomeMessage, c.AwayMessage, c.WebhookSecretHash
       FROM Tenants t
       INNER JOIN ChatbotConfigurations c ON c.TenantId = t.Id AND c.Provider = 'telegram'
       WHERE t.Id = ? AND t.Status = 'active' AND c.IsEnabled = 1`
    )
      .bind(tenantId)
      .first<{
        TenantId: string;
        TenantName: string;
        Slug: string;
        Status: string;
        IsEnabled: number;
        ConfigurationJson: string;
        WelcomeMessage: string;
        AwayMessage: string;
        WebhookSecretHash: string;
      }>();

    if (!row || !row.WebhookSecretHash || !secretTokenHeader) {
      return null;
    }

    const incomingHash = await sha256Hex(secretTokenHeader);
    if (incomingHash !== row.WebhookSecretHash) {
      return null;
    }

    if (!(await isTenantSubscriptionOperational(env.DB, row.TenantId))) {
      return null;
    }

    const secrets = await this.decryptConfig(env, row.ConfigurationJson);
    return {
      tenantId: row.TenantId,
      tenantName: row.TenantName,
      slug: row.Slug,
      provider: 'telegram',
      isEnabled: true,
      welcomeMessage: row.WelcomeMessage,
      awayMessage: row.AwayMessage,
      secrets
    };
  }

  static async resolveWhatsAppWebhook(
    env: WorkerBindings,
    tenantId: string
  ): Promise<ResolvedChatbotTenant | null> {
    const row = await env.DB.prepare(
      `SELECT t.Id AS TenantId, t.Name AS TenantName, t.Slug, t.Status,
              c.IsEnabled, c.ConfigurationJson, c.WelcomeMessage, c.AwayMessage
       FROM Tenants t
       INNER JOIN ChatbotConfigurations c ON c.TenantId = t.Id AND c.Provider = 'whatsapp'
       WHERE t.Id = ? AND t.Status = 'active' AND c.IsEnabled = 1`
    )
      .bind(tenantId)
      .first<{
        TenantId: string;
        TenantName: string;
        Slug: string;
        Status: string;
        IsEnabled: number;
        ConfigurationJson: string;
        WelcomeMessage: string;
        AwayMessage: string;
      }>();

    if (!row) return null;
    if (!(await isTenantSubscriptionOperational(env.DB, row.TenantId))) {
      return null;
    }
    const secrets = await this.decryptConfig(env, row.ConfigurationJson);
    return {
      tenantId: row.TenantId,
      tenantName: row.TenantName,
      slug: row.Slug,
      provider: 'whatsapp',
      isEnabled: true,
      welcomeMessage: row.WelcomeMessage,
      awayMessage: row.AwayMessage,
      secrets
    };
  }

  private static async decryptConfig(
    env: WorkerBindings,
    rawJson: string | null
  ): Promise<ResolvedChatbotTenant['secrets']> {
    if (!rawJson) return {};
    try {
      const parsed = JSON.parse(rawJson) as Record<string, string>;
      const key = resolveEncryptionKey(env.ENCRYPTION_KEY, env.ENVIRONMENT);
      return {
        botToken: parsed.botToken ? await decryptSecret(parsed.botToken, key) : undefined,
        botUsername: parsed.botUsername || undefined,
        phoneNumberId: parsed.phoneNumberId || undefined,
        accessToken: parsed.accessToken ? await decryptSecret(parsed.accessToken, key) : undefined,
        appSecret: parsed.appSecret ? await decryptSecret(parsed.appSecret, key) : undefined,
        verifyToken: parsed.verifyToken ? await decryptSecret(parsed.verifyToken, key) : undefined
      };
    } catch {
      return {};
    }
  }
}
