import type { BillingProviderType } from '@shared/types';
import type { WorkerBindings } from '@worker/types';
import { buildStaticPixBrCode } from './pixBrCode';

export interface BillingRuntimeConfig {
  provider: BillingProviderType;
  trialDays: number;
  graceDays: number;
  monthlyPriceCents: number;
  pixKey: string;
  pixReceiverName: string;
  pixReceiverCity: string;
}

export interface CreatePixChargeInput {
  invoiceId: string;
  tenantId: string;
  tenantName: string;
  payerEmail: string;
  amountInCents: number;
  dueDateIso: string;
  webhookUrl: string;
  config: BillingRuntimeConfig;
  env: WorkerBindings;
}

export interface CreatePixChargeResult {
  provider: BillingProviderType;
  providerInvoiceId: string | null;
  pixCopyPaste: string;
  pixQrCodeBase64: string;
  invoiceUrl: string;
}

export interface VerifiedPaymentWebhookEvent {
  provider: BillingProviderType;
  providerEventId: string;
  eventType: string;
  invoiceId: string;
  amountInCents: number;
  status: 'approved' | 'rejected' | 'pending';
}

export interface PaymentGatewayProvider {
  readonly name: BillingProviderType;
  createPixCharge(input: CreatePixChargeInput): Promise<CreatePixChargeResult>;
  verifyWebhook?(
    req: Request,
    rawBody: string,
    env: WorkerBindings
  ): Promise<VerifiedPaymentWebhookEvent | null>;
}

function constantTimeHexEqual(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export class ManualPixProvider implements PaymentGatewayProvider {
  readonly name: BillingProviderType = 'manual_pix';

  async createPixCharge(input: CreatePixChargeInput): Promise<CreatePixChargeResult> {
    const pixKey = input.config.pixKey || input.env.PIX_RECEIVER_KEY || '';
    if (!pixKey.trim()) {
      throw new Error(
        'Chave Pix de recebimento ainda não configurada. O superadministrador deve definir billing_pix_key nas configurações da plataforma.'
      );
    }

    const txId = `BS${input.invoiceId.replace(/[^A-Za-z0-9]/g, '').slice(0, 20)}`;
    const pixCopyPaste = buildStaticPixBrCode({
      pixKey,
      receiverName:
        input.config.pixReceiverName || input.env.PIX_RECEIVER_NAME || 'BarberSaaS',
      receiverCity:
        input.config.pixReceiverCity || input.env.PIX_RECEIVER_CITY || 'SAO PAULO',
      amountInCents: input.amountInCents,
      txId
    });

    return {
      provider: 'manual_pix',
      providerInvoiceId: txId,
      pixCopyPaste,
      pixQrCodeBase64: '',
      invoiceUrl: ''
    };
  }
}

export class MercadoPagoPixProvider implements PaymentGatewayProvider {
  readonly name: BillingProviderType = 'mercadopago';

  async createPixCharge(input: CreatePixChargeInput): Promise<CreatePixChargeResult> {
    const token = input.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!token) {
      throw new Error(
        'MERCADOPAGO_ACCESS_TOKEN não configurado nas variáveis do Worker.'
      );
    }

    const res = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': input.invoiceId
      },
      body: JSON.stringify({
        transaction_amount: Number((input.amountInCents / 100).toFixed(2)),
        description: `Assinatura mensal BarberSaaS — ${input.tenantName}`,
        payment_method_id: 'pix',
        external_reference: input.invoiceId,
        notification_url: input.webhookUrl,
        date_of_expiration: input.dueDateIso,
        payer: {
          email: input.payerEmail || 'cliente@barbersaas.app'
        }
      })
    });

    const data = (await res.json().catch(() => null)) as {
      id?: number | string;
      message?: string;
      point_of_interaction?: {
        transaction_data?: {
          qr_code?: string;
          qr_code_base64?: string;
          ticket_url?: string;
        };
      };
    } | null;

    if (!res.ok || !data?.id) {
      throw new Error(
        data?.message || `Falha ao gerar cobrança Pix no Mercado Pago (HTTP ${res.status})`
      );
    }

    const txData = data.point_of_interaction?.transaction_data;
    return {
      provider: 'mercadopago',
      providerInvoiceId: String(data.id),
      pixCopyPaste: txData?.qr_code || '',
      pixQrCodeBase64: txData?.qr_code_base64 || '',
      invoiceUrl: txData?.ticket_url || ''
    };
  }

  async verifyWebhook(
    req: Request,
    rawBody: string,
    env: WorkerBindings
  ): Promise<VerifiedPaymentWebhookEvent | null> {
    const secret = env.MERCADOPAGO_WEBHOOK_SECRET;
    const accessToken = env.MERCADOPAGO_ACCESS_TOKEN;
    if (!secret || !accessToken) {
      return null;
    }

    const xSignature = req.headers.get('x-signature') || '';
    const xRequestId = req.headers.get('x-request-id') || '';
    const url = new URL(req.url);

    let payload: { type?: string; action?: string; data?: { id?: string | number } } | null =
      null;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      payload = null;
    }

    const rawDataId =
      url.searchParams.get('data.id') ||
      (payload?.data?.id !== undefined ? String(payload.data.id) : '');
    const dataId = rawDataId.toLowerCase();

    const sigParts = Object.fromEntries(
      xSignature
        .split(',')
        .map((part) => part.trim().split('='))
        .filter(([k, v]) => Boolean(k) && Boolean(v))
    );

    const ts = sigParts.ts || '';
    const v1 = (sigParts.v1 || '').toLowerCase();
    if (!ts || !v1 || !dataId) {
      return null;
    }

    const manifestParts = [`id:${dataId};`];
    if (xRequestId) manifestParts.push(`request-id:${xRequestId};`);
    manifestParts.push(`ts:${ts};`);
    const expectedHex = await hmacSha256Hex(secret, manifestParts.join(''));
    if (!constantTimeHexEqual(expectedHex, v1)) {
      return null;
    }

    const eventType = payload?.type || url.searchParams.get('type') || 'payment';
    if (eventType !== 'payment') {
      return null;
    }

    const paymentRes = await fetch(`https://api.mercadopago.com/v1/payments/${rawDataId}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!paymentRes.ok) {
      return null;
    }

    const mpPayment = (await paymentRes.json()) as {
      id: number | string;
      status: string;
      external_reference?: string;
      transaction_amount?: number;
    };

    const invoiceId = mpPayment.external_reference || '';
    if (!invoiceId) {
      return null;
    }

    const mappedStatus =
      mpPayment.status === 'approved'
        ? 'approved'
        : mpPayment.status === 'rejected' || mpPayment.status === 'cancelled'
          ? 'rejected'
          : 'pending';

    return {
      provider: 'mercadopago',
      providerEventId: `mp_pay_${mpPayment.id}_${mpPayment.status}`,
      eventType: `payment.${mpPayment.status}`,
      invoiceId,
      amountInCents: Math.round((mpPayment.transaction_amount || 0) * 100),
      status: mappedStatus
    };
  }
}

export function resolvePaymentProvider(
  providerType: BillingProviderType,
  env: WorkerBindings
): PaymentGatewayProvider {
  const effective =
    env.PAYMENT_PROVIDER === 'mercadopago' || providerType === 'mercadopago'
      ? 'mercadopago'
      : 'manual_pix';

  if (effective === 'mercadopago' && env.MERCADOPAGO_ACCESS_TOKEN) {
    return new MercadoPagoPixProvider();
  }
  return new ManualPixProvider();
}
