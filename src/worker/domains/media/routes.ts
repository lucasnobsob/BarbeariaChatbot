import { Hono } from 'hono';
import type { AppEnv } from '@worker/types';
import { generateId } from '@worker/lib/crypto';
import { requireTenantAccess } from '@worker/middleware/auth';

export const mediaAdminRoutes = new Hono<AppEnv>();
export const mediaServeRoutes = new Hono<AppEnv>();

const ALLOWED_FOLDERS = new Set(['logos', 'covers', 'services', 'professionals', 'gallery']);

function detectImageType(bytes: Uint8Array): { ext: string; mime: string } | null {
  if (bytes.length < 12) return null;
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { ext: 'webp', mime: 'image/webp' };
  }
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { ext: 'png', mime: 'image/png' };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { ext: 'jpg', mime: 'image/jpeg' };
  }
  if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
    if (brand === 'avif' || brand === 'avis') {
      return { ext: 'avif', mime: 'image/avif' };
    }
  }
  return null;
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

mediaAdminRoutes.post(
  '/upload',
  requireTenantAccess(['owner', 'admin', 'manager']),
  async (c) => {
    const tenantId = c.get('tenantId')!;
    const formData = await c.req.formData().catch(() => null);
    if (!formData) {
      return c.json({ error: 'Envie os dados em multipart/form-data' }, 400);
    }

    const file = formData.get('file');
    if (!file || !(file instanceof File)) {
      return c.json({ error: 'Arquivo de imagem obrigatório' }, 400);
    }

    const folderRaw = String(formData.get('folder') || 'gallery');
    const folder = ALLOWED_FOLDERS.has(folderRaw) ? folderRaw : 'gallery';

    const maxSetting = await c.env.DB.prepare(
      `SELECT SettingValue FROM PlatformSettings WHERE SettingKey = 'max_upload_size_bytes'`
    ).first<{ SettingValue: string }>();
    const configuredMax = Number(maxSetting?.SettingValue || 2_097_152);
    const maxBytes = c.env.MEDIA_BUCKET ? configuredMax : Math.min(configuredMax, 600_000);

    if (file.size === 0 || file.size > maxBytes) {
      return c.json(
        { error: `Imagem deve ter no máximo ${Math.round(maxBytes / 1024)} KB` },
        400
      );
    }

    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const detected = detectImageType(bytes);
    if (!detected) {
      return c.json(
        { error: 'Formato inválido. Utilize WebP, AVIF, PNG ou JPEG.' },
        400
      );
    }

    const assetId = generateId();
    const objectKey = `tenants/${tenantId}/${folder}/${assetId}.${detected.ext}`;
    let dataBase64: string | null = null;

    if (c.env.MEDIA_BUCKET) {
      await c.env.MEDIA_BUCKET.put(objectKey, buffer, {
        httpMetadata: {
          contentType: detected.mime,
          cacheControl: 'public, max-age=31536000, immutable'
        },
        customMetadata: {
          tenantId
        }
      });
    } else {
      dataBase64 = uint8ToBase64(bytes);
    }

    await c.env.DB.prepare(
      `INSERT INTO MediaAssets (Id, TenantId, ObjectKey, ContentType, SizeBytes, DataBase64)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
      .bind(assetId, tenantId, objectKey, detected.mime, bytes.byteLength, dataBase64)
      .run();

    return c.json(
      {
        id: assetId,
        objectKey,
        url: `/media/${objectKey}`,
        contentType: detected.mime,
        sizeBytes: bytes.byteLength
      },
      201
    );
  }
);

mediaAdminRoutes.delete(
  '/',
  requireTenantAccess(['owner', 'admin', 'manager']),
  async (c) => {
    const tenantId = c.get('tenantId')!;
    const body = (await c.req.json().catch(() => null)) as { objectKey?: string; url?: string } | null;
    let objectKey = body?.objectKey || '';
    if (!objectKey && body?.url?.startsWith('/media/')) {
      objectKey = body.url.slice('/media/'.length);
    }

    if (!objectKey) {
      return c.json({ error: 'objectKey ou url obrigatório' }, 400);
    }

    const asset = await c.env.DB.prepare(
      `SELECT Id, ObjectKey FROM MediaAssets WHERE TenantId = ? AND ObjectKey = ?`
    )
      .bind(tenantId, objectKey)
      .first<{ Id: string; ObjectKey: string }>();

    if (!asset) {
      return c.json({ error: 'Arquivo não encontrado ou acesso negado' }, 403);
    }

    if (c.env.MEDIA_BUCKET) {
      await c.env.MEDIA_BUCKET.delete(asset.ObjectKey);
    }
    await c.env.DB.prepare(`DELETE FROM MediaAssets WHERE TenantId = ? AND Id = ?`)
      .bind(tenantId, asset.Id)
      .run();

    return c.json({ ok: true });
  }
);

mediaServeRoutes.get('/*', async (c) => {
  const prefix = '/media/';
  const path = new URL(c.req.url).pathname;
  if (!path.startsWith(prefix)) {
    return c.notFound();
  }
  const objectKey = decodeURIComponent(path.slice(prefix.length));
  if (!objectKey || objectKey.includes('..')) {
    return c.notFound();
  }

  const asset = await c.env.DB.prepare(
    `SELECT m.ObjectKey, m.ContentType, m.DataBase64, t.Status AS TenantStatus
     FROM MediaAssets m
     INNER JOIN Tenants t ON t.Id = m.TenantId
     WHERE m.ObjectKey = ?`
  )
    .bind(objectKey)
    .first<{
      ObjectKey: string;
      ContentType: string;
      DataBase64: string | null;
      TenantStatus: string;
    }>();

  if (!asset || asset.TenantStatus === 'blocked') {
    return c.notFound();
  }

  const headers = new Headers();
  headers.set('Content-Type', asset.ContentType);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('X-Content-Type-Options', 'nosniff');

  if (asset.DataBase64) {
    return new Response(base64ToUint8(asset.DataBase64), { headers });
  }

  if (!c.env.MEDIA_BUCKET) {
    return c.notFound();
  }

  const obj = await c.env.MEDIA_BUCKET.get(objectKey);
  if (!obj) {
    return c.notFound();
  }

  return new Response(obj.body, { headers });
});
