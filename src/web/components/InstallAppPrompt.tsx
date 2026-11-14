import { useEffect, useState } from 'react';
import { Download, PlusSquare, Share, Smartphone, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

interface InstallAppPromptProps {
  appName: string;
  storageKey: string;
  accentColor?: string;
}

const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function detectMobilePlatform(): { isMobile: boolean; isIos: boolean } {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { isMobile: false, isIos: false };
  }
  const ua = navigator.userAgent || '';
  const isIos =
    /iPhone|iPad|iPod/i.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const isGenericMobile =
    /webOS|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua) ||
    (navigator.maxTouchPoints > 1 && window.innerWidth <= 1024);
  return {
    isMobile: isIos || isAndroid || isGenericMobile,
    isIos
  };
}

function isRunningStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    nav.standalone === true
  );
}

function wasRecentlyDismissed(key: string): boolean {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return false;
    const ts = Number(raw);
    return Number.isFinite(ts) && Date.now() - ts < DISMISS_TTL_MS;
  } catch {
    return false;
  }
}

export function InstallAppPrompt({
  appName,
  storageKey,
  accentColor = '#f59e0b'
}: InstallAppPromptProps) {
  const dismissStorageKey = `pwa_install_dismissed_${storageKey}`;
  const [visible, setVisible] = useState(false);
  const [isIosDevice, setIsIosDevice] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    const { isMobile, isIos } = detectMobilePlatform();
    if (!isMobile || isRunningStandalone() || wasRecentlyDismissed(dismissStorageKey)) {
      return;
    }

    setIsIosDevice(isIos);

    const handleBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setVisible(true);
    };

    const handleInstalled = () => {
      setVisible(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleInstalled);

    // Show automatically on mobile even when browser doesn't emit beforeinstallprompt (e.g. iOS Safari or in-app WebView)
    const fallbackTimer = window.setTimeout(() => {
      if (!isRunningStandalone() && !wasRecentlyDismissed(dismissStorageKey)) {
        setVisible(true);
      }
    }, 900);

    return () => {
      window.clearTimeout(fallbackTimer);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, [dismissStorageKey]);

  const dismiss = () => {
    try {
      window.localStorage.setItem(dismissStorageKey, String(Date.now()));
    } catch {
      // Ignore storage errors
    }
    setVisible(false);
  };

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    setInstalling(true);
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setVisible(false);
      }
      setDeferredPrompt(null);
    } finally {
      setInstalling(false);
    }
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label={`Instalar ${appName}`}
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-md rounded-2xl border border-white/15 bg-slate-900/95 p-4 text-slate-100 shadow-2xl backdrop-blur"
    >
      <div className="flex items-start gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-950"
          style={{ backgroundColor: accentColor }}
        >
          <Smartphone className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-bold text-white">Deseja instalar o app?</h3>
            <button
              type="button"
              onClick={dismiss}
              aria-label="Fechar"
              className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-slate-300">
            Adicione <strong className="text-white">{appName}</strong> à tela inicial do seu celular
            para acessar e agendar com 1 toque.
          </p>

          {deferredPrompt ? (
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                disabled={installing}
                onClick={() => void handleInstallClick()}
                className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-950 transition hover:opacity-90 disabled:opacity-60"
                style={{ backgroundColor: accentColor }}
              >
                <Download className="h-3.5 w-3.5" />
                {installing ? 'Abrindo...' : 'Instalar app'}
              </button>
              <button
                type="button"
                onClick={dismiss}
                className="rounded-xl border border-white/15 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/5"
              >
                Agora não
              </button>
            </div>
          ) : isIosDevice ? (
            <div className="mt-3 space-y-2">
              <div className="rounded-xl border border-white/10 bg-slate-950/70 p-2.5 text-[11px] text-slate-300">
                <p className="flex items-center gap-1.5">
                  <Share className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                  <span>
                    1. Toque em <strong className="text-white">Compartilhar</strong> na barra do navegador
                  </span>
                </p>
                <p className="mt-1 flex items-center gap-1.5">
                  <PlusSquare className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                  <span>
                    2. Escolha <strong className="text-white">Adicionar à Tela de Início</strong>
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={dismiss}
                className="rounded-xl border border-white/15 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/5"
              >
                Entendi
              </button>
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              <p className="rounded-xl border border-white/10 bg-slate-950/70 p-2.5 text-[11px] text-slate-300">
                Abra o menu do navegador (<strong className="text-white">⋮</strong>) e toque em{' '}
                <strong className="text-white">Instalar app</strong> ou{' '}
                <strong className="text-white">Adicionar à tela inicial</strong>.
              </p>
              <button
                type="button"
                onClick={dismiss}
                className="rounded-xl border border-white/15 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/5"
              >
                Agora não
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
