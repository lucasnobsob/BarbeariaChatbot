import { useCallback, useEffect, useMemo, useState } from 'react';
import { Ban, Calendar, Plus, Trash2 } from 'lucide-react';
import type { BlockedSlotItem, ProfessionalItem, ServiceItem } from '@shared/types';
import { apiFetch, formatBRL, formatDateTimeBR } from '@web/lib/api';

interface ApptRow {
  Id: string;
  ServiceId: string;
  ProfessionalId: string;
  StartAt: string;
  EndAt: string;
  Status: 'confirmed' | 'cancelled' | 'completed' | 'no_show';
  PriceInCents: number;
  ConfirmationCode: string;
  Source: string;
  CustomerName: string;
  CustomerPhone: string;
  ServiceName: string;
  ProfessionalName: string;
}

type ViewMode = 'day' | 'week' | 'month';

export function AdminAppointmentsPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [anchorDate, setAnchorDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [filterProf, setFilterProf] = useState('');
  const [filterService, setFilterService] = useState('');

  const [appointments, setAppointments] = useState<ApptRow[]>([]);
  const [blockedSlots, setBlockedSlots] = useState<BlockedSlotItem[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [professionals, setProfessionals] = useState<ProfessionalItem[]>([]);

  // Manual creation
  const [showNewModal, setShowNewModal] = useState(false);
  const [newForm, setNewForm] = useState({
    serviceId: '',
    professionalId: '',
    date: new Date().toISOString().slice(0, 10),
    time: '10:00',
    customerName: '',
    customerPhone: '',
    notes: ''
  });

  // Block slot creation
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [blockForm, setBlockForm] = useState({
    professionalId: '',
    date: new Date().toISOString().slice(0, 10),
    startTime: '12:00',
    endTime: '14:00',
    reason: 'Almoço / Evento'
  });

  // Reschedule modal
  const [rescheduleAppt, setRescheduleAppt] = useState<ApptRow | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [rescheduleTime, setRescheduleTime] = useState('14:00');
  const [error, setError] = useState('');

  const dateRange = useMemo(() => {
    const base = new Date(`${anchorDate}T00:00:00.000Z`);
    if (viewMode === 'day') {
      const end = new Date(base.getTime() + 86_400_000);
      return { from: base.toISOString(), to: end.toISOString() };
    }
    if (viewMode === 'week') {
      const start = new Date(base.getTime() - base.getUTCDay() * 86_400_000);
      const end = new Date(start.getTime() + 7 * 86_400_000);
      return { from: start.toISOString(), to: end.toISOString() };
    }
    const start = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), 1));
    const end = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 1));
    return { from: start.toISOString(), to: end.toISOString() };
  }, [anchorDate, viewMode]);

  const loadData = useCallback(async () => {
    const params = new URLSearchParams({
      from: dateRange.from,
      to: dateRange.to
    });
    if (filterProf) params.set('professionalId', filterProf);
    if (filterService) params.set('serviceId', filterService);

    const [aRes, bRes, sRes, pRes] = await Promise.all([
      apiFetch<{ appointments: ApptRow[] }>(`/api/admin/appointments?${params.toString()}`),
      apiFetch<{ blockedSlots: BlockedSlotItem[] }>('/api/admin/blocked-slots'),
      apiFetch<{ services: ServiceItem[] }>('/api/admin/services'),
      apiFetch<{ professionals: ProfessionalItem[] }>('/api/admin/professionals')
    ]);
    setAppointments(aRes.appointments);
    setBlockedSlots(bRes.blockedSlots);
    setServices(sRes.services);
    setProfessionals(pRes.professionals);
  }, [dateRange, filterProf, filterService]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleCreateManual = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      // Convert local YYYY-MM-DD + HH:MM (UTC-3 default or browser local) -> ISO
      const localDt = new Date(`${newForm.date}T${newForm.time}:00`);
      await apiFetch('/api/admin/appointments', {
        method: 'POST',
        body: JSON.stringify({
          serviceId: newForm.serviceId,
          professionalId: newForm.professionalId,
          startAt: localDt.toISOString(),
          customerName: newForm.customerName,
          customerPhone: newForm.customerPhone,
          notes: newForm.notes
        })
      });
      setShowNewModal(false);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar agendamento');
    }
  };

  const handleCreateBlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const startIso = new Date(`${blockForm.date}T${blockForm.startTime}:00`).toISOString();
      const endIso = new Date(`${blockForm.date}T${blockForm.endTime}:00`).toISOString();
      await apiFetch('/api/admin/blocked-slots', {
        method: 'POST',
        body: JSON.stringify({
          professionalId: blockForm.professionalId || null,
          startAt: startIso,
          endAt: endIso,
          reason: blockForm.reason
        })
      });
      setShowBlockModal(false);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao bloquear horário');
    }
  };

  const handleStatusChange = async (id: string, status: string) => {
    await apiFetch(`/api/admin/appointments/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });
    await loadData();
  };

  const handleReschedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rescheduleAppt) return;
    setError('');
    try {
      const startIso = new Date(`${rescheduleDate}T${rescheduleTime}:00`).toISOString();
      await apiFetch(`/api/admin/appointments/${rescheduleAppt.Id}/reschedule`, {
        method: 'POST',
        body: JSON.stringify({ startAt: startIso })
      });
      setRescheduleAppt(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao reagendar');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Agenda</h1>
          <p className="text-sm text-slate-400">Visualização diária, semanal e mensal com bloqueios</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowBlockModal(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            <Ban className="h-4 w-4 text-red-400" /> Bloquear Horário
          </button>
          <button
            type="button"
            onClick={() => setShowNewModal(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400"
          >
            <Plus className="h-4 w-4" /> Novo Agendamento
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {/* Filters & Calendar Controls */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <div className="flex rounded-xl border border-slate-700 bg-slate-950 p-1 text-xs">
          {(['day', 'week', 'month'] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              className={`rounded-lg px-3 py-1.5 font-semibold ${
                viewMode === mode ? 'bg-amber-500 text-slate-950' : 'text-slate-300'
              }`}
            >
              {mode === 'day' ? 'Diária' : mode === 'week' ? 'Semanal' : 'Mensal'}
            </button>
          ))}
        </div>

        <input
          type="date"
          value={anchorDate}
          onChange={(e) => setAnchorDate(e.target.value)}
          className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
        />

        <select
          value={filterProf}
          onChange={(e) => setFilterProf(e.target.value)}
          className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
        >
          <option value="">Todos os profissionais</option>
          {professionals.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        <select
          value={filterService}
          onChange={(e) => setFilterService(e.target.value)}
          className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
        >
          <option value="">Todos os serviços</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {/* Appointments List */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-white">
          <Calendar className="h-4 w-4 text-amber-400" /> Reservas no Período ({appointments.length})
        </h2>
        {appointments.length === 0 ? (
          <p className="text-sm text-slate-400">Nenhum agendamento encontrado para este filtro/período.</p>
        ) : (
          <div className="space-y-3">
            {appointments.map((a) => (
              <div
                key={a.Id}
                className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-800 bg-slate-950 p-4 text-sm"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white">{a.CustomerName}</span>
                    <span className="font-mono text-xs text-amber-400">{a.ConfirmationCode}</span>
                    <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] uppercase text-slate-300">
                      {a.Source}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    {a.ServiceName} ({formatBRL(a.PriceInCents)}) • Profissional: {a.ProfessionalName} • Tel: {a.CustomerPhone}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="mr-2 font-medium text-amber-300">{formatDateTimeBR(a.StartAt)}</span>
                  <select
                    value={a.Status}
                    onChange={(e) => void handleStatusChange(a.Id, e.target.value)}
                    className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs"
                  >
                    <option value="confirmed">Confirmado</option>
                    <option value="completed">Concluído</option>
                    <option value="cancelled">Cancelado</option>
                    <option value="no_show">Não compareceu</option>
                  </select>
                  {a.Status === 'confirmed' && (
                    <button
                      type="button"
                      onClick={() => setRescheduleAppt(a)}
                      className="rounded-lg border border-slate-700 px-2.5 py-1 text-xs text-slate-200 hover:bg-slate-800"
                    >
                      Reagendar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Blocked Slots */}
      {blockedSlots.length > 0 && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="mb-3 text-base font-semibold text-white">Bloqueios de Horário</h2>
          <div className="space-y-2">
            {blockedSlots.map((b: any) => (
              <div key={b.Id} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-xs">
                <div>
                  <span className="font-semibold text-white">{b.ProfessionalName || 'Toda a barbearia'}</span>
                  <span className="mx-2 text-slate-500">•</span>
                  <span className="text-slate-300">
                    {formatDateTimeBR(b.StartAt)} até {formatDateTimeBR(b.EndAt)}
                  </span>
                  {b.Reason && <span className="ml-2 text-slate-400">({b.Reason})</span>}
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    await apiFetch(`/api/admin/blocked-slots/${b.Id}`, { method: 'DELETE' });
                    await loadData();
                  }}
                  className="text-red-400 hover:text-red-300"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Manual Booking Modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <form onSubmit={handleCreateManual} className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-4">
            <h3 className="text-lg font-bold text-white">Novo Agendamento Manual</h3>
            <select required value={newForm.serviceId} onChange={(e) => setNewForm({ ...newForm, serviceId: e.target.value })} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm">
              <option value="">Selecione o serviço</option>
              {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select required value={newForm.professionalId} onChange={(e) => setNewForm({ ...newForm, professionalId: e.target.value })} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm">
              <option value="">Selecione o profissional</option>
              {professionals.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <input type="date" required value={newForm.date} onChange={(e) => setNewForm({ ...newForm, date: e.target.value })} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
              <input type="time" required value={newForm.time} onChange={(e) => setNewForm({ ...newForm, time: e.target.value })} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
            </div>
            <input required placeholder="Nome do cliente" value={newForm.customerName} onChange={(e) => setNewForm({ ...newForm, customerName: e.target.value })} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
            <input required placeholder="Telefone do cliente" value={newForm.customerPhone} onChange={(e) => setNewForm({ ...newForm, customerPhone: e.target.value })} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowNewModal(false)} className="rounded-xl border border-slate-700 px-4 py-2 text-sm">Cancelar</button>
              <button type="submit" className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950">Salvar</button>
            </div>
          </form>
        </div>
      )}

      {/* Block Modal */}
      {showBlockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <form onSubmit={handleCreateBlock} className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-4">
            <h3 className="text-lg font-bold text-white">Bloquear Horário</h3>
            <select value={blockForm.professionalId} onChange={(e) => setBlockForm({ ...blockForm, professionalId: e.target.value })} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm">
              <option value="">Toda a barbearia</option>
              {professionals.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <input type="date" required value={blockForm.date} onChange={(e) => setBlockForm({ ...blockForm, date: e.target.value })} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
            <div className="grid grid-cols-2 gap-2">
              <input type="time" required value={blockForm.startTime} onChange={(e) => setBlockForm({ ...blockForm, startTime: e.target.value })} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
              <input type="time" required value={blockForm.endTime} onChange={(e) => setBlockForm({ ...blockForm, endTime: e.target.value })} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
            </div>
            <input placeholder="Motivo" value={blockForm.reason} onChange={(e) => setBlockForm({ ...blockForm, reason: e.target.value })} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowBlockModal(false)} className="rounded-xl border border-slate-700 px-4 py-2 text-sm">Cancelar</button>
              <button type="submit" className="rounded-xl bg-red-500 px-4 py-2 text-sm font-semibold text-white">Bloquear</button>
            </div>
          </form>
        </div>
      )}

      {/* Reschedule Modal */}
      {rescheduleAppt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <form onSubmit={handleReschedule} className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-4">
            <h3 className="text-lg font-bold text-white">Reagendar {rescheduleAppt.CustomerName}</h3>
            <input type="date" required value={rescheduleDate} onChange={(e) => setRescheduleDate(e.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
            <input type="time" required value={rescheduleTime} onChange={(e) => setRescheduleTime(e.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setRescheduleAppt(null)} className="rounded-xl border border-slate-700 px-4 py-2 text-sm">Cancelar</button>
              <button type="submit" className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950">Confirmar</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
