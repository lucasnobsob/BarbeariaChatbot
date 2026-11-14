import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Activity,
  Building2,
  Check,
  CreditCard,
  FileText,
  LogOut,
  Settings,
  Shield,
  Users,
  X
} from 'lucide-react';
import { apiFetch, formatBRL, formatDateTimeBR } from '@web/lib/api';
import { useAuth } from '@web/lib/authContext';

export function SuperAdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <aside className="flex w-64 flex-col border-r border-slate-800 bg-slate-900">
        <div className="flex items-center gap-2.5 border-b border-slate-800 px-5 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-500 text-white">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <span className="block text-sm font-bold text-white">Superadmin SaaS</span>
            <span className="block text-[11px] text-slate-400">Gestão da Plataforma</span>
          </div>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {[
            { to: '/superadmin', label: 'Visão Geral', icon: Activity, end: true },
            { to: '/superadmin/tenants', label: 'Barbearias', icon: Building2 },
            { to: '/superadmin/billing', label: 'Assinaturas & Pix', icon: CreditCard },
            { to: '/superadmin/users', label: 'Usuários', icon: Users },
            { to: '/superadmin/settings', label: 'Limites & Pix', icon: Settings },
            { to: '/superadmin/logs', label: 'Logs do Sistema', icon: FileText }
          ].map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium ${
                  isActive ? 'bg-purple-500 text-white' : 'text-slate-300 hover:bg-slate-800'
                }`
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-800 p-4 space-y-2">
          <Link to="/" className="block text-center text-xs text-slate-400 hover:text-white">
            Ir para Home Pública
          </Link>
          <button
            type="button"
            onClick={async () => {
              await logout();
              navigate('/login');
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs text-slate-400 hover:bg-slate-800"
          >
            <LogOut className="h-3.5 w-3.5" /> Sair ({user?.name})
          </button>
        </div>
      </aside>
      <main className="flex-1 p-6 md:p-8">
        <Outlet />
      </main>
    </div>
  );
}

export function SuperAdminOverviewPage() {
  const [stats, setStats] = useState<{
    totalTenants: number;
    activeTenants: number;
    totalUsers: number;
    totalAppointments: number;
    totalErrors: number;
    billing?: {
      trialing: number;
      active: number;
      pastDue: number;
      suspended: number;
      exempt: number;
      awaitingConfirmation: number;
      mrrCents: number;
    };
  } | null>(null);

  useEffect(() => {
    apiFetch<{ stats: typeof stats }>('/api/superadmin/overview')
      .then((res) => setStats(res.stats))
      .catch(() => {});
  }, []);

  if (!stats) return <div className="text-sm text-slate-400">Carregando...</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Visão Geral da Plataforma</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { label: 'Total Barbearias', val: stats.totalTenants },
          { label: 'Barbearias Ativas', val: stats.activeTenants },
          { label: 'Usuários Cadastrados', val: stats.totalUsers },
          { label: 'Agendamentos Totais', val: stats.totalAppointments },
          { label: 'Erros Registrados', val: stats.totalErrors }
        ].map((k) => (
          <div key={k.label} className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <span className="text-xs text-slate-400">{k.label}</span>
            <p className="mt-2 text-3xl font-bold text-white">{k.val}</p>
          </div>
        ))}
      </div>

      {stats.billing && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Receita Mensal Ativa (MRR)', val: formatBRL(stats.billing.mrrCents) },
            { label: 'Pix Aguardando Confirmação', val: stats.billing.awaitingConfirmation },
            {
              label: 'Em Trial / Carência',
              val: `${stats.billing.trialing} / ${stats.billing.pastDue}`
            },
            {
              label: 'Suspensas / Isentas',
              val: `${stats.billing.suspended} / ${stats.billing.exempt}`
            }
          ].map((k) => (
            <div key={k.label} className="rounded-2xl border border-purple-500/20 bg-slate-900 p-5">
              <span className="text-xs text-slate-400">{k.label}</span>
              <p className="mt-2 text-2xl font-bold text-purple-200">{k.val}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const SUB_BADGE: Record<string, { label: string; cls: string }> = {
  trialing: { label: 'Trial 30d', cls: 'bg-sky-500/20 text-sky-300' },
  active: { label: 'Pago (Ativo)', cls: 'bg-emerald-500/20 text-emerald-300' },
  past_due: { label: 'Em Carência', cls: 'bg-amber-500/20 text-amber-300' },
  suspended: { label: 'Suspensa', cls: 'bg-red-500/20 text-red-300' },
  canceled: { label: 'Cancelada', cls: 'bg-slate-600/20 text-slate-300' },
  exempt: { label: 'Isenta', cls: 'bg-purple-500/20 text-purple-300' }
};

export function SuperAdminTenantsPage() {
  const [tenants, setTenants] = useState<any[]>([]);

  const load = async () => {
    const res = await apiFetch<{ tenants: any[] }>('/api/superadmin/tenants');
    setTenants(res.tenants);
  };

  useEffect(() => {
    void load();
  }, []);

  const changeStatus = async (id: string, status: string) => {
    await apiFetch(`/api/superadmin/tenants/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });
    await load();
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Estabelecimentos Cadastrados</h1>
      <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-800 bg-slate-950 text-xs uppercase text-slate-400">
            <tr>
              <th className="px-4 py-3">Barbearia</th>
              <th className="px-4 py-3">Slug</th>
              <th className="px-4 py-3">Assinatura</th>
              <th className="px-4 py-3">Usuários</th>
              <th className="px-4 py-3">Agendamentos</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {tenants.map((t) => {
              const subBadge = SUB_BADGE[t.SubscriptionStatus || 'trialing'] || SUB_BADGE.trialing;
              return (
                <tr key={t.Id}>
                  <td className="px-4 py-3 font-medium text-white">{t.BusinessName || t.Name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-amber-300">
                    <Link to={`/b/${t.Slug}`} target="_blank">/b/{t.Slug}</Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${subBadge.cls}`}>
                      {subBadge.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">{t.UserCount}</td>
                  <td className="px-4 py-3">{t.AppointmentCount}</td>
                  <td className="px-4 py-3">
                    <select
                      value={t.Status}
                      onChange={(e) => void changeStatus(t.Id, e.target.value)}
                      className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs"
                    >
                      <option value="active">Ativo</option>
                      <option value="inactive">Desativado</option>
                      <option value="blocked">Bloqueado</option>
                      <option value="onboarding">Onboarding</option>
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function SuperAdminBillingPage() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [tenants, setTenants] = useState<any[]>([]);
  const [msg, setMsg] = useState('');

  const load = async () => {
    const [invRes, tenRes] = await Promise.all([
      apiFetch<{ invoices: any[] }>('/api/superadmin/billing/invoices'),
      apiFetch<{ tenants: any[] }>('/api/superadmin/tenants')
    ]);
    setInvoices(invRes.invoices);
    setTenants(tenRes.tenants);
  };

  useEffect(() => {
    void load();
  }, []);

  const confirmInvoice = async (id: string) => {
    await apiFetch(`/api/superadmin/billing/invoices/${id}/confirm`, { method: 'POST' });
    setMsg('Pagamento Pix confirmado! Assinatura liberada por 30 dias.');
    await load();
  };

  const rejectInvoice = async (id: string) => {
    await apiFetch(`/api/superadmin/billing/invoices/${id}/reject`, { method: 'POST' });
    setMsg('Notificação recusada. Fatura retornou para aguardando pagamento.');
    await load();
  };

  const toggleExempt = async (tenantId: string, currentlyExempt: boolean) => {
    await apiFetch(`/api/superadmin/billing/tenants/${tenantId}/exempt`, {
      method: 'POST',
      body: JSON.stringify({ exempt: !currentlyExempt })
    });
    setMsg(!currentlyExempt ? 'Barbearia marcada como isenta.' : 'Isenção removida.');
    await load();
  };

  const manualActivate = async (tenantId: string) => {
    await apiFetch(`/api/superadmin/billing/tenants/${tenantId}/manual-activate`, {
      method: 'POST',
      body: JSON.stringify({ days: 30 })
    });
    setMsg('Assinatura liberada manualmente por +30 dias.');
    await load();
  };

  const extendTrial = async (tenantId: string) => {
    await apiFetch(`/api/superadmin/billing/tenants/${tenantId}/extend-trial`, {
      method: 'POST',
      body: JSON.stringify({ days: 7 })
    });
    setMsg('Trial estendido em +7 dias.');
    await load();
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Assinaturas e Confirmação Pix</h1>
        <p className="mt-1 text-sm text-slate-400">
          Confira os pagamentos recebidos no Nubank e libere o acesso em 1 clique, ou conceda isenção/extensão de prazo.
        </p>
      </div>

      {msg && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-200">
          {msg}
        </div>
      )}

      {/* Faturas Pix */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="mb-4 text-lg font-bold text-white">Faturas Pix</h2>
        {invoices.length === 0 ? (
          <p className="text-sm text-slate-400">Nenhuma fatura gerada até o momento.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 uppercase text-slate-400">
                <tr>
                  <th className="py-2.5 pr-4">Barbearia</th>
                  <th className="py-2.5 pr-4">Valor</th>
                  <th className="py-2.5 pr-4">Status</th>
                  <th className="py-2.5 pr-4">Observação do Pagador</th>
                  <th className="py-2.5 pr-4">Data</th>
                  <th className="py-2.5">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {invoices.map((inv) => (
                  <tr key={inv.Id}>
                    <td className="py-3 pr-4 font-semibold text-white">
                      {inv.BusinessName || inv.TenantName}
                      <span className="block font-mono text-[11px] font-normal text-slate-400">
                        /b/{inv.TenantSlug}
                      </span>
                    </td>
                    <td className="py-3 pr-4 font-semibold text-amber-300">
                      {formatBRL(inv.AmountInCents)}
                    </td>
                    <td className="py-3 pr-4">
                      <span
                        className={`rounded-full px-2.5 py-0.5 font-semibold ${
                          inv.Status === 'paid'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : inv.Status === 'awaiting_confirmation'
                              ? 'bg-sky-500/20 text-sky-300'
                              : 'bg-amber-500/20 text-amber-300'
                        }`}
                      >
                        {inv.Status === 'awaiting_confirmation'
                          ? 'Informado pelo dono'
                          : inv.Status === 'paid'
                            ? 'Pago'
                            : 'Aguardando Pix'}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-slate-300">{inv.PayerNote || '—'}</td>
                    <td className="py-3 pr-4 text-slate-400">
                      {formatDateTimeBR(inv.PaymentNotifiedAt || inv.CreatedAt)}
                    </td>
                    <td className="py-3">
                      {inv.Status !== 'paid' && (
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void confirmInvoice(inv.Id)}
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-2.5 py-1 font-bold text-slate-950 hover:bg-emerald-400"
                          >
                            <Check className="h-3.5 w-3.5" /> Confirmar (+30d)
                          </button>
                          {inv.Status === 'awaiting_confirmation' && (
                            <button
                              type="button"
                              onClick={() => void rejectInvoice(inv.Id)}
                              className="inline-flex items-center gap-1 rounded-lg border border-red-500/40 px-2.5 py-1 text-red-300 hover:bg-red-950/40"
                            >
                              <X className="h-3.5 w-3.5" /> Recusar
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Controle por Barbearia */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="mb-4 text-lg font-bold text-white">Assinatura por Estabelecimento</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-800 uppercase text-slate-400">
              <tr>
                <th className="py-2.5 pr-4">Barbearia</th>
                <th className="py-2.5 pr-4">Status Assinatura</th>
                <th className="py-2.5 pr-4">Fim Trial / Ciclo</th>
                <th className="py-2.5">Ações Rápidas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {tenants.map((t) => {
                const subStatus = t.SubscriptionStatus || 'trialing';
                const badge = SUB_BADGE[subStatus] || SUB_BADGE.trialing;
                const isExempt = subStatus === 'exempt';
                return (
                  <tr key={t.Id}>
                    <td className="py-3 pr-4 font-semibold text-white">
                      {t.BusinessName || t.Name}
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`rounded-full px-2.5 py-0.5 font-semibold ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-slate-300">
                      {isExempt
                        ? 'Sem vencimento'
                        : t.CurrentPeriodEnd
                          ? formatDateTimeBR(t.CurrentPeriodEnd)
                          : t.TrialEndsAt
                            ? formatDateTimeBR(t.TrialEndsAt)
                            : '—'}
                    </td>
                    <td className="py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void manualActivate(t.Id)}
                          className="rounded-lg bg-emerald-500/20 px-2.5 py-1 font-semibold text-emerald-300 hover:bg-emerald-500/30"
                        >
                          Liberar +30 dias
                        </button>
                        <button
                          type="button"
                          onClick={() => void extendTrial(t.Id)}
                          className="rounded-lg bg-sky-500/20 px-2.5 py-1 font-semibold text-sky-300 hover:bg-sky-500/30"
                        >
                          +7 dias trial
                        </button>
                        <button
                          type="button"
                          onClick={() => void toggleExempt(t.Id, isExempt)}
                          className="rounded-lg bg-purple-500/20 px-2.5 py-1 font-semibold text-purple-300 hover:bg-purple-500/30"
                        >
                          {isExempt ? 'Remover Isenção' : 'Tornar Isenta'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function SuperAdminUsersPage() {
  const [users, setUsers] = useState<any[]>([]);

  const load = async () => {
    const res = await apiFetch<{ users: any[] }>('/api/superadmin/users');
    setUsers(res.users);
  };

  useEffect(() => {
    void load();
  }, []);

  const toggleUser = async (id: string, nextStatus: string) => {
    await apiFetch(`/api/superadmin/users/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: nextStatus })
    });
    await load();
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Usuários da Plataforma</h1>
      <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-800 bg-slate-950 text-xs uppercase text-slate-400">
            <tr>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">E-mail</th>
              <th className="px-4 py-3">Barbearia(s)</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {users.map((u) => (
              <tr key={u.Id}>
                <td className="px-4 py-3 font-medium text-white">
                  {u.Name} {u.IsSuperAdmin === 1 && <span className="ml-1 text-xs text-purple-400">(Superadmin)</span>}
                </td>
                <td className="px-4 py-3 text-slate-300">{u.Email}</td>
                <td className="px-4 py-3 text-slate-400">{u.TenantNames || '—'}</td>
                <td className="px-4 py-3">
                  {u.IsSuperAdmin === 0 && (
                    <button
                      type="button"
                      onClick={() => void toggleUser(u.Id, u.Status === 'active' ? 'blocked' : 'active')}
                      className={`rounded-lg px-3 py-1 text-xs font-semibold ${
                        u.Status === 'active'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-red-500/20 text-red-300'
                      }`}
                    >
                      {u.Status === 'active' ? 'Ativo (Bloquear)' : 'Bloqueado (Ativar)'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const SETTING_HINTS: Record<string, string> = {
  billing_payment_provider: 'Provedor de pagamento (manual_pix ou mercadopago)',
  billing_pix_key: 'Chave Pix Nubank (CPF, CNPJ, e-mail, celular ou aleatória)',
  billing_pix_receiver_name: 'Nome do recebedor exibido no Pix (até 25 caracteres)',
  billing_pix_receiver_city: 'Cidade do recebedor (ex: SAO PAULO)',
  billing_monthly_price_cents: 'Mensalidade em centavos (5000 = R$ 50,00)',
  billing_trial_days: 'Dias gratuitos iniciais (padrão 30)',
  billing_grace_days: 'Dias de carência após vencimento antes do bloqueio (padrão 5)'
};

export function SuperAdminSettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');

  useEffect(() => {
    apiFetch<{ settings: Array<{ SettingKey: string; SettingValue: string }> }>('/api/superadmin/settings')
      .then((res) => {
        const map: Record<string, string> = {};
        for (const row of res.settings) map[row.SettingKey] = row.SettingValue;
        setSettings(map);
      })
      .catch(() => {});
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiFetch('/api/superadmin/settings', {
      method: 'PUT',
      body: JSON.stringify({ settings })
    });
    setMsg('Configurações globais e de cobrança Pix atualizadas.');
  };

  return (
    <form onSubmit={handleSave} className="max-w-xl space-y-5">
      <h1 className="text-2xl font-bold text-white">Limites e Configurações de Pix</h1>
      {msg && <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-200">{msg}</div>}
      <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-6">
        {Object.entries(settings).map(([k, v]) => (
          <div key={k}>
            <label className="mb-1 block font-mono text-xs text-slate-300">{k}</label>
            {SETTING_HINTS[k] && (
              <p className="mb-1 text-[11px] text-slate-400">{SETTING_HINTS[k]}</p>
            )}
            {k === 'billing_payment_provider' ? (
              <select
                value={v}
                onChange={(e) => setSettings({ ...settings, [k]: e.target.value })}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
              >
                <option value="manual_pix">manual_pix (Pix direto Nubank + liberação manual)</option>
                <option value="mercadopago">mercadopago (Gateway Pix automático)</option>
              </select>
            ) : (
              <input
                value={v}
                onChange={(e) => setSettings({ ...settings, [k]: e.target.value })}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
              />
            )}
          </div>
        ))}
        <button type="submit" className="rounded-xl bg-purple-500 px-5 py-2.5 text-sm font-semibold text-white">
          Salvar Configurações
        </button>
      </div>
    </form>
  );
}

export function SuperAdminLogsPage() {
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    apiFetch<{ logs: any[] }>('/api/superadmin/logs')
      .then((res) => setLogs(res.logs))
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Logs do Sistema</h1>
      <div className="space-y-2">
        {logs.length === 0 ? (
          <p className="text-sm text-slate-400">Nenhum evento registrado.</p>
        ) : (
          logs.map((l) => (
            <div key={l.Id} className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-xs">
              <div className="flex justify-between">
                <span className={`font-bold uppercase ${l.Level === 'error' ? 'text-red-400' : 'text-amber-300'}`}>
                  [{l.Level}] {l.Source}
                </span>
                <span className="text-slate-500">{formatDateTimeBR(l.CreatedAt)}</span>
              </div>
              <p className="mt-1 text-slate-200">{l.Message}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
