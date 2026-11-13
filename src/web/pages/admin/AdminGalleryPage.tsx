import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, ImagePlus, Trash2 } from 'lucide-react';
import type { GalleryImageItem } from '@shared/types';
import { apiFetch } from '@web/lib/api';
import { uploadOptimizedImage } from '@web/lib/imageOptimizer';

export function AdminGalleryPage() {
  const [images, setImages] = useState<GalleryImageItem[]>([]);
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    const res = await apiFetch<{ images: GalleryImageItem[] }>('/api/admin/gallery');
    setImages(res.images);
  };

  useEffect(() => {
    void load();
  }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const up = await uploadOptimizedImage(file, 'gallery', 1400);
      await apiFetch('/api/admin/gallery', {
        method: 'POST',
        body: JSON.stringify({
          imageUrl: up.url,
          caption: caption.trim(),
          displayOrder: images.length,
          isActive: true
        })
      });
      setCaption('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro no upload');
    } finally {
      setUploading(false);
    }
  };

  const move = async (idx: number, delta: -1 | 1) => {
    const target = idx + delta;
    if (target < 0 || target >= images.length) return;
    const copy = [...images];
    const [item] = copy.splice(idx, 1);
    copy.splice(target, 0, item);
    setImages(copy);
    await apiFetch('/api/admin/gallery/reorder', {
      method: 'PUT',
      body: JSON.stringify({ orderedIds: copy.map((i) => i.id) })
    });
  };

  const updateCaption = async (img: GalleryImageItem, newCaption: string) => {
    await apiFetch(`/api/admin/gallery/${img.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        imageUrl: img.imageUrl,
        caption: newCaption,
        displayOrder: img.displayOrder,
        isActive: img.isActive
      })
    });
    await load();
  };

  const handleDelete = async (img: GalleryImageItem) => {
    await apiFetch(`/api/admin/gallery/${img.id}`, { method: 'DELETE' });
    if (img.imageUrl.startsWith('/media/')) {
      await apiFetch('/api/admin/media', {
        method: 'DELETE',
        body: JSON.stringify({ url: img.imageUrl })
      }).catch(() => {});
    }
    await load();
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Galeria de Fotos</h1>

      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-4">
        <p className="text-sm text-slate-300">
          As imagens são convertidas e otimizadas para WebP no navegador antes de serem salvas no Cloudflare R2.
        </p>
        <div className="flex flex-wrap gap-3">
          <input
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Legenda opcional para a próxima foto..."
            className="flex-1 min-w-[220px] rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-sm"
          />
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-amber-500 px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400">
            <ImagePlus className="h-4 w-4" />
            {uploading ? 'Otimizando e enviando...' : 'Adicionar Fotografia'}
            <input
              type="file"
              accept="image/*"
              disabled={uploading}
              className="hidden"
              onChange={(e) => void handleUpload(e)}
            />
          </label>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {images.map((img, idx) => (
          <div key={img.id} className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
            <img src={img.imageUrl} alt={img.caption} className="h-48 w-full object-cover" />
            <div className="p-4 space-y-3">
              <input
                defaultValue={img.caption}
                onBlur={(e) => {
                  if (e.target.value !== img.caption) {
                    void updateCaption(img, e.target.value);
                  }
                }}
                placeholder="Adicionar legenda..."
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs"
              />
              <div className="flex items-center justify-between">
                <div className="flex gap-1">
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => void move(idx, -1)}
                    className="rounded-lg border border-slate-700 p-1.5 disabled:opacity-30"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={idx === images.length - 1}
                    onClick={() => void move(idx, 1)}
                    className="rounded-lg border border-slate-700 p-1.5 disabled:opacity-30"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => void handleDelete(img)}
                  className="inline-flex items-center gap-1 rounded-lg border border-red-500/30 px-2.5 py-1 text-xs text-red-400 hover:bg-red-950/40"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Excluir
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
