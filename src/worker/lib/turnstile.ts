import type { WorkerBindings } from '@worker/types';

export async function verifyTurnstileToken(
  env: WorkerBindings,
  token: string | undefined,
  remoteIp?: string | null
): Promise<boolean> {
  const isProd = env.ENVIRONMENT === 'production';
  const secret = env.TURNSTILE_SECRET_KEY;
  const usingDummySiteKey = !env.TURNSTILE_SITE_KEY || env.TURNSTILE_SITE_KEY === '1x00000000000000000000AA';

  if (!secret) {
    // Allow until real Turnstile secret & site key are configured in Cloudflare
    return !isProd || usingDummySiteKey;
  }

  // Cloudflare official dummy test secret passes in dev/test
  if (!isProd && (!token || secret === '1x0000000000000000000000000000000AA')) {
    return true;
  }

  if (!token) {
    return false;
  }

  const formData = new FormData();
  formData.append('secret', secret);
  formData.append('response', token);
  if (remoteIp) {
    formData.append('remoteip', remoteIp);
  }

  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: formData
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean };
    return Boolean(data.success);
  } catch {
    return false;
  }
}
