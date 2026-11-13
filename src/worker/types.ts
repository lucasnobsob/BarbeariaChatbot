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
