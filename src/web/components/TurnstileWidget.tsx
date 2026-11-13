import { useEffect, useRef } from 'react';
import { ShieldCheck } from 'lucide-react';

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      remove: (id: string) => void;
    };
  }
}

export function TurnstileWidget({
  siteKey,
  onToken
}: {
  siteKey: string;
  onToken: (token: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isTestKey = !siteKey || siteKey === '1x00000000000000000000AA';

  useEffect(() => {
    if (isTestKey) {
      onToken('dev-test-turnstile-token');
      return;
    }

    let widgetId: string | undefined;
    const renderWidget = () => {
      if (containerRef.current && window.turnstile) {
        widgetId = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme: 'dark',
          callback: (token: string) => onToken(token)
        });
      }
    };

    if (window.turnstile) {
      renderWidget();
    } else {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.onload = renderWidget;
      document.head.appendChild(script);
    }

    return () => {
      if (widgetId && window.turnstile) {
        window.turnstile.remove(widgetId);
      }
    };
  }, [isTestKey, onToken, siteKey]);

  if (isTestKey) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-300">
        <ShieldCheck className="h-4 w-4 shrink-0" />
        <span>Proteção anti-robô Cloudflare Turnstile ativa (modo teste local)</span>
      </div>
    );
  }

  return <div ref={containerRef} className="my-2" />;
}
