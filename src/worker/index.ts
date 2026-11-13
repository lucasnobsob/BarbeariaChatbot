import { Hono } from 'hono';
import type { AppEnv } from '@worker/types';
import { csrfOriginCheck, resolveAuth } from '@worker/middleware/auth';
import { authRoutes } from '@worker/domains/auth/routes';
import { onboardingRoutes } from '@worker/domains/onboarding/routes';
import { publicRoutes } from '@worker/domains/public/routes';
import { adminRoutes } from '@worker/domains/admin/routes';
import { mediaAdminRoutes, mediaServeRoutes } from '@worker/domains/media/routes';
import { chatbotAdminRoutes, chatbotWebhookRoutes } from '@worker/domains/chatbot/routes';
import { superAdminRoutes } from '@worker/domains/superadmin/routes';
import { injectBarbershopSeoMeta, seoRoutes } from '@worker/domains/seo/routes';
import { logSystemEvent } from '@worker/lib/logger';

export const app = new Hono<AppEnv>();

// Security headers for all responses
app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('X-Frame-Options', 'SAMEORIGIN');
});

// Global error handler (redacted logs)
app.onError(async (err, c) => {
  await logSystemEvent(c.env.DB, {
    tenantId: c.get('tenantId') ?? null,
    level: 'error',
    source: new URL(c.req.url).pathname,
    message: err.message || 'Unhandled server error'
  });
  return c.json({ error: 'Erro interno no servidor' }, 500);
});

// Auth session resolution & CSRF origin verification for API routes
app.use('/api/*', resolveAuth);
app.use('/api/admin/*', csrfOriginCheck);
app.use('/api/onboarding/*', csrfOriginCheck);
app.use('/api/superadmin/*', csrfOriginCheck);
app.use('/api/auth/logout', csrfOriginCheck);
app.use('/api/auth/switch-tenant', csrfOriginCheck);

app.get('/api/health', (c) => {
  return c.json({ status: 'ok', service: 'barbearia-saas-platform' });
});

app.route('/api/auth', authRoutes);
app.route('/api/onboarding', onboardingRoutes);
app.route('/api/public', publicRoutes);
app.route('/api/admin/media', mediaAdminRoutes);
app.route('/api/admin/chatbot', chatbotAdminRoutes);
app.route('/api/admin', adminRoutes);
app.route('/api/webhooks', chatbotWebhookRoutes);
app.route('/api/superadmin', superAdminRoutes);

app.route('/media', mediaServeRoutes);
app.route('/', seoRoutes);

// Dynamic SEO meta injection for /b/:slug* SPA pages
app.get('/b/:slug/*', async (c) => serveSpaWithSeo(c));
app.get('/b/:slug', async (c) => serveSpaWithSeo(c));

async function serveSpaWithSeo(c: any): Promise<Response> {
  if (!c.env.ASSETS) {
    return c.text('SPA assets unavailable in standalone worker test mode', 200);
  }
  const indexUrl = new URL('/index.html', c.req.url);
  const assetRes = await c.env.ASSETS.fetch(new Request(indexUrl.toString()));
  if (!assetRes.ok) return assetRes;

  const html = await assetRes.text();
  const slug = c.req.param('slug');
  const injected = await injectBarbershopSeoMeta(c, slug, html);
  return new Response(injected, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=60'
    }
  });
}

// Fallback to Cloudflare Static Assets for all other frontend routes
app.all('*', async (c) => {
  if (c.env.ASSETS) {
    return c.env.ASSETS.fetch(c.req.raw);
  }
  return c.notFound();
});

export default app;
