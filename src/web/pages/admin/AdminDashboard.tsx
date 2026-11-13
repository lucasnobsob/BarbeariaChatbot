import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarCheck, Clock, Scissors, Users, TrendingUp, Calendar } from 'lucide-react';
import { apiFetch, formatDateTimeBR } from '@web/lib/api';

interface DashboardData {
  todayDate: string;
  todayAppointments: Array<{
    Id: string;
    StartAt: string;
    Status: string;
    CustomerName: string;
    CustomerPhone: string;
    ServiceName: string;
    ProfessionalName: string;
    ConfirmationCode: string;
  }>;
  upcomingAppointments: Array<{
    Id: string;
    StartAt: string;
    CustomerName: string;
    ServiceName: string;
    ProfessionalName: string;
  }>;
  totalCustomers: number;
  totalAppointments: number;
  topServices: Array<{ Id: string; Name: string; TotalBookings: number }>;
  availableSlotsToday: number;
}

export function AdminDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    apiFetch<DashboardData>('/api/admin/dashboard')
      .then(setData)
      .catch(() => {});
  }, []);

  if (!data) {
    return <div className="text-sm text-slate-400">Carregando indicadores...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-sm text-slate-400">Resumo operacional da sua barbearia ({data.todayDate})</p>
        </div>
        <Link
          to="/admin/appointments"
          className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400"
        >
          Gerenciar Agenda
        </Link>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Agendamentos Hoje', value: data.todayAppointments.length, icon: CalendarCheck },
          { label: 'Horários Livres Hoje', value: data.availableSlotsToday, icon: Clock },
          { label: 'Total de Clientes', value: data.totalCustomers, icon: Users },
          { label: 'Total de Atendimentos', value: data.totalAppointments, icon: TrendingUp }
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-medium">{kpi.label}</span>
              <kpi.icon className="h-4 w-4 text-amber-400" />
            </div>
            <p className="mt-2 text-3xl font-bold text-white">{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Today's schedule */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-white">
            <Calendar className="h-5 w-5 text-amber-400" /> Agendamentos de Hoje
          </h2>
          {data.todayAppointments.length === 0 ? (
            <p className="text-sm text-slate-400">Nenhum agendamento registrado para hoje.</p>
          ) : (
            <div className="space-y-3">
              {data.todayAppointments.map((a) => (
                <div
                  key={a.Id}
                  className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950 p-3.5 text-sm"
                >
                  <div>
                    <p className="font-semibold text-white">{a.CustomerName}</p>
                    <p className="text-xs text-slate-400">
                      {a.ServiceName} • {a.ProfessionalName}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-amber-400">
                      {new Date(a.StartAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                    <span className="text-[11px] uppercase text-slate-400">{a.Status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming + Top services */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="mb-4 text-lg font-semibold text-white">Próximos Agendamentos</h2>
            {data.upcomingAppointments.length === 0 ? (
              <p className="text-sm text-slate-400">Sem próximos agendamentos confirmados.</p>
            ) : (
              <div className="space-y-2.5">
                {data.upcomingAppointments.slice(0, 5).map((a) => (
                  <div key={a.Id} className="flex justify-between rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-xs">
                    <div>
                      <p className="font-semibold text-white">{a.CustomerName}</p>
                      <p className="text-slate-400">{a.ServiceName} ({a.ProfessionalName})</p>
                    </div>
                    <span className="text-amber-300">{formatDateTimeBR(a.StartAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-white">
              <Scissors className="h-4 w-4 text-amber-400" /> Serviços Mais Solicitados
            </h2>
            {data.topServices.length === 0 ? (
              <p className="text-sm text-slate-400">Cadastre serviços para acompanhar métricas.</p>
            ) : (
              <div className="space-y-2">
                {data.topServices.map((s) => (
                  <div key={s.Id} className="flex items-center justify-between text-sm">
                    <span className="text-slate-300">{s.Name}</span>
                    <span className="rounded-lg bg-slate-800 px-2.5 py-0.5 text-xs font-semibold text-amber-300">
                      {s.TotalBookings} reservas
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
