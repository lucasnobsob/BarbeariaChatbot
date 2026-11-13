import { Hono } from 'hono';
import type { AppEnv } from '@worker/types';

export const seoRoutes = new Hono<AppEnv>();

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

seoRoutes.get('/robots.txt', (c) => {
  const origin = new URL(c.req.url).origin;
  const content = [
    'User-agent: *',
    'Allow: /',
    'Allow: /b/',
    'Disallow: /admin',
    'Disallow: /superadmin',
    'Disallow: /api/',
    `Sitemap: ${origin}/sitemap.xml`
  ].join('\n');
  return c.text(content, 200, { 'Content-Type': 'text/plain; charset=utf-8' });
});

seoRoutes.get('/sitemap.xml', async (c) => {
  const origin = new URL(c.req.url).origin;
  const { results } = await c.env.DB.prepare(
    `SELECT Slug, UpdatedAt FROM Tenants WHERE Status = 'active' ORDER BY UpdatedAt DESC LIMIT 1000`
  ).all<{ Slug: string; UpdatedAt: string }>();

  const urls: string[] = [
    `<url><loc>${origin}/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>`
  ];

  for (const t of results) {
    const lastmod = t.UpdatedAt.slice(0, 10);
    for (const suffix of ['', '/services', '/gallery', '/booking', '/location']) {
      urls.push(
        `<url><loc>${origin}/b/${t.Slug}${suffix}</loc><lastmod>${lastmod}</lastmod><changefreq>daily</changefreq><priority>${suffix === '' ? '0.9' : '0.7'}</priority></url>`
      );
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`;
  return c.text(xml, 200, { 'Content-Type': 'application/xml; charset=utf-8' });
});

export async function injectBarbershopSeoMeta(
  c: { env: AppEnv['Bindings']; req: { url: string } },
  slug: string,
  baseHtml: string
): Promise<string> {
  const row = await c.env.DB.prepare(
    `SELECT t.Slug, bp.BusinessName, bp.Tagline, bp.Description, bp.CoverImageUrl, bp.LogoUrl,
            bp.Phone, bp.Street, bp.Number, bp.Neighborhood, bp.City, bp.State, bp.PostalCode,
            bp.Latitude, bp.Longitude
     FROM Tenants t
     INNER JOIN BusinessProfiles bp ON bp.TenantId = t.Id
     WHERE t.Slug = ? AND t.Status = 'active'`
  )
    .bind(slug.toLowerCase())
    .first<Record<string, unknown>>();

  if (!row) return baseHtml;

  const origin = new URL(c.req.url).origin;
  const name = String(row.BusinessName || 'Barbearia');
  const desc = String(row.Description || row.Tagline || `Agende seu horário online em ${name}.`).slice(0, 160);
  const rawImg = String(row.CoverImageUrl || row.LogoUrl || '');
  const ogImage = rawImg.startsWith('http') ? rawImg : rawImg ? `${origin}${rawImg}` : '';
  const canonicalUrl = `${origin}/b/${String(row.Slug)}`;

  const schemaLd = {
    '@context': 'https://schema.org',
    '@type': 'HairSalon',
    name,
    description: desc,
    url: canonicalUrl,
    ...(ogImage ? { image: ogImage } : {}),
    ...(row.Phone ? { telephone: String(row.Phone) } : {}),
    ...(row.City
      ? {
          address: {
            '@type': 'PostalAddress',
            streetAddress: `${String(row.Street || '')} ${String(row.Number || '')}`.trim(),
            addressLocality: String(row.City),
            addressRegion: String(row.State || ''),
            postalCode: String(row.PostalCode || ''),
            addressCountry: 'BR'
          }
        }
      : {}),
    ...(row.Latitude !== null && row.Longitude !== null
      ? {
          geo: {
            '@type': 'GeoCoordinates',
            latitude: Number(row.Latitude),
            longitude: Number(row.Longitude)
          }
        }
      : {})
  };

  const titleTag = `<title>${escapeHtml(name)} — Agendamento Online</title>`;
  const extraMeta = [
    `<meta name="description" content="${escapeHtml(desc)}" />`,
    `<link rel="canonical" href="${escapeHtml(canonicalUrl)}" />`,
    `<meta property="og:type" content="business.business" />`,
    `<meta property="og:title" content="${escapeHtml(name)}" />`,
    `<meta property="og:description" content="${escapeHtml(desc)}" />`,
    `<meta property="og:url" content="${escapeHtml(canonicalUrl)}" />`,
    ogImage ? `<meta property="og:image" content="${escapeHtml(ogImage)}" />` : '',
    `<script type="application/ld+json">${JSON.stringify(schemaLd).replace(/</g, '\\u003c')}</script>`
  ]
    .filter(Boolean)
    .join('\n    ');

  return baseHtml
    .replace(/<title>.*?<\/title>/is, titleTag)
    .replace(/<meta name="description"[^>]*>/i, '')
    .replace(/<meta property="og:[^>]*>/gi, '')
    .replace('</head>', `    ${extraMeta}\n  </head>`);
}
