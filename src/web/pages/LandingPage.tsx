import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bot,
  CalendarCheck,
  CheckCircle2,
  Globe,
  Palette,
  Scissors,
  ShieldCheck,
  Sparkles,
  Store
} from 'lucide-react';
import { apiFetch } from '@web/lib/api';
import { useAuth } from '@web/lib/authContext';

interface ShowcaseShop {
  Slug: string;
  BusinessName: string;
  Tagline: string;
  City: string;
  State: string;
  LogoUrl: string;
  CoverImageUrl: string;
  PrimaryColor: string;
}

export function LandingPage() {
  const { user } = useAuth();
  const [shops, setShops] = useState<ShowcaseShop[]>([]);

  useEffect(() => {
    apiFetch<{ barbershops: ShowcaseShop[] }>('/api/public/showcase')
      .then((res) => setShops(res.barbershops))
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500 text-slate-950">
              <Scissors className="h-5 w-5" />
            </div>
            <div>
              <span className="text-lg font-bold tracking-tight">BarberSaaS</span>
              <span className="block text-[11px] text-slate-400">Plataforma Multi-Tenant</span>
            </div>
          </Link>

          <nav className="flex items-center gap-3">
            {user ? (
              <>
                {user.isSuperAdmin && (
                  <Link
                    to="/superadmin"
                    className="rounded-lg border border-purple-500/40 bg-purple-950/40 px-3 py-2 text-sm font-medium text-purple-200 hover:bg-purple-900/50"
                  >
                    Superadmin
                  </Link>
                )}
                <Link
                  to={user.tenantId ? '/admin/dashboard' : '/admin/onboarding'}
                  className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400"
                >
                  Meu Painel
                </Link>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="rounded-lg px-3 py-2 text-sm font-medium text-slate-300 hover:text-white"
                >
                  Entrar
                </Link>
                <Link
                  to="/register"
                  className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400"
                >
                  Criar Barbearia Grátis
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-slate-800/60 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-500/15 via-slate-950 to-slate-950 px-4 py-20 md:py-28">
        <div className="mx-auto max-w-5xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-xs font-medium text-amber-300">
            <Sparkles className="h-3.5 w-3.5" />
            Arquitetura Multi-Tenant isolada em Cloudflare Workers + D1 + R2
          </div>
          <h1 className="font-display text-4xl font-bold tracking-tight text-white md:text-6xl">
            Sua barbearia com site próprio, agendamento online e chatbot em minutos.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-300">
            Cadastre seu estabelecimento, personalize cores, logotipo, galeria de fotos, serviços,
            profissionais e atenda clientes automaticamente pelo Telegram ou WhatsApp oficial sem
            mexer em código.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              to="/register"
              className="w-full rounded-xl bg-amber-500 px-7 py-3.5 text-base font-semibold text-slate-950 shadow-lg shadow-amber-500/20 transition hover:bg-amber-400 sm:w-auto"
            >
              Cadastrar Minha Barbearia
            </Link>
            <Link
              to="/login"
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-7 py-3.5 text-base font-semibold text-slate-200 transition hover:border-slate-500 sm:w-auto"
            >
              Acessar Painel Administrativo
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="grid gap-6 md:grid-cols-3">
          {[
            {
              icon: Globe,
              title: 'Website Público Exclusivo',
              desc: 'Link único /b/sua-barbearia com SEO dinâmico, Schema.org, galeria lightbox, mapa e cores da sua marca.'
            },
            {
              icon: CalendarCheck,
              title: 'Agenda Sem Conflitos',
              desc: 'Cálculo automático de horários disponíveis respeitando expediente, pausas, duração do serviço e bloqueios.'
            },
            {
              icon: Bot,
              title: 'Chatbot Multi-Tenant Integrado',
              desc: 'Telegram Bot API 100% gratuito e suporte à WhatsApp Cloud API oficial com o mesmo motor de agendamento.'
            },
            {
              icon: Palette,
              title: 'Personalização Sem Código',
              desc: 'Configure logotipo, capa, textos, cores, serviços, equipe e visualize prévia antes de publicar.'
            },
            {
              icon: ShieldCheck,
              title: 'Isolamento Total por Tenant',
              desc: 'Todos os dados, uploads no R2 e sessões do chatbot são validados por TenantId no backend e banco D1.'
            },
            {
              icon: CheckCircle2,
              title: 'Custo Operacional Zero',
              desc: 'Projetado para operar dentro das cotas gratuitas da Cloudflare com imagens otimizadas em WebP.'
            }
          ].map((feat) => (
            <div
              key={feat.title}
              className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 transition hover:border-amber-500/40"
            >
              <feat.icon className="h-8 w-8 text-amber-400" />
              <h3 className="mt-4 text-lg font-semibold text-white">{feat.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{feat.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {shops.length > 0 && (
        <section className="border-t border-slate-800/80 bg-slate-900/30 px-4 py-16">
          <div className="mx-auto max-w-6xl">
            <div className="mb-8 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-white">Barbearias na Plataforma</h2>
                <p className="text-sm text-slate-400">
                  Estabelecimentos publicados usando o mesmo template dinâmico multi-tenant
                </p>
              </div>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {shops.map((shop) => (
                <Link
                  key={shop.Slug}
                  to={`/b/${shop.Slug}`}
                  className="group overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 transition hover:border-amber-500/50"
                >
                  <div
                    className="h-36 w-full bg-slate-800 bg-cover bg-center"
                    style={
                      shop.CoverImageUrl
                        ? { backgroundImage: `url(${shop.CoverImageUrl})` }
                        : { background: `linear-gradient(135deg, ${shop.PrimaryColor || '#d97706'}44, #0f172a)` }
                    }
                  />
                  <div className="p-5">
                    <div className="flex items-center gap-3">
                      {shop.LogoUrl ? (
                        <img
                          src={shop.LogoUrl}
                          alt={shop.BusinessName}
                          className="h-11 w-11 rounded-full border border-slate-700 object-cover"
                        />
                      ) : (
                        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-800 text-amber-400">
                          <Store className="h-5 w-5" />
                        </div>
                      )}
                      <div>
                        <h3 className="font-semibold text-white group-hover:text-amber-400">
                          {shop.BusinessName}
                        </h3>
                        {(shop.City || shop.State) && (
                          <p className="text-xs text-slate-400">
                            {[shop.City, shop.State].filter(Boolean).join(' - ')}
                          </p>
                        )}
                      </div>
                    </div>
                    {shop.Tagline && (
                      <p className="mt-3 line-clamp-2 text-sm text-slate-400">{shop.Tagline}</p>
                    )}
                    <span className="mt-4 inline-block text-xs font-semibold text-amber-400">
                      Ver página pública →
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <footer className="border-t border-slate-800 px-4 py-8 text-center text-xs text-slate-500">
        BarberSaaS — Plataforma SaaS Multi-Tenant para Barbearias • Cloudflare Workers, D1 & R2
      </footer>
    </div>
  );
}
