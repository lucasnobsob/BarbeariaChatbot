import { verifyHmacSha256 } from '@worker/lib/crypto';

export interface WhatsAppWebhookPayload {
  entry?: Array<{
    changes?: Array<{
      value?: {
        metadata?: { phone_number_id?: string };
        messages?: Array<{
          from: string;
          type: string;
          text?: { body?: string };
        }>;
      };
    }>;
  }>;
}

export class WhatsAppProvider {
  static async verifySignature(
    rawBody: string,
    signatureHeader: string | undefined,
    appSecret: string | undefined
  ): Promise<boolean> {
    if (!signatureHeader || !appSecret) return false;
    return verifyHmacSha256(rawBody, signatureHeader, appSecret);
  }

  static extractIncomingMessage(payload: WhatsAppWebhookPayload): {
    externalUserId: string;
    text: string;
  } | null {
    const msg = payload.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg || msg.type !== 'text' || !msg.text?.body) return null;
    return {
      externalUserId: msg.from,
      text: msg.text.body
    };
  }

  static async sendMessage(
    phoneNumberId: string,
    accessToken: string,
    to: string,
    text: string
  ): Promise<{ ok: boolean; errorCode?: number; description?: string }> {
    if (!phoneNumberId || !accessToken) {
      return { ok: false, description: 'Phone Number ID ou Access Token ausente' };
    }
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${encodeURIComponent(phoneNumberId)}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body: text }
        })
      }
    );
    if (res.ok) {
      return { ok: true };
    }
    const errBody = (await res.json().catch(() => null)) as {
      error?: { code?: number; message?: string; error_data?: { details?: string } };
    } | null;
    const description =
      errBody?.error?.error_data?.details || errBody?.error?.message || `HTTP ${res.status}`;
    return {
      ok: false,
      errorCode: errBody?.error?.code ?? res.status,
      description
    };
  }
}
