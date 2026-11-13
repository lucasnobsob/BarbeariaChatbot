import { useEffect, useState } from 'react';
import { Clock, ImagePlus, Pencil, Plus, Trash2, X } from 'lucide-react';
import type { ProfessionalItem, ServiceItem, WorkingHourItem } from '@shared/types';
import { apiFetch } from '@web/lib/api';
import { uploadOptimizedImage } from '@web/lib/imageOptimizer';

const DAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

export function AdminProfessionalsPage() {
  const [professionals, setProfessionals] = useState<ProfessionalItem[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    specialties: '',
    description: '',
    photoUrl: '',
    isActive: true,
    serviceIds: [] as string[]
  });
  const [hoursModalProf, setHoursModalProf] = useState<ProfessionalItem | null>(null);
  const [profHours, setProfHours] = useState<WorkingHourItem[]>([]);
  const [error, setError] = useState('');

  const load = async () => {
    const [pRes, sRes] = await Promise.all([
      apiFetch<{ professionals: ProfessionalItem[] }>('/api/admin/professionals'),
      apiFetch<{ services: ServiceItem[] }>('/api/admin/services')
    ]);
    setProfessionals(pRes.professionals);
    setServices(sRes.services);
  };

  useEffect(() => {
    void load();
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setForm({
      name: '',
      specialties: '',
      description: '',
      photoUrl: '',
      isActive: true,
      serviceIds: []
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      if (editingId) {
        await apiFetch(`/api/admin/professionals/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(form)
        });
      } else {
        await apiFetch('/api/admin/professionals', {
          method: 'POST',
          body: JSON.stringify(form)
        });
      }
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar profissional');
    }
  };

  const openHoursModal = async (prof: ProfessionalItem) => {
    setHoursModalProf(prof);
    const res = await apiFetch<{ hours: WorkingHourItem[] }>(
      `/api/admin/working-hours?professionalId=${encodeURIComponent(prof.id)}`
    );
    if (res.hours.length > 0) {
      setProfHours(res.hours);
    } else {
      const shopRes = await apiFetch<{ hours: WorkingHourItem[] }>('/api/admin/working-hours');
      setProfHours(
        shopRes.hours.length > 0
          ? shopRes.hours
          : DAYS.map((_, dayOfWeek) => ({
              dayOfWeek,
              startTime: '09:00',
              endTime: '19:00',
              breakStart: '12:00',
              breakEnd: '13:00',
              isAvailable: dayOfWeek >= 2
            }))
      );
    }
  };

  const saveProfHours = async () => {
    if (!hoursModalProf) return;
    await apiFetch('/api/admin/working-hours', {
      method: 'PUT',
      body: JSON.stringify({
        professionalId: hoursModalProf.id,
        hours: profHours.map((h) => ({
          dayOfWeek: h.dayOfWeek,
          startTime: h.startTime,
          endTime: h.endTime,
          breakStart: h.breakStart || null,
          breakEnd: h.breakEnd || null,
          isAvailable: h.isAvailable
        }))
      })
    });
    setHoursModalProf(null);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Profissionais</h1>

      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <form onSubmit={handleSave} className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-white">
          {editingId ? 'Editar Profissional' : 'Novo Profissional'}
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <input
            required
            placeholder="Nome completo"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
          />
          <input
            placeholder="Especialidades (ex: Degradê, Barboterapia)"
            value={form.specialties}
            onChange={(e) => setForm({ ...form, specialties: e.target.value })}
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
          />
        </div>
        <textarea
          rows={2}
          placeholder="Descrição / Biografia"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
        />

        <div>
          <p className="mb-2 text-xs font-medium text-slate-400">Serviços realizados por este profissional:</p>
          <div className="flex flex-wrap gap-2">
            {services.map((srv) => {
              const checked = form.serviceIds.includes(srv.id);
              return (
                <label
                  key={srv.id}
                  className={`cursor-pointer rounded-xl border px-3 py-1.5 text-xs ${
                    checked
                      ? 'border-amber-500 bg-amber-500/15 text-amber-300'
                      : 'border-slate-700 bg-slate-950 text-slate-400'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="mr-1.5"
                    checked={checked}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? [...form.serviceIds, srv.id]
                        : form.serviceIds.filter((id) => id !== srv.id);
                      setForm({ ...form, serviceIds: next });
                    }}
                  />
                  {srv.name}
                </label>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-xs">
              <ImagePlus className="h-4 w-4 text-amber-400" /> Foto do profissional
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const up = await uploadOptimizedImage(file, 'professionals', 700);
                  setForm({ ...form, photoUrl: up.url });
                }}
              />
            </label>
            {form.photoUrl && <img src={form.photoUrl} alt="Foto" className="h-10 w-10 rounded-full object-cover" />}
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              />
              Ativo
            </label>
          </div>
          <div className="flex gap-2">
            {editingId && (
              <button type="button" onClick={resetForm} className="rounded-xl border border-slate-700 px-4 py-2 text-sm">
                Cancelar
              </button>
            )}
            <button type="submit" className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-5 py-2 text-sm font-semibold text-slate-950">
              <Plus className="h-4 w-4" /> {editingId ? 'Salvar' : 'Cadastrar Profissional'}
            </button>
          </div>
        </div>
      </form>

      {/* Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        {professionals.map((p) => (
          <div key={p.id} className="flex flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="flex items-start gap-4">
              {p.photoUrl ? (
                <img src={p.photoUrl} alt={p.name} className="h-14 w-14 rounded-full object-cover" />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/20 font-bold text-amber-300">
                  {p.name.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="flex-1">
                <h3 className="font-semibold text-white">{p.name}</h3>
                {p.specialties && <p className="text-xs text-amber-400">{p.specialties}</p>}
                {p.description && <p className="mt-1.5 text-sm text-slate-400">{p.description}</p>}
                <p className="mt-2 text-xs text-slate-500">
                  {(p.serviceIds || []).length} serviço(s) vinculado(s) • {p.isActive ? 'Ativo' : 'Inativo'}
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-slate-800 pt-3">
              <button
                type="button"
                onClick={() => void openHoursModal(p)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
              >
                <Clock className="h-3.5 w-3.5 text-amber-400" /> Horários / Folgas
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingId(p.id);
                  setForm({
                    name: p.name,
                    specialties: p.specialties,
                    description: p.description,
                    photoUrl: p.photoUrl,
                    isActive: p.isActive,
                    serviceIds: p.serviceIds || []
                  });
                }}
                className="rounded-lg border border-slate-700 p-2 text-slate-300 hover:text-white"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={async () => {
                  await apiFetch(`/api/admin/professionals/${p.id}`, { method: 'DELETE' });
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

      {/* Individual Working Hours Modal */}
      {hoursModalProf && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">
                Horários de {hoursModalProf.name}
              </h3>
              <button type="button" onClick={() => setHoursModalProf(null)}>
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>
            <div className="max-h-[60vh] space-y-2 overflow-y-auto">
              {profHours.map((h, idx) => (
                <div key={h.dayOfWeek} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs">
                  <label className="flex w-28 items-center gap-2 font-medium">
                    <input
                      type="checkbox"
                      checked={h.isAvailable}
                      onChange={(e) => {
                        const next = [...profHours];
                        next[idx] = { ...h, isAvailable: e.target.checked };
                        setProfHours(next);
                      }}
                    />
                    {DAYS[h.dayOfWeek]}
                  </label>
                  {h.isAvailable ? (
                    <>
                      <input type="time" value={h.startTime} onChange={(e) => { const n = [...profHours]; n[idx] = { ...h, startTime: e.target.value }; setProfHours(n); }} className="rounded border border-slate-700 bg-slate-900 px-2 py-1" />
                      <span>às</span>
                      <input type="time" value={h.endTime} onChange={(e) => { const n = [...profHours]; n[idx] = { ...h, endTime: e.target.value }; setProfHours(n); }} className="rounded border border-slate-700 bg-slate-900 px-2 py-1" />
                      <span className="text-slate-400">Pausa:</span>
                      <input type="time" value={h.breakStart || ''} onChange={(e) => { const n = [...profHours]; n[idx] = { ...h, breakStart: e.target.value || null }; setProfHours(n); }} className="rounded border border-slate-700 bg-slate-900 px-2 py-1" />
                      <input type="time" value={h.breakEnd || ''} onChange={(e) => { const n = [...profHours]; n[idx] = { ...h, breakEnd: e.target.value || null }; setProfHours(n); }} className="rounded border border-slate-700 bg-slate-900 px-2 py-1" />
                    </>
                  ) : (
                    <span className="text-slate-500">Folga / Indisponível</span>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setHoursModalProf(null)} className="rounded-xl border border-slate-700 px-4 py-2 text-sm">
                Cancelar
              </button>
              <button type="button" onClick={() => void saveProfHours()} className="rounded-xl bg-amber-500 px-5 py-2 text-sm font-semibold text-slate-950">
                Salvar Horários
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
