import { useEffect, useState } from 'react';
import { Search, Users, X } from 'lucide-react';
import { apiFetch, formatBRL, formatDateTimeBR } from '@web/lib/api';

interface CustomerRow {
  Id: string;
  Name: string;
  Phone: string;
  Email: string;
  AppointmentCount: number;
  LastAppointmentAt: string | null;
}

export function AdminCustomersPage() {
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<{
    customer: CustomerRow;
    appointments: Array<{
      Id: string;
      StartAt: string;
      Status: string;
      PriceInCents: number;
      ServiceName: string;
      ProfessionalName: string;
    }>;
  } | null>(null);

  const load = async (query = '') => {
    const res = await apiFetch<{ customers: CustomerRow[] }>(
      `/api/admin/customers${query ? `?q=${encodeURIComponent(query)}` : ''}`
    );
    setCustomers(res.customers);
  };

  useEffect(() => {
    void load();
  }, []);

  const openHistory = async (id: string) => {
    const res = await apiFetch<typeof selected>(`/api/admin/customers/${id}`);
    setSelected(res);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Clientes</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void load(q);
        }}
        className="flex gap-2"
      >
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nome, telefone ou e-mail..."
            className="w-full rounded-xl border border-slate-700 bg-slate-900 py-2 pl-10 pr-4 text-sm text-white"
          />
        </div>
        <button type="submit" className="rounded-xl bg-amber-500 px-5 py-2 text-sm font-semibold text-slate-950">
          Buscar
        </button>
      </form>

      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
        {customers.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">
            <Users className="mx-auto mb-2 h-8 w-8 text-slate-600" />
            Nenhum cliente encontrado.
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-800 bg-slate-950 text-xs uppercase text-slate-400">
              <tr>
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">Telefone</th>
                <th className="px-4 py-3 hidden sm:table-cell">Atendimentos</th>
                <th className="px-4 py-3 hidden md:table-cell">Último Atendimento</th>
                <th className="px-4 py-3 text-right">Histórico</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {customers.map((c) => (
                <tr key={c.Id} className="hover:bg-slate-800/40">
                  <td className="px-4 py-3 font-medium text-white">{c.Name}</td>
                  <td className="px-4 py-3 text-slate-300">{c.Phone}</td>
                  <td className="px-4 py-3 hidden sm:table-cell text-slate-300">{c.AppointmentCount}</td>
                  <td className="px-4 py-3 hidden md:table-cell text-slate-400">
                    {c.LastAppointmentAt ? formatDateTimeBR(c.LastAppointmentAt) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => void openHistory(c.Id)}
                      className="rounded-lg border border-slate-700 px-3 py-1 text-xs font-medium text-amber-300 hover:bg-slate-800"
                    >
                      Ver Histórico
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-white">{selected.customer.Name}</h3>
                <p className="text-xs text-slate-400">{selected.customer.Phone}</p>
              </div>
              <button type="button" onClick={() => setSelected(null)}>
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>
            <div className="max-h-80 space-y-2 overflow-y-auto">
              {selected.appointments.map((a) => (
                <div key={a.Id} className="flex justify-between rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs">
                  <div>
                    <p className="font-semibold text-white">{a.ServiceName}</p>
                    <p className="text-slate-400">{a.ProfessionalName} • {formatBRL(a.PriceInCents)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-amber-300">{formatDateTimeBR(a.StartAt)}</p>
                    <span className="uppercase text-slate-400">{a.Status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
