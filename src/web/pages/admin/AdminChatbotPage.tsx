import { useEffect, useState } from 'react';
import { Bot, CheckCircle2, Info, MessageSquare, Save, Send, Webhook } from 'lucide-react';
import type { ChatbotConfigPublic } from '@shared/types';
import { apiFetch } from '@web/lib/api';

export function AdminChatbotPage() {
  const [configs, setConfigs] = useState<ChatbotConfigPublic[]>([]);
  const [activeTab, setActiveTab] = useState<'telegram' | 'whatsapp'>('telegram');

  // Telegram fields
  const [tgEnabled, setTgEnabled] = useState(false);
  const [tgToken, setTgToken] = useState('');
  const [tgUsername, setTgUsername] = useState('');
  const [tgWelcome, setTgWelcome] = useState('');
  const [tgAway, setTgAway] = useState('');

  // WhatsApp official fields
  const [waEnabled, setWaEnabled] = useState(false);
  const [waPhoneId, setWaPhoneId] = useState('');
  const [waAccessToken, setWaAccessToken] = useState('');
  const [waAppSecret, setWaAppSecret] = useState('');
  const [waVerifyToken, setWaVerifyToken] = useState('');
  const [waWelcome, setWaWelcome] = useState('');
  const [waAway, setWaAway] = useState('');

  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Simulator
  const [simMessages, setSimMessages] = useState<Array<{ from: 'user' | 'bot'; text: string }>>([
    { from: 'bot', text: 'Envie "oi" ou "menu" para testar o atendimento automatizado da sua barbearia!' }
  ]);
  const [simInput, setSimInput] = useState('');

  const load = async () => {
    const res = await apiFetch<{ configs: ChatbotConfigPublic[] }>('/api/admin/chatbot');
    setConfigs(res.configs);
    const tg = res.configs.find((c) => c.provider === 'telegram');
    const wa = res.configs.find((c) => c.provider === 'whatsapp');
    if (tg) {
      setTgEnabled(tg.isEnabled);
      setTgUsername(tg.botUsername || '');
      setTgWelcome(tg.welcomeMessage);
      setTgAway(tg.awayMessage);
    }
    if (wa) {
      setWaEnabled(wa.isEnabled);
      setWaPhoneId(wa.phoneNumberId || '');
      setWaWelcome(wa.welcomeMessage);
      setWaAway(wa.awayMessage);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const currentConfig = configs.find((c) => c.provider === activeTab);

  const saveTelegram = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg('');
    setErrorMsg('');
    try {
      await apiFetch('/api/admin/chatbot', {
        method: 'PUT',
        body: JSON.stringify({
          provider: 'telegram',
          isEnabled: tgEnabled,
          botToken: tgToken || undefined,
          botUsername: tgUsername,
          welcomeMessage: tgWelcome,
          awayMessage: tgAway
        })
      });
      setTgToken('');
      await load();
      setStatusMsg('Configuração do Telegram salva com criptografia AES-GCM!');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao salvar');
    }
  };

  const registerTelegramWebhook = async () => {
    setStatusMsg('');
    setErrorMsg('');
    try {
      const res = await apiFetch<{ webhookUrl: string }>('/api/admin/chatbot/telegram/register-webhook', {
        method: 'POST'
      });
      setStatusMsg(`Webhook registrado no Telegram: ${res.webhookUrl}`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao registrar webhook');
    }
  };

  const saveWhatsApp = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg('');
    setErrorMsg('');
    try {
      await apiFetch('/api/admin/chatbot', {
        method: 'PUT',
        body: JSON.stringify({
          provider: 'whatsapp',
          isEnabled: waEnabled,
          phoneNumberId: waPhoneId,
          accessToken: waAccessToken || undefined,
          appSecret: waAppSecret || undefined,
          verifyToken: waVerifyToken || undefined,
          welcomeMessage: waWelcome,
          awayMessage: waAway
        })
      });
      setWaAccessToken('');
      setWaAppSecret('');
      setWaVerifyToken('');
      await load();
      setStatusMsg('Configuração do WhatsApp Cloud API salva com criptografia!');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao salvar');
    }
  };

  const sendSim = async (e: React.FormEvent) => {
    e.preventDefault();
    const txt = simInput.trim();
    if (!txt) return;
    setSimMessages((prev) => [...prev, { from: 'user', text: txt }]);
    setSimInput('');
    try {
      const res = await apiFetch<{ reply: string }>('/api/admin/chatbot/simulate', {
        method: 'POST',
        body: JSON.stringify({ message: txt })
      });
      setSimMessages((prev) => [...prev, { from: 'bot', text: res.reply }]);
    } catch (err) {
      setSimMessages((prev) => [
        ...prev,
        { from: 'bot', text: err instanceof Error ? err.message : 'Erro no simulador' }
      ]);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Chatbot Multi-Tenant</h1>
        <p className="text-sm text-slate-400">
          Atendimento automático conectado diretamente à agenda e serviços da sua barbearia.
        </p>
      </div>

      {statusMsg && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-200">
          {statusMsg}
        </div>
      )}
      {errorMsg && (
        <div className="rounded-xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          {errorMsg}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left: Provider Config */}
        <div className="lg:col-span-7 space-y-5">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('telegram')}
              className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                activeTab === 'telegram'
                  ? 'bg-sky-500 text-slate-950'
                  : 'border border-slate-700 bg-slate-900 text-slate-300'
              }`}
            >
              Telegram Bot API (100% Grátis)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('whatsapp')}
              className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                activeTab === 'whatsapp'
                  ? 'bg-emerald-500 text-slate-950'
                  : 'border border-slate-700 bg-slate-900 text-slate-300'
              }`}
            >
              WhatsApp Cloud API (Oficial Meta)
            </button>
          </div>

          {activeTab === 'telegram' ? (
            <form onSubmit={saveTelegram} className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-4">
              <div className="flex items-start gap-3 rounded-xl border border-sky-500/30 bg-sky-950/30 p-3.5 text-xs text-sky-200">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Crie seu bot gratuitamente no Telegram com o @BotFather, cole o token abaixo e
                  clique em Registrar Webhook. O token é armazenado criptografado e nunca é exposto ao navegador.
                </span>
              </div>

              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm font-medium text-white">
                  <input
                    type="checkbox"
                    checked={tgEnabled}
                    onChange={(e) => setTgEnabled(e.target.checked)}
                  />
                  Ativar atendimento automático no Telegram
                </label>
                {currentConfig?.hasToken && (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Token salvo ({currentConfig.maskedToken})
                  </span>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs text-slate-400">
                    Bot Token {currentConfig?.hasToken ? '(deixe vazio para manter)' : ''}
                  </label>
                  <input
                    type="password"
                    value={tgToken}
                    onChange={(e) => setTgToken(e.target.value)}
                    placeholder="123456789:AAF..."
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-400">@Username do Bot</label>
                  <input
                    value={tgUsername}
                    onChange={(e) => setTgUsername(e.target.value)}
                    placeholder="@MinhaBarbeariaBot"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-400">Mensagem Inicial</label>
                <textarea
                  rows={2}
                  value={tgWelcome}
                  onChange={(e) => setTgWelcome(e.target.value)}
                  placeholder="Olá! Bem-vindo à nossa barbearia."
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-400">Mensagem de Encaminhamento / Ausência</label>
                <textarea
                  rows={2}
                  value={tgAway}
                  onChange={(e) => setTgAway(e.target.value)}
                  placeholder="Nosso atendente responderá em breve..."
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                />
              </div>

              {currentConfig && (
                <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs">
                  <span className="text-slate-400">URL do Webhook:</span>
                  <p className="mt-1 break-all font-mono text-amber-300">{currentConfig.webhookUrl}</p>
                </div>
              )}

              <div className="flex flex-wrap gap-3">
                <button type="submit" className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-slate-950">
                  <Save className="h-4 w-4" /> Salvar Configuração
                </button>
                <button
                  type="button"
                  onClick={() => void registerTelegramWebhook()}
                  className="inline-flex items-center gap-2 rounded-xl border border-sky-500/40 bg-sky-950/40 px-4 py-2.5 text-sm font-medium text-sky-200 hover:bg-sky-900/40"
                >
                  <Webhook className="h-4 w-4" /> Registrar Webhook no Telegram
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={saveWhatsApp} className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-4">
              <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-950/30 p-3.5 text-xs text-amber-200">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  API Oficial Meta (WhatsApp Cloud API): oferece 1.000 mensagens de serviço gratuitas
                  por mês por número comercial (exige método de pagamento cadastrado na Meta para
                  excedentes/templates). Caso queira custo zero garantido, utilize o Telegram Bot API.
                </span>
              </div>

              <label className="flex items-center gap-2 text-sm font-medium text-white">
                <input type="checkbox" checked={waEnabled} onChange={(e) => setWaEnabled(e.target.checked)} />
                Ativar atendimento via WhatsApp Cloud API oficial
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <input placeholder="Phone Number ID" value={waPhoneId} onChange={(e) => setWaPhoneId(e.target.value)} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
                <input type="password" placeholder="Access Token (permanente)" value={waAccessToken} onChange={(e) => setWaAccessToken(e.target.value)} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
                <input type="password" placeholder="App Secret (validação HMAC)" value={waAppSecret} onChange={(e) => setWaAppSecret(e.target.value)} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
                <input placeholder="Verify Token do Webhook" value={waVerifyToken} onChange={(e) => setWaVerifyToken(e.target.value)} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
              </div>

              <textarea rows={2} placeholder="Mensagem inicial" value={waWelcome} onChange={(e) => setWaWelcome(e.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
              <textarea rows={2} placeholder="Mensagem de ausência / atendente" value={waAway} onChange={(e) => setWaAway(e.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />

              {currentConfig && (
                <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs">
                  <span className="text-slate-400">Callback URL para Meta Developers:</span>
                  <p className="mt-1 break-all font-mono text-emerald-300">{currentConfig.webhookUrl}</p>
                </div>
              )}

              <button type="submit" className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-slate-950">
                <Save className="h-4 w-4" /> Salvar WhatsApp Oficial
              </button>
            </form>
          )}
        </div>

        {/* Right: Live Simulator */}
        <div className="lg:col-span-5">
          <div className="flex h-[540px] flex-col rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden">
            <div className="flex items-center gap-2 border-b border-slate-800 bg-slate-950 px-4 py-3">
              <Bot className="h-5 w-5 text-amber-400" />
              <div>
                <h2 className="text-sm font-semibold text-white">Simulador em Tempo Real</h2>
                <p className="text-[11px] text-slate-400">Usa exatamente os dados e agenda do seu banco</p>
              </div>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {simMessages.map((m, idx) => (
                <div
                  key={idx}
                  className={`max-w-[85%] whitespace-pre-line rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                    m.from === 'user'
                      ? 'ml-auto bg-amber-500 text-slate-950 font-medium'
                      : 'bg-slate-800 text-slate-100'
                  }`}
                >
                  {m.text}
                </div>
              ))}
            </div>

            <form onSubmit={sendSim} className="flex gap-2 border-t border-slate-800 bg-slate-950 p-3">
              <MessageSquare className="my-auto h-4 w-4 text-slate-500" />
              <input
                value={simInput}
                onChange={(e) => setSimInput(e.target.value)}
                placeholder='Digite "menu", "1", "3"...'
                className="flex-1 bg-transparent text-sm text-white outline-none"
              />
              <button type="submit" className="rounded-xl bg-amber-500 p-2 text-slate-950 hover:bg-amber-400">
                <Send className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
