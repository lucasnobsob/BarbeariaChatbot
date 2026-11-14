import type { AuthUser, UserRole } from '@shared/types';

export interface WorkerBindings {
  DB: D1Database;
  MEDIA_BUCKET?: R2Bucket;
  ASSETS?: Fetcher;
  ENCRYPTION_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  TURNSTILE_SITE_KEY?: string;
  ENVIRONMENT?: string;
  APP_NAME?: string;
  PAYMENT_PROVIDER?: string;
  MERCADOPAGO_ACCESS_TOKEN?: string;
  MERCADOPAGO_WEBHOOK_SECRET?: string;
  PIX_RECEIVER_KEY?: string;
  PIX_RECEIVER_NAME?: string;
  PIX_RECEIVER_CITY?: string;
}

export interface WorkerVariables {
  user: AuthUser | null;
  tenantId: string | null;
  role: UserRole | null;
}

export interface AppEnv {
  Bindings: WorkerBindings;
  Variables: WorkerVariables;
}
