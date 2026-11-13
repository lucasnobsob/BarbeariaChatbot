import { useEffect, useState } from 'react';
import { Clock, Save, Shield, Sliders } from 'lucide-react';
import type { WorkingHourItem } from '@shared/types';
import { apiFetch } from '@web/lib/api';

const DAYS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

export function AdminSettingsPage() {
  const [hours, setHours] = useState<WorkingHourItem[]>([]);
  const [settings, setSettings] = useState({
    slotIntervalMinutes: 30,
    minAdvanceMinutes: 30,
    maxAdvanceDays: 30,
    allowPublicCancellation: true,
    timezoneOffsetMinutes: -180
  });
  const [team, setTeam] = useState<Array<{ Id: string; Name: string; Email: string; Role: string }>>([]);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    Promise.all([
      apiFetch<{ hours: WorkingHourItem[] }>('/api/admin/working-hours'),
      apiFetch<{ settings: typeof settings }>('/api/admin/settings'),
      apiFetch<{ members: typeof team }>('/api/admin/team')
    ])
      .then(([hRes, sRes, tRes]) => {
        setHours(hRes.hours);
        setSettings(sRes.settings);
        setTeam(tRes.members);
      })
      .catch(() => {});
  }, []);

  const saveAll = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg('');
    await Promise.all([
      apiFetch('/api/admin/working-hours', {
        method: 'PUT',
        body: JSON.stringify({
          professionalId: null,
          hours: hours.map((h) => ({
            dayOfWeek: h.dayOfWeek,
            startTime: h.startTime,
            endTime: h.endTime,
            breakStart: h.breakStart || null,
            breakEnd: h.breakEnd || null,
            isAvailable: h.isAvailable
          }))
        })
      }),
      apiFetch('/api/admin/settings', {
        method: 'PUT',
        body: JSON.stringify(settings)
      })
    ]);
    setMsg('Configurações salvas com sucesso!');
  };

  return (
    <form onSubmit={saveAll} className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-white">Configurações da Barbearia</h1>
        <button type="submit" className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-2 text-sm font-semibold text-slate-950">
          <Save className="h-4 w-4" /> Salvar Tudo
        </button>
      </div>

      {msg && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-200">
          {msg}
        </div>
      )}

      {/* Working hours */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
          <Clock className="h-5 w-5 text-amber-400" /> Horários Gerais de Funcionamento
        </h2>
        {hours.map((h, idx) => (
          <div key={h.dayOfWeek} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm">
            <label className="flex w-36 items-center gap-2 font-medium">
              <input
                type="checkbox"
                checked={h.isAvailable}
                onChange={(e) => {
                  const n = [...hours];
                  n[idx] = { ...h, isAvailable: e.target.checked };
                  setHours(n);
                }}
              />
              {DAYS[h.dayOfWeek]}
            </label>
            {h.isAvailable ? (
              <>
                <input type="time" value={h.startTime} onChange={(e) => { const n = [...hours]; n[idx] = { ...h, startTime: e.target.value }; setHours(n); }} className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1" />
                <span>às</span>
                <input type="time" value={h.endTime} onChange={(e) => { const n = [...hours]; n[idx] = { ...h, endTime: e.target.value }; setHours(n); }} className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1" />
                <span className="text-xs text-slate-400">Intervalo:</span>
                <input type="time" value={h.breakStart || ''} onChange={(e) => { const n = [...hours]; n[idx] = { ...h, breakStart: e.target.value || null }; setHours(n); }} className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs" />
                <input type="time" value={h.breakEnd || ''} onChange={(e) => { const n = [...hours]; n[idx] = { ...h, breakEnd: e.target.value || null }; setHours(n); }} className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs" />
              </>
            ) : (
              <span className="text-slate-500">Fechado</span>
            )}
          </div>
        ))}
      </div>

      {/* Booking Rules */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
          <Sliders className="h-5 w-5 text-amber-400" /> Regras de Agendamento
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs text-slate-400">Intervalo dos horários (minutos)</label>
            <input
              type="number"
              min={5}
              max={120}
              value={settings.slotIntervalMinutes}
              onChange={(e) => setSettings({ ...settings, slotIntervalMinutes: Number(e.target.value) })}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Antecedência mínima (minutos)</label>
            <input
              type="number"
              min={0}
              value={settings.minAdvanceMinutes}
              onChange={(e) => setSettings({ ...settings, minAdvanceMinutes: Number(e.target.value) })}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Máximo de dias futuros</label>
            <input
              type="number"
              min={1}
              max={180}
              value={settings.maxAdvanceDays}
              onChange={(e) => setSettings({ ...settings, maxAdvanceDays: Number(e.target.value) })}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={settings.allowPublicCancellation}
            onChange={(e) => setSettings({ ...settings, allowPublicCancellation: e.target.checked })}
          />
          Permitir que clientes cancelem agendamentos pelo site usando o código de confirmação
        </label>
      </div>

      {/* Team Roles Architecture */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
          <Shield className="h-5 w-5 text-amber-400" /> Usuários e Permissões (Arquitetura RBAC)
        </h2>
        <p className="text-xs text-slate-400">
          Estrutura preparada para papéis de Proprietário, Administrador, Gerente, Recepcionista e Profissional.
        </p>
        <div className="space-y-2">
          {team.map((m) => (
            <div key={m.Id} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-sm">
              <div>
                <p className="font-medium text-white">{m.Name}</p>
                <p className="text-xs text-slate-400">{m.Email}</p>
              </div>
              <span className="rounded-full bg-amber-500/15 px-3 py-1 text-xs font-semibold uppercase text-amber-300">
                {m.Role}
              </span>
            </div>
          ))}
        </div>
      </div>
    </form>
  );
}
