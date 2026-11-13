/**
 * Compresses and resizes images on the client using Canvas -> WebP
 * before sending to Cloudflare R2 so storage and bandwidth stay well within free quotas.
 */
export async function optimizeImageToWebP(
  file: File,
  maxWidth = 1400,
  quality = 0.82
): Promise<File> {
  if (!file.type.startsWith('image/')) {
    return file;
  }

  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;

  const scale = bitmap.width > maxWidth ? maxWidth / bitmap.width : 1;
  const targetW = Math.max(1, Math.round(bitmap.width * scale));
  const targetH = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    return file;
  }

  ctx.drawImage(bitmap, 0, 0, targetW, targetH);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/webp', quality)
  );
  if (!blob) return file;

  const baseName = file.name.replace(/\.[^.]+$/, '');
  return new File([blob], `${baseName}.webp`, { type: 'image/webp' });
}

export async function uploadOptimizedImage(
  file: File,
  folder: 'logos' | 'covers' | 'services' | 'professionals' | 'gallery',
  maxWidth = 1400
): Promise<{ url: string; objectKey: string; sizeBytes: number }> {
  const optimized = await optimizeImageToWebP(file, maxWidth);
  const form = new FormData();
  form.append('file', optimized);
  form.append('folder', folder);

  const res = await fetch('/api/admin/media/upload', {
    method: 'POST',
    body: form,
    credentials: 'include'
  });
  const data = (await res.json().catch(() => ({}))) as {
    url?: string;
    objectKey?: string;
    sizeBytes?: number;
    error?: string;
  };
  if (!res.ok || !data.url) {
    throw new Error(data.error || 'Falha no upload da imagem');
  }
  return {
    url: data.url,
    objectKey: data.objectKey || '',
    sizeBytes: data.sizeBytes || optimized.size
  };
}
