import { useEffect, useState } from 'react';
import { ImagePlus, Pencil, Plus, Trash2 } from 'lucide-react';
import type { ServiceCategory, ServiceItem } from '@shared/types';
import { apiFetch, formatBRL } from '@web/lib/api';
import { uploadOptimizedImage } from '@web/lib/imageOptimizer';

export function AdminServicesPage() {
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [newCatName, setNewCatName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    description: '',
    priceReais: '45.00',
    durationMinutes: 30,
    categoryId: '',
    imageUrl: '',
    isActive: true
  });
  const [error, setError] = useState('');

  const load = async () => {
    const [sRes, cRes] = await Promise.all([
      apiFetch<{ services: ServiceItem[] }>('/api/admin/services'),
      apiFetch<{ categories: ServiceCategory[] }>('/api/admin/categories')
    ]);
    setServices(sRes.services);
    setCategories(cRes.categories);
  };

  useEffect(() => {
    void load();
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setForm({
      name: '',
      description: '',
      priceReais: '45.00',
      durationMinutes: 30,
      categoryId: '',
      imageUrl: '',
      isActive: true
    });
  };

  const handleSaveService = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const payload = {
      name: form.name,
      description: form.description,
      priceInCents: Math.max(0, Math.round(parseFloat(form.priceReais.replace(',', '.') || '0') * 100)),
      durationMinutes: Number(form.durationMinutes),
      categoryId: form.categoryId || null,
      imageUrl: form.imageUrl,
      isActive: form.isActive
    };

    try {
      if (editingId) {
        await apiFetch(`/api/admin/services/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
      } else {
        await apiFetch('/api/admin/services', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
      }
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar serviço');
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    await apiFetch('/api/admin/categories', {
      method: 'POST',
      body: JSON.stringify({ name: newCatName.trim(), description: '', isActive: true })
    });
    setNewCatName('');
    await load();
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const up = await uploadOptimizedImage(file, 'services', 900);
      setForm({ ...form, imageUrl: up.url });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro no upload');
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Serviços & Categorias</h1>

      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {/* Categories */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <h2 className="mb-3 text-sm font-semibold text-white">Categorias</h2>
        <form onSubmit={handleAddCategory} className="mb-3 flex gap-2">
          <input
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
            placeholder="Nova categoria (ex: Cortes, Barba, Combos)"
            className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
          />
          <button type="submit" className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-amber-300 hover:bg-slate-700">
            Adicionar
          </button>
        </form>
        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <span
              key={cat.id}
              className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-xs"
            >
              {cat.name}
              <button
                type="button"
                onClick={async () => {
                  await apiFetch(`/api/admin/categories/${cat.id}`, { method: 'DELETE' });
                  await load();
                }}
                className="text-red-400 hover:text-red-300"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSaveService} className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-white">
          {editingId ? 'Editar Serviço' : 'Novo Serviço'}
        </h2>
        <div className="grid gap-4 md:grid-cols-4">
          <input
            required
            placeholder="Nome do serviço"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
          />
          <input
            required
            placeholder="Preço (R$)"
            value={form.priceReais}
            onChange={(e) => setForm({ ...form, priceReais: e.target.value })}
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
          />
          <input
            type="number"
            required
            min={5}
            max={480}
            placeholder="Duração (min)"
            value={form.durationMinutes}
            onChange={(e) => setForm({ ...form, durationMinutes: Number(e.target.value) })}
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
          />
          <select
            value={form.categoryId}
            onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
          >
            <option value="">Sem categoria</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>

        <textarea
          rows={2}
          placeholder="Descrição do serviço"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
        />

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-xs">
              <ImagePlus className="h-4 w-4 text-amber-400" /> Imagem do serviço
              <input type="file" accept="image/*" className="hidden" onChange={(e) => void handleImageUpload(e)} />
            </label>
            {form.imageUrl && (
              <img src={form.imageUrl} alt="Preview" className="h-10 w-10 rounded-lg object-cover" />
            )}
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              />
              Ativo no site
            </label>
          </div>
          <div className="flex gap-2">
            {editingId && (
              <button type="button" onClick={resetForm} className="rounded-xl border border-slate-700 px-4 py-2 text-sm">
                Cancelar
              </button>
            )}
            <button type="submit" className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400">
              <Plus className="h-4 w-4" /> {editingId ? 'Salvar' : 'Cadastrar Serviço'}
            </button>
          </div>
        </div>
      </form>

      {/* List */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {services.map((srv) => (
          <div key={srv.id} className="flex flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div>
              {srv.imageUrl && (
                <img src={srv.imageUrl} alt={srv.name} className="mb-3 h-36 w-full rounded-xl object-cover" />
              )}
              <div className="flex items-start justify-between">
                <h3 className="font-semibold text-white">{srv.name}</h3>
                <span className="font-bold text-amber-400">{formatBRL(srv.priceInCents)}</span>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                {srv.durationMinutes} min • {srv.isActive ? 'Ativo' : 'Inativo'}
              </p>
              {srv.description && <p className="mt-2 text-sm text-slate-300">{srv.description}</p>}
            </div>
            <div className="mt-4 flex justify-end gap-2 border-t border-slate-800 pt-3">
              <button
                type="button"
                onClick={() => {
                  setEditingId(srv.id);
                  setForm({
                    name: srv.name,
                    description: srv.description,
                    priceReais: (srv.priceInCents / 100).toFixed(2),
                    durationMinutes: srv.durationMinutes,
                    categoryId: srv.categoryId || '',
                    imageUrl: srv.imageUrl,
                    isActive: srv.isActive
                  });
                }}
                className="rounded-lg border border-slate-700 p-2 text-slate-300 hover:text-white"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={async () => {
                  await apiFetch(`/api/admin/services/${srv.id}`, { method: 'DELETE' });
                  await load();
                }}
                className="rounded-lg border border-red-500/30 p-2 text-red-400 hover:bg-red-950/40"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
