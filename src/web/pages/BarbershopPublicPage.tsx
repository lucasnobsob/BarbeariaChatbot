import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import {
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Instagram,
  Mail,
  MapPin,
  Menu,
  MessageCircle,
  Navigation,
  Phone,
  Scissors,
  Search,
  Send,
  X
} from 'lucide-react';
import type { PublicBarbershopPayload } from '@shared/types';
import { apiFetch, formatBRL, formatDateTimeBR } from '@web/lib/api';
import { useAuth } from '@web/lib/authContext';
import { TurnstileWidget } from '@web/components/TurnstileWidget';

const DAY_NAMES = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado'
];

export function BarbershopPublicPage() {
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const isPreview = searchParams.get('preview') === '1';
  const { turnstileSiteKey } = useAuth();

  const [data, setData] = useState<PublicBarbershopPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Gallery carousel + lightbox + swipe
  const [galleryIdx, setGalleryIdx] = useState(0);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [lightboxCaption, setLightboxCaption] = useState('');
  const touchStartX = useRef<number | null>(null);

  // Category filter
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Booking wizard state
  const [bookingMode, setBookingMode] = useState<'book' | 'manage'>('book');
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [selectedProfId, setSelectedProfId] = useState('');
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [slots, setSlots] = useState<Array<{ time: string; startAt: string; endAt: string }>>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState('');
  const [selectedStartAt, setSelectedStartAt] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [bookingSubmitting, setBookingSubmitting] = useState(false);
  const [bookingError, setBookingError] = useState('');
  const [confirmedAppt, setConfirmedAppt] = useState<{
    confirmationCode: string;
    serviceName: string;
    professionalName: string;
    startAt: string;
    priceInCents: number;
  } | null>(null);

  // Manage existing appointment (lookup / cancel / reschedule)
  const [lookupCode, setLookupCode] = useState('');
  const [lookupPhone, setLookupPhone] = useState('');
  const [lookupResult, setLookupResult] = useState<{
    Id: string;
    StartAt: string;
    Status: string;
    ConfirmationCode: string;
    ServiceName: string;
    ProfessionalName: string;
    ServiceId: string;
    ProfessionalId: string;
  } | null>(null);
  const [lookupMessage, setLookupMessage] = useState('');
  const [rescheduleDate, setRescheduleDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [rescheduleSlots, setRescheduleSlots] = useState<Array<{ time: string; startAt: string }>>([]);
  const [rescheduleStartAt, setRescheduleStartAt] = useState('');

  const bookingRef = useRef<HTMLElement>(null);
  const servicesRef = useRef<HTMLElement>(null);
  const galleryRef = useRef<HTMLElement>(null);
  const locationRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    setNotFound(false);
    apiFetch<PublicBarbershopPayload>(
      `/api/public/${encodeURIComponent(slug)}${isPreview ? '?preview=1' : ''}`
    )
      .then((res) => {
        setData(res);
        document.title = `${res.profile.businessName} — Agendamento Online`;
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug, isPreview]);

  // Scroll to sub-route section automatically
  useEffect(() => {
    if (!data) return;
    const p = location.pathname;
    if (p.endsWith('/services')) servicesRef.current?.scrollIntoView({ behavior: 'smooth' });
    else if (p.endsWith('/gallery')) galleryRef.current?.scrollIntoView({ behavior: 'smooth' });
    else if (p.endsWith('/booking')) bookingRef.current?.scrollIntoView({ behavior: 'smooth' });
    else if (p.endsWith('/location')) locationRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [data, location.pathname]);

  const eligibleProfessionals = useMemo(() => {
    if (!data) return [];
    if (!selectedServiceId) return data.professionals;
    return data.professionals.filter((p) => (p.serviceIds || []).includes(selectedServiceId));
  }, [data, selectedServiceId]);

  useEffect(() => {
    if (
      selectedProfId &&
      !eligibleProfessionals.some((p) => p.id === selectedProfId)
    ) {
      setSelectedProfId('');
    }
  }, [eligibleProfessionals, selectedProfId]);

  const loadSlots = useCallback(async () => {
    if (!slug || !selectedServiceId || !selectedProfId || !selectedDate) {
      setSlots([]);
      return;
    }
    setSlotsLoading(true);
    setSlotsError('');
    setSelectedStartAt('');
    try {
      const res = await apiFetch<{
        slots: Array<{ time: string; startAt: string; endAt: string }>;
        error?: string;
      }>(
        `/api/public/${encodeURIComponent(slug)}/slots?date=${encodeURIComponent(selectedDate)}&serviceId=${encodeURIComponent(selectedServiceId)}&professionalId=${encodeURIComponent(selectedProfId)}`
      );
      setSlots(res.slots);
      if (res.error) setSlotsError(res.error);
    } catch (err) {
      setSlotsError(err instanceof Error ? err.message : 'Erro ao buscar horários');
    } finally {
      setSlotsLoading(false);
    }
  }, [slug, selectedServiceId, selectedProfId, selectedDate]);

  useEffect(() => {
    void loadSlots();
  }, [loadSlots]);

  const handleBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slug || !selectedServiceId || !selectedProfId || !selectedStartAt) return;
    setBookingError('');
    setBookingSubmitting(true);
    try {
      const res = await apiFetch<{
        appointment: {
          confirmationCode: string;
          serviceName: string;
          professionalName: string;
          startAt: string;
          priceInCents: number;
        };
      }>(`/api/public/${encodeURIComponent(slug)}/appointments`, {
        method: 'POST',
        body: JSON.stringify({
          serviceId: selectedServiceId,
          professionalId: selectedProfId,
          startAt: selectedStartAt,
          customerName,
          customerPhone,
          notes,
          turnstileToken
        })
      });
      setConfirmedAppt(res.appointment);
      void loadSlots();
    } catch (err) {
      setBookingError(err instanceof Error ? err.message : 'Erro ao confirmar agendamento');
    } finally {
      setBookingSubmitting(false);
    }
  };

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slug) return;
    setLookupMessage('');
    setLookupResult(null);
    try {
      const res = await apiFetch<{ appointment: typeof lookupResult }>(
        `/api/public/${encodeURIComponent(slug)}/appointments/lookup?code=${encodeURIComponent(lookupCode)}&phone=${encodeURIComponent(lookupPhone)}`
      );
      setLookupResult(res.appointment);
    } catch (err) {
      setLookupMessage(err instanceof Error ? err.message : 'Agendamento não encontrado');
    }
  };

  const handleCancelLookup = async () => {
    if (!slug || !lookupResult) return;
    try {
      await apiFetch(`/api/public/${encodeURIComponent(slug)}/appointments/cancel`, {
        method: 'POST',
        body: JSON.stringify({ code: lookupCode, phone: lookupPhone })
      });
      setLookupResult({ ...lookupResult, Status: 'cancelled' });
      setLookupMessage('Agendamento cancelado com sucesso.');
    } catch (err) {
      setLookupMessage(err instanceof Error ? err.message : 'Erro ao cancelar');
    }
  };

  useEffect(() => {
    if (!slug || !lookupResult || !rescheduleDate) return;
    apiFetch<{ slots: Array<{ time: string; startAt: string }> }>(
      `/api/public/${encodeURIComponent(slug)}/slots?date=${encodeURIComponent(rescheduleDate)}&serviceId=${encodeURIComponent(lookupResult.ServiceId)}&professionalId=${encodeURIComponent(lookupResult.ProfessionalId)}`
    )
      .then((res) => setRescheduleSlots(res.slots))
      .catch(() => setRescheduleSlots([]));
  }, [slug, lookupResult, rescheduleDate]);

  const handleRescheduleLookup = async () => {
    if (!slug || !lookupResult || !rescheduleStartAt) return;
    try {
      const res = await apiFetch<{ startAt: string }>(
        `/api/public/${encodeURIComponent(slug)}/appointments/reschedule`,
        {
          method: 'POST',
          body: JSON.stringify({
            code: lookupCode,
            phone: lookupPhone,
            newStartAt: rescheduleStartAt
          })
        }
      );
      setLookupResult({ ...lookupResult, StartAt: res.startAt });
      setLookupMessage('Horário reagendado com sucesso!');
      setRescheduleStartAt('');
    } catch (err) {
      setLookupMessage(err instanceof Error ? err.message : 'Erro ao reagendar');
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400">
        Carregando barbearia...
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4 text-center">
        <Scissors className="mb-4 h-12 w-12 text-amber-500" />
        <h1 className="text-2xl font-bold text-white">Barbearia não encontrada</h1>
        <p className="mt-2 text-sm text-slate-400">
          O endereço informado não existe ou está temporariamente desativado.
        </p>
        <Link
          to="/"
          className="mt-6 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-slate-950"
        >
          Voltar à Plataforma
        </Link>
      </div>
    );
  }

  const { profile, services, categories, professionals, gallery, workingHours, tenant } = data;
  const filteredServices =
    selectedCategory === 'all'
      ? services
      : services.filter((s) => s.categoryId === selectedCategory);

  const addressLine = [
    profile.street && `${profile.street}${profile.number ? `, ${profile.number}` : ''}`,
    profile.complement,
    profile.neighborhood,
    profile.city && profile.state ? `${profile.city} - ${profile.state}` : profile.city,
    profile.postalCode
  ]
    .filter(Boolean)
    .join(', ');

  const mapsDestination =
    profile.latitude !== null && profile.longitude !== null
      ? `${profile.latitude},${profile.longitude}`
      : encodeURIComponent(addressLine || profile.businessName);
  const routeUrl = `https://www.google.com/maps/dir/?api=1&destination=${mapsDestination}`;

  const themeVars = {
    '--shop-primary': profile.primaryColor || '#d97706',
    '--shop-secondary': profile.secondaryColor || '#0f172a',
    '--shop-accent': profile.accentColor || '#f59e0b'
  } as React.CSSProperties;

  const isMinimal = profile.templateKey === 'modern-minimal';
  const isUrban = profile.templateKey === 'urban-studio';

  return (
    <div
      style={themeVars}
      className={`min-h-screen ${isMinimal ? 'bg-zinc-950' : isUrban ? 'bg-neutral-950' : 'bg-slate-950'} text-slate-100`}
    >
      {isPreview && tenant.status !== 'active' && (
        <div className="bg-amber-500 px-4 py-2 text-center text-xs font-semibold text-slate-950">
          MODO PRÉVIA — Esta barbearia ainda não foi publicada para o público geral.
        </div>
      )}

      {/* 6.1 Header */}
      <header
        className="sticky top-0 z-40 border-b border-white/10 backdrop-blur-md"
        style={{ backgroundColor: `${profile.secondaryColor || '#0f172a'}e6` }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5">
          <Link to={`/b/${tenant.slug}`} className="flex items-center gap-3">
            {profile.logoUrl ? (
              <img
                src={profile.logoUrl}
                alt={profile.businessName}
                className="h-10 w-10 rounded-full border border-white/20 object-cover"
              />
            ) : (
              <div
                className="flex h-10 w-10 items-center justify-center rounded-full text-slate-950"
                style={{ backgroundColor: 'var(--shop-primary)' }}
              >
                <Scissors className="h-5 w-5" />
              </div>
            )}
            <span className="font-display text-lg font-bold text-white">
              {profile.businessName}
            </span>
          </Link>

          <nav className="hidden items-center gap-6 text-sm font-medium md:flex">
            <a href="#servicos" className="text-slate-200 hover:text-white">
              Serviços
            </a>
            {profile.showGallery && gallery.length > 0 && (
              <a href="#galeria" className="text-slate-200 hover:text-white">
                Galeria
              </a>
            )}
            <a href="#localizacao" className="text-slate-200 hover:text-white">
              Localização
            </a>
            <a
              href="#agendar"
              className="rounded-xl px-4 py-2 font-semibold text-slate-950 transition hover:opacity-90"
              style={{ backgroundColor: 'var(--shop-primary)' }}
            >
              Agendar Horário
            </a>
          </nav>

          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="rounded-lg p-2 text-slate-200 md:hidden"
            aria-label="Abrir menu"
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="border-t border-white/10 px-4 py-4 md:hidden">
            <div className="flex flex-col gap-3 text-sm">
              <a href="#servicos" onClick={() => setMobileMenuOpen(false)}>Serviços</a>
              {profile.showGallery && gallery.length > 0 && (
                <a href="#galeria" onClick={() => setMobileMenuOpen(false)}>Galeria</a>
              )}
              <a href="#localizacao" onClick={() => setMobileMenuOpen(false)}>Localização</a>
              <a
                href="#agendar"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-xl px-4 py-2.5 text-center font-semibold text-slate-950"
                style={{ backgroundColor: 'var(--shop-primary)' }}
              >
                Agendar Horário
              </a>
            </div>
          </div>
        )}
      </header>

      {/* 6.2 Hero Section */}
      <section className="relative overflow-hidden border-b border-white/10">
        {profile.coverImageUrl ? (
          <div
            className="absolute inset-0 bg-cover bg-center opacity-35"
            style={{ backgroundImage: `url(${profile.coverImageUrl})` }}
          />
        ) : (
          <div
            className="absolute inset-0 opacity-30"
            style={{
              background: `radial-gradient(circle at top right, ${profile.primaryColor}, ${profile.secondaryColor})`
            }}
          />
        )}
        <div className="relative mx-auto max-w-6xl px-4 py-24 md:py-32">
          <div className="max-w-2xl">
            {profile.tagline && (
              <p
                className="mb-3 text-xs font-bold uppercase tracking-widest"
                style={{ color: 'var(--shop-accent)' }}
              >
                {profile.tagline}
              </p>
            )}
            <h1 className="font-display text-4xl font-bold text-white md:text-6xl">
              {profile.businessName}
            </h1>
            {(profile.heroSubtitle || profile.description) && (
              <p className="mt-5 text-base leading-relaxed text-slate-200 md:text-lg">
                {profile.heroSubtitle || profile.description}
              </p>
            )}
            <div className="mt-8 flex flex-wrap gap-4">
              <a
                href="#agendar"
                className="inline-flex items-center gap-2 rounded-xl px-6 py-3.5 text-sm font-bold text-slate-950 shadow-lg transition hover:opacity-90"
                style={{ backgroundColor: 'var(--shop-primary)' }}
              >
                <Calendar className="h-4 w-4" />
                Agendar Agora
              </a>
              <a
                href="#servicos"
                className="inline-flex items-center gap-2 rounded-xl border border-white/25 bg-black/30 px-6 py-3.5 text-sm font-semibold text-white backdrop-blur hover:bg-black/50"
              >
                Ver Serviços
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* 6.3 Sobre */}
      {(profile.aboutText || profile.description) && (
        <section className="mx-auto max-w-6xl px-4 py-14">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 md:p-10">
            <h2 className="font-display text-2xl font-bold text-white">Sobre Nós</h2>
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-300 md:text-base">
              {profile.aboutText || profile.description}
            </p>
          </div>
        </section>
      )}

      {/* 6.4 Serviços */}
      <section id="servicos" ref={servicesRef} className="mx-auto max-w-6xl px-4 py-14">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-3xl font-bold text-white">Nossos Serviços</h2>
            <p className="mt-1 text-sm text-slate-400">Escolha o atendimento ideal e reserve online</p>
          </div>
          {categories.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSelectedCategory('all')}
                className={`rounded-full px-3.5 py-1.5 text-xs font-medium ${
                  selectedCategory === 'all'
                    ? 'text-slate-950'
                    : 'border border-white/15 text-slate-300'
                }`}
                style={selectedCategory === 'all' ? { backgroundColor: 'var(--shop-primary)' } : {}}
              >
                Todos
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-medium ${
                    selectedCategory === cat.id
                      ? 'text-slate-950'
                      : 'border border-white/15 text-slate-300'
                  }`}
                  style={selectedCategory === cat.id ? { backgroundColor: 'var(--shop-primary)' } : {}}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filteredServices.map((srv) => (
            <div
              key={srv.id}
              className="flex flex-col justify-between overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] transition hover:border-white/25"
            >
              <div>
                {srv.imageUrl && (
                  <img
                    src={srv.imageUrl}
                    alt={srv.name}
                    loading="lazy"
                    className="h-44 w-full object-cover"
                  />
                )}
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-lg font-semibold text-white">{srv.name}</h3>
                    <span
                      className="shrink-0 rounded-lg px-2.5 py-1 text-sm font-bold text-slate-950"
                      style={{ backgroundColor: 'var(--shop-accent)' }}
                    >
                      {formatBRL(srv.priceInCents)}
                    </span>
                  </div>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
                    <Clock className="h-3.5 w-3.5" /> {srv.durationMinutes} minutos
                  </p>
                  {srv.description && (
                    <p className="mt-3 text-sm text-slate-300">{srv.description}</p>
                  )}
                </div>
              </div>
              <div className="border-t border-white/10 p-4">
                <button
                  type="button"
                  onClick={() => {
                    setBookingMode('book');
                    setSelectedServiceId(srv.id);
                    bookingRef.current?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="w-full rounded-xl py-2.5 text-sm font-semibold text-slate-950 transition hover:opacity-90"
                  style={{ backgroundColor: 'var(--shop-primary)' }}
                >
                  Agendar este serviço
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 6.5 Profissionais */}
      {profile.showTeam && professionals.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 py-14">
          <h2 className="font-display mb-8 text-3xl font-bold text-white">Nossa Equipe</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {professionals.map((prof) => (
              <div
                key={prof.id}
                className="flex items-start gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5"
              >
                {prof.photoUrl ? (
                  <img
                    src={prof.photoUrl}
                    alt={prof.name}
                    loading="lazy"
                    className="h-16 w-16 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <div
                    className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-lg font-bold text-slate-950"
                    style={{ backgroundColor: 'var(--shop-primary)' }}
                  >
                    {prof.name.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div>
                  <h3 className="font-semibold text-white">{prof.name}</h3>
                  {prof.specialties && (
                    <p className="text-xs font-medium" style={{ color: 'var(--shop-accent)' }}>
                      {prof.specialties}
                    </p>
                  )}
                  {prof.description && (
                    <p className="mt-2 text-sm text-slate-400">{prof.description}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 6.6 Galeria (Carrossel + Swipe + Lightbox + Lazy loading) */}
      {profile.showGallery && gallery.length > 0 && (
        <section id="galeria" ref={galleryRef} className="mx-auto max-w-6xl px-4 py-14">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="font-display text-3xl font-bold text-white">Galeria</h2>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setGalleryIdx((i) => (i === 0 ? gallery.length - 1 : i - 1))}
                className="rounded-xl border border-white/15 p-2 hover:bg-white/10"
                aria-label="Anterior"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => setGalleryIdx((i) => (i + 1) % gallery.length)}
                className="rounded-xl border border-white/15 p-2 hover:bg-white/10"
                aria-label="Próxima"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div
            className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/40"
            onTouchStart={(e) => {
              touchStartX.current = e.touches[0].clientX;
            }}
            onTouchEnd={(e) => {
              if (touchStartX.current === null) return;
              const diff = e.changedTouches[0].clientX - touchStartX.current;
              if (diff > 40) setGalleryIdx((i) => (i === 0 ? gallery.length - 1 : i - 1));
              else if (diff < -40) setGalleryIdx((i) => (i + 1) % gallery.length);
              touchStartX.current = null;
            }}
          >
            <img
              src={gallery[galleryIdx]?.imageUrl}
              alt={gallery[galleryIdx]?.caption || profile.businessName}
              loading="lazy"
              onClick={() => {
                setLightboxUrl(gallery[galleryIdx].imageUrl);
                setLightboxCaption(gallery[galleryIdx].caption);
              }}
              className="h-80 w-full cursor-zoom-in object-cover md:h-[420px]"
            />
            {gallery[galleryIdx]?.caption && (
              <div className="bg-black/65 px-5 py-3 text-sm text-slate-200">
                {gallery[galleryIdx].caption}
              </div>
            )}
          </div>

          <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
            {gallery.map((img, idx) => (
              <button
                key={img.id}
                type="button"
                onClick={() => setGalleryIdx(idx)}
                className={`h-16 w-24 shrink-0 overflow-hidden rounded-lg border-2 ${
                  idx === galleryIdx ? 'border-amber-400' : 'border-transparent opacity-60'
                }`}
              >
                <img src={img.imageUrl} alt={img.caption} loading="lazy" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            type="button"
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white"
            onClick={() => setLightboxUrl(null)}
          >
            <X className="h-6 w-6" />
          </button>
          <div className="max-w-4xl" onClick={(e) => e.stopPropagation()}>
            <img src={lightboxUrl} alt={lightboxCaption} className="max-h-[80vh] rounded-xl object-contain" />
            {lightboxCaption && (
              <p className="mt-3 text-center text-sm text-slate-300">{lightboxCaption}</p>
            )}
          </div>
        </div>
      )}

      {/* 8. Sistema de Agendamento Online */}
      <section id="agendar" ref={bookingRef} className="mx-auto max-w-4xl px-4 py-16">
        <div className="rounded-3xl border border-white/15 bg-white/[0.04] p-6 md:p-8">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-3xl font-bold text-white">Agendamento Online</h2>
              <p className="text-sm text-slate-400">Reserve em poucos cliques com confirmação imediata</p>
            </div>
            <div className="flex rounded-xl border border-white/15 bg-black/30 p-1 text-xs">
              <button
                type="button"
                onClick={() => setBookingMode('book')}
                className={`rounded-lg px-3 py-1.5 font-semibold ${
                  bookingMode === 'book' ? 'text-slate-950' : 'text-slate-300'
                }`}
                style={bookingMode === 'book' ? { backgroundColor: 'var(--shop-primary)' } : {}}
              >
                Novo Agendamento
              </button>
              <button
                type="button"
                onClick={() => setBookingMode('manage')}
                className={`rounded-lg px-3 py-1.5 font-semibold ${
                  bookingMode === 'manage' ? 'text-slate-950' : 'text-slate-300'
                }`}
                style={bookingMode === 'manage' ? { backgroundColor: 'var(--shop-primary)' } : {}}
              >
                Meus Agendamentos
              </button>
            </div>
          </div>

          {bookingMode === 'book' ? (
            confirmedAppt ? (
              <div className="rounded-2xl border border-emerald-500/40 bg-emerald-950/30 p-6 text-center">
                <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-400" />
                <h3 className="mt-3 text-xl font-bold text-white">Horário Confirmado!</h3>
                <p className="mt-1 text-sm text-slate-300">
                  Código de confirmação:{' '}
                  <span className="font-mono text-base font-bold text-amber-300">
                    {confirmedAppt.confirmationCode}
                  </span>
                </p>
                <div className="mt-4 space-y-1 text-sm text-slate-300">
                  <p>{confirmedAppt.serviceName} ({formatBRL(confirmedAppt.priceInCents)})</p>
                  <p>Profissional: {confirmedAppt.professionalName}</p>
                  <p>Data/Hora: {formatDateTimeBR(confirmedAppt.startAt)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmedAppt(null);
                    setSelectedStartAt('');
                  }}
                  className="mt-6 rounded-xl border border-white/20 px-5 py-2 text-sm font-medium text-white hover:bg-white/10"
                >
                  Fazer outro agendamento
                </button>
              </div>
            ) : (
              <form onSubmit={handleBook} className="space-y-5">
                {bookingError && (
                  <div className="rounded-xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-200">
                    {bookingError}
                  </div>
                )}

                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                      1. Serviço
                    </label>
                    <select
                      value={selectedServiceId}
                      onChange={(e) => setSelectedServiceId(e.target.value)}
                      required
                      className="w-full rounded-xl border border-white/15 bg-slate-900 px-3.5 py-2.5 text-sm text-white"
                    >
                      <option value="">Selecione...</option>
                      {services.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} — {formatBRL(s.priceInCents)} ({s.durationMinutes}m)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                      2. Profissional
                    </label>
                    <select
                      value={selectedProfId}
                      onChange={(e) => setSelectedProfId(e.target.value)}
                      required
                      disabled={!selectedServiceId}
                      className="w-full rounded-xl border border-white/15 bg-slate-900 px-3.5 py-2.5 text-sm text-white disabled:opacity-50"
                    >
                      <option value="">Selecione...</option>
                      {eligibleProfessionals.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                      3. Data
                    </label>
                    <input
                      type="date"
                      value={selectedDate}
                      min={new Date().toISOString().slice(0, 10)}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      required
                      className="w-full rounded-xl border border-white/15 bg-slate-900 px-3.5 py-2.5 text-sm text-white"
                    />
                  </div>
                </div>

                {/* 4. Horários */}
                {selectedServiceId && selectedProfId && (
                  <div>
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                      4. Horários Disponíveis
                    </label>
                    {slotsLoading ? (
                      <p className="text-sm text-slate-400">Calculando horários...</p>
                    ) : slotsError ? (
                      <p className="text-sm text-amber-400">{slotsError}</p>
                    ) : slots.length === 0 ? (
                      <p className="text-sm text-slate-400">Nenhum horário livre nesta data.</p>
                    ) : (
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                        {slots.map((slot) => (
                          <button
                            key={slot.startAt}
                            type="button"
                            onClick={() => setSelectedStartAt(slot.startAt)}
                            className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                              selectedStartAt === slot.startAt
                                ? 'border-transparent text-slate-950'
                                : 'border-white/15 bg-slate-900 text-slate-200 hover:border-white/40'
                            }`}
                            style={
                              selectedStartAt === slot.startAt
                                ? { backgroundColor: 'var(--shop-primary)' }
                                : {}
                            }
                          >
                            {slot.time}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {selectedStartAt && (
                  <div className="space-y-4 border-t border-white/10 pt-5">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                          5. Seu Nome
                        </label>
                        <input
                          required
                          value={customerName}
                          onChange={(e) => setCustomerName(e.target.value)}
                          placeholder="Seu nome completo"
                          className="w-full rounded-xl border border-white/15 bg-slate-900 px-3.5 py-2.5 text-sm text-white"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                          6. Telefone / WhatsApp
                        </label>
                        <input
                          required
                          value={customerPhone}
                          onChange={(e) => setCustomerPhone(e.target.value)}
                          placeholder="(11) 99999-8888"
                          className="w-full rounded-xl border border-white/15 bg-slate-900 px-3.5 py-2.5 text-sm text-white"
                        />
                      </div>
                    </div>
                    <div>
                      <input
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Observação opcional (ex: corte mais baixo nas laterais)"
                        className="w-full rounded-xl border border-white/15 bg-slate-900 px-3.5 py-2.5 text-sm text-white"
                      />
                    </div>

                    <TurnstileWidget siteKey={turnstileSiteKey} onToken={setTurnstileToken} />

                    <button
                      type="submit"
                      disabled={bookingSubmitting}
                      className="w-full rounded-xl py-3.5 text-sm font-bold text-slate-950 transition hover:opacity-90 disabled:opacity-60"
                      style={{ backgroundColor: 'var(--shop-primary)' }}
                    >
                      {bookingSubmitting ? 'Confirmando...' : '7. Confirmar Agendamento'}
                    </button>
                  </div>
                )}
              </form>
            )
          ) : (
            <div className="space-y-4">
              <form onSubmit={handleLookup} className="grid gap-3 sm:grid-cols-3">
                <input
                  required
                  value={lookupCode}
                  onChange={(e) => setLookupCode(e.target.value.toUpperCase())}
                  placeholder="Código (ex: BRB-A1B2C3)"
                  className="rounded-xl border border-white/15 bg-slate-900 px-3.5 py-2.5 text-sm font-mono text-white"
                />
                <input
                  required
                  value={lookupPhone}
                  onChange={(e) => setLookupPhone(e.target.value)}
                  placeholder="Telefone cadastrado"
                  className="rounded-xl border border-white/15 bg-slate-900 px-3.5 py-2.5 text-sm text-white"
                />
                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-950"
                  style={{ backgroundColor: 'var(--shop-primary)' }}
                >
                  <Search className="h-4 w-4" /> Consultar
                </button>
              </form>

              {lookupMessage && (
                <p className="text-sm text-amber-300">{lookupMessage}</p>
              )}

              {lookupResult && (
                <div className="rounded-2xl border border-white/15 bg-slate-900/70 p-5 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-bold text-white">
                        {lookupResult.ServiceName} — {lookupResult.ProfessionalName}
                      </p>
                      <p className="text-slate-300">{formatDateTimeBR(lookupResult.StartAt)}</p>
                    </div>
                    <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase">
                      {lookupResult.Status}
                    </span>
                  </div>

                  {lookupResult.Status === 'confirmed' && (
                    <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="date"
                          value={rescheduleDate}
                          min={new Date().toISOString().slice(0, 10)}
                          onChange={(e) => setRescheduleDate(e.target.value)}
                          className="rounded-lg border border-white/15 bg-slate-950 px-3 py-1.5 text-xs"
                        />
                        <select
                          value={rescheduleStartAt}
                          onChange={(e) => setRescheduleStartAt(e.target.value)}
                          className="rounded-lg border border-white/15 bg-slate-950 px-3 py-1.5 text-xs"
                        >
                          <option value="">Novo horário...</option>
                          {rescheduleSlots.map((s) => (
                            <option key={s.startAt} value={s.startAt}>
                              {s.time}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={!rescheduleStartAt}
                          onClick={() => void handleRescheduleLookup()}
                          className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-950 disabled:opacity-40"
                        >
                          Reagendar
                        </button>
                        {data.settings.allowPublicCancellation && (
                          <button
                            type="button"
                            onClick={() => void handleCancelLookup()}
                            className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-950/40"
                          >
                            Cancelar Horário
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* 6.7 Localização e Horários */}
      <section id="localizacao" ref={locationRef} className="mx-auto max-w-6xl px-4 py-14">
        <div className="grid gap-8 md:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
            <h2 className="font-display text-2xl font-bold text-white">Localização & Horários</h2>
            {addressLine && (
              <p className="mt-4 flex items-start gap-2.5 text-sm text-slate-300">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--shop-accent)' }} />
                <span>{addressLine}</span>
              </p>
            )}
            {(addressLine || (profile.latitude !== null && profile.longitude !== null)) && (
              <a
                href={routeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-950"
                style={{ backgroundColor: 'var(--shop-primary)' }}
              >
                <Navigation className="h-4 w-4" /> Abrir Rota no Mapa
              </a>
            )}

            <div className="mt-6 space-y-2 border-t border-white/10 pt-5 text-sm">
              <h3 className="font-semibold text-white">Horário de Funcionamento</h3>
              {workingHours.map((h) => (
                <div key={h.dayOfWeek} className="flex justify-between text-slate-300">
                  <span>{DAY_NAMES[h.dayOfWeek]}</span>
                  <span>
                    {h.isAvailable
                      ? `${h.startTime} às ${h.endTime}${h.breakStart ? ` (pausa ${h.breakStart}-${h.breakEnd})` : ''}`
                      : 'Fechado'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {profile.showMap && (
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900">
              {profile.latitude !== null && profile.longitude !== null ? (
                <iframe
                  title="Mapa da barbearia"
                  className="h-full min-h-[300px] w-full"
                  loading="lazy"
                  src={`https://www.openstreetmap.org/export/embed.html?bbox=${profile.longitude - 0.006},${profile.latitude - 0.006},${profile.longitude + 0.006},${profile.latitude + 0.006}&layer=mapnik&marker=${profile.latitude},${profile.longitude}`}
                />
              ) : (
                <div className="flex h-full min-h-[260px] flex-col items-center justify-center p-6 text-center text-slate-400">
                  <MapPin className="mb-2 h-8 w-8" style={{ color: 'var(--shop-accent)' }} />
                  <p className="text-sm">{addressLine || 'Endereço comercial em atualização.'}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* 6.8 Contato / Rodapé (somente campos configurados) */}
      <footer className="border-t border-white/10 bg-black/40 px-4 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 md:flex-row">
          <div>
            <p className="font-display text-lg font-bold text-white">{profile.businessName}</p>
            {profile.footerText && <p className="mt-1 text-xs text-slate-400">{profile.footerText}</p>}
          </div>

          <div className="flex flex-wrap items-center gap-4 text-sm text-slate-300">
            {profile.phone && (
              <a href={`tel:${profile.phone}`} className="inline-flex items-center gap-1.5 hover:text-white">
                <Phone className="h-4 w-4" /> {profile.phone}
              </a>
            )}
            {profile.whatsAppNumber && (
              <a
                href={`https://wa.me/${profile.whatsAppNumber.replace(/\D/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300"
              >
                <MessageCircle className="h-4 w-4" /> WhatsApp
              </a>
            )}
            {profile.telegramUsername && (
              <a
                href={`https://t.me/${profile.telegramUsername.replace(/^@/, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sky-400 hover:text-sky-300"
              >
                <Send className="h-4 w-4" /> Telegram
              </a>
            )}
            {profile.instagram && (
              <a
                href={`https://instagram.com/${profile.instagram.replace(/^@/, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-pink-400 hover:text-pink-300"
              >
                <Instagram className="h-4 w-4" /> {profile.instagram}
              </a>
            )}
            {profile.email && (
              <a href={`mailto:${profile.email}`} className="inline-flex items-center gap-1.5 hover:text-white">
                <Mail className="h-4 w-4" /> {profile.email}
              </a>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
