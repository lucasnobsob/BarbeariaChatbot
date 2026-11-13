export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: { id: number; first_name?: string; username?: string };
    chat: { id: number; type: string };
    text?: string;
    caption?: string;
  };
  edited_message?: {
    message_id: number;
    from?: { id: number; first_name?: string; username?: string };
    chat: { id: number; type: string };
    text?: string;
    caption?: string;
  };
}

export interface TelegramSendResult {
  ok: boolean;
  errorCode?: number;
  description?: string;
}

export interface TelegramWebhookInfoResult {
  ok: boolean;
  error_code?: number;
  description?: string;
  result?: {
    url?: string;
    has_custom_certificate?: boolean;
    pending_update_count?: number;
    last_error_date?: number;
    last_error_message?: string;
    max_connections?: number;
    allowed_updates?: string[];
  };
}

export class TelegramProvider {
  static normalizeToken(rawToken: string): string {
    const trimmed = rawToken.trim();
    const prefixedMatch = trimmed.match(/^bot(\d+:[A-Za-z0-9_-]+)$/i);
    return prefixedMatch ? prefixedMatch[1] : trimmed;
  }

  static isValidTokenFormat(token: string): boolean {
    return /^\d+:[A-Za-z0-9_-]{8,}$/.test(token);
  }

  static async sendMessage(
    rawBotToken: string,
    chatId: string,
    text: string
  ): Promise<TelegramSendResult> {
    const botToken = this.normalizeToken(rawBotToken);
    if (!botToken) {
      return { ok: false, description: 'Bot token ausente' };
    }

    const postMessage = async (parseMode?: 'Markdown') => {
      const payload: Record<string, unknown> = {
        chat_id: chatId,
        text
      };
      if (parseMode) {
        payload.parse_mode = parseMode;
      }
      const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error_code?: number;
        description?: string;
      } | null;
      return { res, data };
    };

    const first = await postMessage('Markdown');
    if (first.res.ok && first.data?.ok !== false) {
      return { ok: true };
    }

    // Legacy Markdown fails with 400 if dynamic text contains unescaped _ * [ `
    if (first.res.status === 400 || first.data?.error_code === 400) {
      const fallback = await postMessage(undefined);
      if (fallback.res.ok && fallback.data?.ok !== false) {
        return { ok: true };
      }
      return {
        ok: false,
        errorCode: fallback.data?.error_code ?? fallback.res.status,
        description: fallback.data?.description || `HTTP ${fallback.res.status}`
      };
    }

    return {
      ok: false,
      errorCode: first.data?.error_code ?? first.res.status,
      description: first.data?.description || `HTTP ${first.res.status}`
    };
  }

  static async setWebhook(
    rawBotToken: string,
    webhookUrl: string,
    secretToken: string
  ): Promise<{ ok: boolean; error_code?: number; description?: string }> {
    const botToken = this.normalizeToken(rawBotToken);
    const res = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: secretToken,
        allowed_updates: ['message']
      })
    });
    const parsed = (await res.json().catch(() => null)) as {
      ok?: boolean;
      error_code?: number;
      description?: string;
    } | null;
    if (!parsed) {
      return { ok: false, error_code: res.status, description: `HTTP ${res.status}` };
    }
    return {
      ok: Boolean(parsed.ok),
      error_code: parsed.error_code,
      description: parsed.description
    };
  }

  static async getWebhookInfo(rawBotToken: string): Promise<TelegramWebhookInfoResult> {
    const botToken = this.normalizeToken(rawBotToken);
    const res = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
    const parsed = (await res.json().catch(() => null)) as TelegramWebhookInfoResult | null;
    if (!parsed) {
      return { ok: false, error_code: res.status, description: `HTTP ${res.status}` };
    }
    return parsed;
  }

  static async getMe(rawBotToken: string): Promise<{
    ok: boolean;
    error_code?: number;
    description?: string;
    result?: { id?: number; username?: string; first_name?: string };
  }> {
    const botToken = this.normalizeToken(rawBotToken);
    const res = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
    const parsed = (await res.json().catch(() => null)) as {
      ok?: boolean;
      error_code?: number;
      description?: string;
      result?: { id?: number; username?: string; first_name?: string };
    } | null;
    if (!parsed) {
      return { ok: false, error_code: res.status, description: `HTTP ${res.status}` };
    }
    return {
      ok: Boolean(parsed.ok),
      error_code: parsed.error_code,
      description: parsed.description,
      result: parsed.result
    };
  }

  static extractIncomingMessage(update: TelegramUpdate): {
    externalUserId: string;
    text: string;
  } | null {
    const msg = update.message || update.edited_message;
    const text = msg?.text ?? msg?.caption;
    if (!msg || !text) return null;
    return {
      externalUserId: String(msg.chat.id),
      text
    };
  }
}
