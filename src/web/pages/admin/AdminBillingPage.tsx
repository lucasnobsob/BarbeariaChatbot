import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  QrCode,
  RefreshCw,
  ShieldCheck
} from 'lucide-react';
import type { BillingInvoiceItem, SubscriptionSummary } from '@shared/types';
import { apiFetch, formatBRL, formatDateTimeBR } from '@web/lib/api';
import { useAuth } from '@web/lib/authContext';

interface BillingStatusResponse {
  subscription: SubscriptionSummary;
  config: {
    provider: 'manual_pix' | 'mercadopago';
    monthlyPriceCents: number;
    trialDays: number;
    graceDays: number;
    pixConfigured: boolean;
    pixKey?: string;
    pixReceiverName?: string;
  };
  openInvoice: BillingInvoiceItem | null;
}

const SUB_STATUS_META: Record<
  SubscriptionSummary['status'],
  { label: string; badgeClass: string; description: string }
> = {
  trialing: {
    label: 'Período Gratuito (1 Mês)',
    badgeClass: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
    description: 'Você está aproveitando o primeiro mês grátis com todos os recursos liberados.'
  },
  active: {
    label: 'Assinatura Ativa',
    badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    description: 'Sua barbearia está com a assinatura mensal em dia.'
  },
  past_due: {
    label: 'Em Carência (Pagamento Pendente)',
    badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    description:
      'O prazo regular venceu. Regularize via Pix dentro da carência para evitar o bloqueio automático.'
  },
  suspended: {
    label: 'Suspensa por Falta de Pagamento',
    badgeClass: 'bg-red-500/20 text-red-300 border-red-500/30',
    description:
      'Seu site público, agendamentos e chatbot foram pausados automaticamente. Pague o Pix abaixo para reativar.'
  },
  canceled: {
    label: 'Cancelada',
    badgeClass: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
    description: 'Assinatura cancelada.'
  },
  exempt: {
    label: 'Isenta / Cortesia',
    badgeClass: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    description: 'Esta barbearia possui isenção de mensalidade concedida pela plataforma.'
  }
};

const INVOICE_STATUS_META: Record<
  BillingInvoiceItem['status'],
  { label: string; badgeClass: string }
> = {
  pending: { label: 'Aguardando Pix', badgeClass: 'bg-amber-500/20 text-amber-300' },
  awaiting_confirmation: {
    label: 'Em conferência',
    badgeClass: 'bg-sky-500/20 text-sky-300'
  },
  paid: { label: 'Pago', badgeClass: 'bg-emerald-500/20 text-emerald-300' },
  failed: { label: 'Falhou', badgeClass: 'bg-red-500/20 text-red-300' },
  canceled: { label: 'Cancelado', badgeClass: 'bg-slate-500/20 text-slate-400' }
};

