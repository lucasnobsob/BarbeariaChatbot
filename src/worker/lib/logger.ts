import { generateId } from './crypto';

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'token',
  'bottoken',
  'accesstoken',
  'appsecret',
  'secret',
  'authorization',
  'cookie',
  'encryption_key'
]);

export function redactSensitiveData(input: unknown): unknown {
  if (input === null || input === undefined) return input;
  if (typeof input === 'string') {
    return input.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]');
  }
  if (Array.isArray(input)) {
    return input.map((item) => redactSensitiveData(item));
  }
  if (typeof input === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(input as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(key.toLowerCase())) {
        output[key] = '[REDACTED]';
      } else {
        output[key] = redactSensitiveData(val);
      }
    }
    return output;
  }
  return input;
}

export async function logSystemEvent(
  db: D1Database,
  params: {
    tenantId?: string | null;
    level: 'info' | 'warn' | 'error';
    source: string;
    message: string;
    meta?: Record<string, unknown>;
  }
): Promise<void> {
  try {
    const safeMeta = params.meta ? JSON.stringify(redactSensitiveData(params.meta)) : '{}';
    await db
      .prepare(
        `INSERT INTO SystemLogs (Id, TenantId, Level, Source, Message, MetaJson)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(
        generateId(),
        params.tenantId ?? null,
        params.level,
        params.source,
        params.message.slice(0, 500),
        safeMeta.slice(0, 2000)
      )
      .run();
  } catch {
    // Avoid throwing from logger
  }
}
