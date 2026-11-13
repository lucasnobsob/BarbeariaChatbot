export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: { id: number; first_name?: string; username?: string };
    chat: { id: number; type: string };
    text?: string;
  };
}

export class TelegramProvider {
  static async sendMessage(botToken: string, chatId: string, text: string): Promise<boolean> {
    if (!botToken) return false;
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown'
      })
    });
    return res.ok;
  }

  static async setWebhook(
    botToken: string,
    webhookUrl: string,
    secretToken: string
  ): Promise<{ ok: boolean; description?: string }> {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: secretToken,
        allowed_updates: ['message']
      })
    });
    return (await res.json()) as { ok: boolean; description?: string };
  }

  static async getMe(botToken: string): Promise<{ ok: boolean; result?: { username?: string } }> {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
    return (await res.json()) as { ok: boolean; result?: { username?: string } };
  }

  static extractIncomingMessage(update: TelegramUpdate): {
    externalUserId: string;
    text: string;
  } | null {
    const msg = update.message;
    if (!msg || !msg.text) return null;
    return {
      externalUserId: String(msg.chat.id),
      text: msg.text
    };
  }
}