export function AdminBillingPage() {
  const { refreshUser } = useAuth();
  const [statusData, setStatusData] = useState<BillingStatusResponse | null>(null);
  const [invoices, setInvoices] = useState<BillingInvoiceItem[]>([]);
  const [activeInvoice, setActiveInvoice] = useState<BillingInvoiceItem | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [payerNote, setPayerNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadAll = async () => {
    setLoading(true);
    setError('');
    try {
      const [statusRes, invRes] = await Promise.all([
        apiFetch<BillingStatusResponse>('/api/admin/billing/status'),
        apiFetch<{ invoices: BillingInvoiceItem[] }>('/api/admin/billing/invoices')
      ]);
      setStatusData(statusRes);
      setInvoices(invRes.invoices);
      setActiveInvoice(statusRes.openInvoice);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar assinatura.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  useEffect(() => {
    if (!activeInvoice) {
      setQrDataUrl('');
      return;
    }
    if (activeInvoice.pixQrCodeBase64) {
      setQrDataUrl(`data:image/png;base64,${activeInvoice.pixQrCodeBase64}`);
      return;
    }
    if (activeInvoice.pixCopyPaste) {
      QRCode.toDataURL(activeInvoice.pixCopyPaste, {
        width: 240,
        margin: 2,
        color: { dark: '#0f172a', light: '#ffffff' }
      })
        .then(setQrDataUrl)
        .catch(() => setQrDataUrl(''));
    }
  }, [activeInvoice]);

  const handleGeneratePix = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const res = await apiFetch<{ invoice: BillingInvoiceItem }>(
        '/api/admin/billing/checkout',
        { method: 'POST' }
      );
      setActiveInvoice(res.invoice);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao gerar cobrança Pix.');
    } finally {
      setBusy(false);
    }
  };

  const handleNotifyPaid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeInvoice) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const res = await apiFetch<{ invoice: BillingInvoiceItem }>(
        `/api/admin/billing/invoices/${activeInvoice.id}/notify-payment`,
        {
          method: 'POST',
          body: JSON.stringify({ payerNote })
        }
      );
      setActiveInvoice(res.invoice);
      setNotice(
        'Pagamento informado! Assim que conferirmos o recebimento no Nubank, sua assinatura será liberada por mais 30 dias.'
      );
      await loadAll();
      await refreshUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao informar pagamento.');
    } finally {
      setBusy(false);
    }
  };

  const handleCopyPix = async () => {
    if (!activeInvoice?.pixCopyPaste) return;
    await navigator.clipboard.writeText(activeInvoice.pixCopyPaste);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  if (loading && !statusData) {
    return <div className="text-sm text-slate-400">Carregando informações da assinatura...</div>;
  }

  if (!statusData) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-950/30 p-5 text-sm text-red-200">
        {error || 'Não foi possível carregar os dados da assinatura.'}
      </div>
    );
  }

  const { subscription, config } = statusData;
  const meta = SUB_STATUS_META[subscription.status];

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Assinatura e Pagamento Pix</h1>
          <p className="mt-1 text-sm text-slate-400">
            {config.trialDays} dias grátis para testar. Depois,{' '}
            <strong className="text-amber-400">
              {formatBRL(config.monthlyPriceCents)}/mês
            </strong>{' '}
            com {config.graceDays} dias de carência antes do autobloqueio.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadAll()}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Atualizar
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {notice && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-200">
          {notice}
        </div>
      )}

      {/* Card de Status */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${meta.badgeClass}`}
            >
              {subscription.status === 'exempt' || subscription.status === 'active' ? (
                <ShieldCheck className="h-3.5 w-3.5" />
              ) : subscription.status === 'suspended' || subscription.status === 'past_due' ? (
                <AlertTriangle className="h-3.5 w-3.5" />
              ) : (
                <Clock className="h-3.5 w-3.5" />
              )}
              {meta.label}
            </span>
            <p className="text-sm text-slate-300">{meta.description}</p>
          </div>

          <div className="text-right">
            <span className="text-xs text-slate-400">Plano Mensal</span>
            <p className="text-2xl font-bold text-white">
              {formatBRL(subscription.priceInCents)}
              <span className="text-xs font-normal text-slate-400">/mês</span>
            </p>
          </div>
        </div>

        <div className="grid gap-3 border-t border-slate-800 pt-4 text-xs sm:grid-cols-3">
          <div className="rounded-xl bg-slate-950/70 p-3">
            <span className="text-slate-400">Fim do mês grátis</span>
            <p className="mt-1 font-semibold text-white">
              {subscription.status === 'exempt'
                ? 'Isento'
                : formatDateTimeBR(subscription.trialEndsAt)}
            </p>
          </div>
          <div className="rounded-xl bg-slate-950/70 p-3">
            <span className="text-slate-400">Vencimento do ciclo atual</span>
            <p className="mt-1 font-semibold text-white">
              {subscription.currentPeriodEnd
                ? formatDateTimeBR(subscription.currentPeriodEnd)
                : subscription.status === 'trialing'
                  ? `${subscription.daysRemaining ?? 0} dia(s) restantes no trial`
                  : '—'}
            </p>
          </div>
          <div className="rounded-xl bg-slate-950/70 p-3">
            <span className="text-slate-400">Carência até autobloqueio</span>
            <p className="mt-1 font-semibold text-white">
              {subscription.gracePeriodEndsAt
                ? formatDateTimeBR(subscription.gracePeriodEndsAt)
                : `${config.graceDays} dias após vencimento`}
            </p>
          </div>
        </div>

        {subscription.status !== 'exempt' && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-4">
            <p className="text-xs text-slate-400">
              {config.provider === 'manual_pix'
                ? 'Pagamento via Pix direto com conferência manual.'
                : 'Pagamento via Pix com confirmação automática Mercado Pago.'}
            </p>
            <button
              type="button"
              disabled={busy || !config.pixConfigured}
              onClick={() => void handleGeneratePix()}
              className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-amber-400 disabled:opacity-50"
            >
              <QrCode className="h-4 w-4" />
              {activeInvoice
                ? 'Ver Pix em Aberto'
                : `Gerar Pix (${formatBRL(config.monthlyPriceCents)})`}
            </button>
          </div>
        )}

        {subscription.status !== 'exempt' && !config.pixConfigured && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-950/30 px-4 py-3 text-xs text-amber-200">
            A chave Pix recebedora ainda não foi cadastrada pelo administrador da plataforma.
          </div>
        )}
      </div>

      {/* Área de Pagamento Pix */}
      {activeInvoice && (
        <div className="rounded-2xl border border-amber-500/30 bg-slate-900 p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-lg font-bold text-white">
              <CreditCard className="h-5 w-5 text-amber-400" />
              Pagar mensalidade via Pix — {formatBRL(activeInvoice.amountInCents)}
            </h2>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                INVOICE_STATUS_META[activeInvoice.status].badgeClass
              }`}
            >
              {INVOICE_STATUS_META[activeInvoice.status].label}
            </span>
          </div>

          <div className="grid gap-6 md:grid-cols-[240px_1fr]">
            <div className="flex flex-col items-center justify-center rounded-2xl bg-white p-3">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt="QR Code Pix para pagamento"
                  className="h-52 w-52 object-contain"
                />
              ) : (
                <div className="flex h-52 w-52 items-center justify-center text-xs text-slate-500">
                  QR Code indisponível
                </div>
              )}
            </div>

            <div className="space-y-4">
              {config.pixKey && (
                <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs">
                  <span className="text-slate-400">Chave Pix Nubank ({config.pixReceiverName}):</span>
                  <p className="mt-1 font-mono font-semibold text-amber-300 select-all">
                    {config.pixKey}
                  </p>
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-300">
                  Pix Copia e Cola
                </label>
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={activeInvoice.pixCopyPaste}
                    className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-200"
                  />
                  <button
                    type="button"
                    onClick={() => void handleCopyPix()}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-slate-800 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-700"
                  >
                    {copied ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-400" /> Copiado
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" /> Copiar
                      </>
                    )}
                  </button>
                </div>
              </div>

              {activeInvoice.provider === 'manual_pix' &&
                activeInvoice.status === 'pending' && (
                  <form
                    onSubmit={handleNotifyPaid}
                    className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/70 p-4"
                  >
                    <label className="block text-xs font-medium text-slate-300">
                      Já fez o Pix? Informe opcionalmente o nome do pagador ou comprovante:
                    </label>
                    <input
                      value={payerNote}
                      onChange={(e) => setPayerNote(e.target.value)}
                      placeholder="Ex: Pago via Nubank por João Silva às 14:20"
                      className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white placeholder:text-slate-500"
                    />
                    <button
                      type="submit"
                      disabled={busy}
                      className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
                    >
                      <CheckCircle2 className="h-4 w-4" /> Já realizei o pagamento
                    </button>
                  </form>
                )}

              {activeInvoice.status === 'awaiting_confirmation' && (
                <div className="rounded-xl border border-sky-500/30 bg-sky-950/30 px-4 py-3 text-xs text-sky-200">
                  Pagamento informado em{' '}
                  {activeInvoice.paymentNotifiedAt
                    ? formatDateTimeBR(activeInvoice.paymentNotifiedAt)
                    : 'instantes'}
                  . Aguardando confirmação do administrador para liberar os próximos 30 dias.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Histórico de Faturas */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="mb-4 text-base font-bold text-white">Histórico de Cobranças</h2>
        {invoices.length === 0 ? (
          <p className="text-sm text-slate-400">Nenhuma cobrança gerada até o momento.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 uppercase text-slate-400">
                <tr>
                  <th className="py-2.5 pr-4">Criada em</th>
                  <th className="py-2.5 pr-4">Valor</th>
                  <th className="py-2.5 pr-4">Método</th>
                  <th className="py-2.5 pr-4">Status</th>
                  <th className="py-2.5">Pago em</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {invoices.map((inv) => {
                  const invMeta = INVOICE_STATUS_META[inv.status];
                  return (
                    <tr key={inv.id}>
                      <td className="py-3 pr-4 text-slate-300">
                        {formatDateTimeBR(inv.createdAt)}
                      </td>
                      <td className="py-3 pr-4 font-semibold text-white">
                        {formatBRL(inv.amountInCents)}
                      </td>
                      <td className="py-3 pr-4 text-slate-400">
                        {inv.provider === 'mercadopago' ? 'Pix (Mercado Pago)' : 'Pix Direto'}
                      </td>
                      <td className="py-3 pr-4">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${invMeta.badgeClass}`}
                        >
                          {invMeta.label}
                        </span>
                      </td>
                      <td className="py-3 text-slate-400">
                        {inv.paidAt ? formatDateTimeBR(inv.paidAt) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
