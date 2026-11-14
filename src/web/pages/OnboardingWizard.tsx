import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  ImagePlus,
  MapPin,
  Palette,
  Plus,
  Rocket,
  Scissors,
  Store,
  Trash2,
  Users
} from 'lucide-react';
import { apiFetch } from '@web/lib/api';
import { useAuth } from '@web/lib/authContext';
import { uploadOptimizedImage } from '@web/lib/imageOptimizer';
import { slugify } from '@shared/schemas';

const STEPS = [
  { id: 1, label: 'Informações', icon: Store },
  { id: 2, label: 'Identidade Visual', icon: Palette },
  { id: 3, label: 'Localização', icon: MapPin },
  { id: 4, label: 'Horários', icon: Clock },
  { id: 5, label: 'Serviços', icon: Scissors },
  { id: 6, label: 'Profissionais', icon: Users },
  { id: 7, label: 'Publicação', icon: Rocket }
];

const DAY_LABELS = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado'
];

export function OnboardingWizard() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [publishedUrl, setPublishedUrl] = useState('');

  // Step 1 & 2 & 3
  const [businessName, setBusinessName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [slugReason, setSlugReason] = useState('');
  const [description, setDescription] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [instagram, setInstagram] = useState('');
  const [whatsAppNumber, setWhatsAppNumber] = useState('');
  const [telegramUsername, setTelegramUsername] = useState('');

  const [logoUrl, setLogoUrl] = useState('');
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#d97706');
  const [secondaryColor, setSecondaryColor] = useState('#0f172a');
  const [accentColor, setAccentColor] = useState('#f59e0b');
  const [templateKey, setTemplateKey] = useState<'classic-luxury' | 'modern-minimal' | 'urban-studio'>('classic-luxury');
  const [tagline, setTagline] = useState('Estilo, precisão e atendimento sob medida.');
  const [showGallery, setShowGallery] = useState(true);
  const [showTeam, setShowTeam] = useState(true);
  const [showMap, setShowMap] = useState(true);

  const [postalCode, setPostalCode] = useState('');
  const [stateUf, setStateUf] = useState('');
  const [city, setCity] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [street, setStreet] = useState('');
  const [number, setNumber] = useState('');
  const [complement, setComplement] = useState('');
  const [latitude, setLatitude] = useState<string>('');
  const [longitude, setLongitude] = useState<string>('');

  // Step 4: Hours
  const [hours, setHours] = useState([
    { dayOfWeek: 0, startTime: '09:00', endTime: '17:00', breakStart: '', breakEnd: '', isAvailable: false },
    { dayOfWeek: 1, startTime: '09:00', endTime: '19:00', breakStart: '12:00', breakEnd: '13:00', isAvailable: false },
    { dayOfWeek: 2, startTime: '09:00', endTime: '19:00', breakStart: '12:00', breakEnd: '13:00', isAvailable: true },
    { dayOfWeek: 3, startTime: '09:00', endTime: '19:00', breakStart: '12:00', breakEnd: '13:00', isAvailable: true },
    { dayOfWeek: 4, startTime: '09:00', endTime: '19:00', breakStart: '12:00', breakEnd: '13:00', isAvailable: true },
    { dayOfWeek: 5, startTime: '09:00', endTime: '20:00', breakStart: '12:00', breakEnd: '13:00', isAvailable: true },
    { dayOfWeek: 6, startTime: '09:00', endTime: '17:00', breakStart: '', breakEnd: '', isAvailable: true }
  ]);

  // Step 5: Initial services
  const [services, setServices] = useState([
    { name: 'Corte Masculino', description: 'Corte na tesoura e máquina com acabamento completo.', priceReais: '45.00', durationMinutes: 45 },
    { name: 'Barba Completa', description: 'Toalha quente, navalha e hidratação.', priceReais: '35.00', durationMinutes: 30 }
  ]);

  // Step 6: Initial professionals
  const [professionals, setProfessionals] = useState([
    { name: 'Carlos Eduardo', specialties: 'Degradê, Navalha, Barba', description: 'Especialista em cortes clássicos e modernos.' }
  ]);

  useEffect(() => {
    if (!user) return;
    if (user.tenantId && user.tenantStatus === 'active') {
      navigate('/admin/dashboard');
    }
  }, [user, navigate]);

  const checkSlugAvailability = async (val: string) => {
    const clean = slugify(val);
    setSlug(clean);
    if (clean.length < 3) {
      setSlugAvailable(false);
      setSlugReason('Mínimo de 3 caracteres');
      return;
    }
    try {
      const res = await apiFetch<{ available: boolean; slug: string; reason: string | null }>(
        `/api/onboarding/check-slug?slug=${encodeURIComponent(clean)}`
      );
      setSlugAvailable(res.available);
      setSlugReason(res.reason || '');
    } catch {
      setSlugAvailable(null);
    }
  };

  const lookupCep = async (cepRaw: string) => {
    const digits = cepRaw.replace(/\D/g, '');
    setPostalCode(cepRaw);
    if (digits.length === 8) {
      try {
        const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
        const data = (await res.json()) as {
          erro?: boolean;
          uf?: string;
          localidade?: string;
          bairro?: string;
          logradouro?: string;
        };
        if (!data.erro) {
          if (data.uf) setStateUf(data.uf);
          if (data.localidade) setCity(data.localidade);
          if (data.bairro) setNeighborhood(data.bairro);
          if (data.logradouro) setStreet(data.logradouro);
        }
      } catch {
        // Optional lookup; user can always type manually
      }
    }
  };

  const handleStep1Next = async () => {
    setError('');
    if (businessName.trim().length < 2) {
      setError('Informe o nome da barbearia.');
      return;
    }
    setSaving(true);
    try {
      if (!user?.tenantId) {
        const res = await apiFetch<{ tenant: { slug: string } }>('/api/onboarding/start', {
          method: 'POST',
          body: JSON.stringify({
            businessName,
            slug: slug || slugify(businessName),
            description,
            phone,
            email,
            instagram,
            whatsAppNumber,
            telegramUsername
          })
        });
        setSlug(res.tenant.slug);
        await refreshUser();
      }
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar dados iniciais');
    } finally {
      setSaving(false);
    }
  };

  const handleUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    folder: 'logos' | 'covers',
    setter: (url: string) => void
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setSaving(true);
    try {
      const uploaded = await uploadOptimizedImage(file, folder, folder === 'logos' ? 600 : 1600);
      setter(uploaded.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro no upload');
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    setError('');
    setSaving(true);
    try {
      const parsedServices = services
        .filter((s) => s.name.trim().length >= 2)
        .map((s) => ({
          name: s.name.trim(),
          description: s.description.trim(),
          priceInCents: Math.max(0, Math.round(parseFloat(s.priceReais.replace(',', '.') || '0') * 100)),
          durationMinutes: Math.max(5, Number(s.durationMinutes) || 30),
          imageUrl: '',
          isActive: true
        }));

      const parsedProfs = professionals
        .filter((p) => p.name.trim().length >= 2)
        .map((p) => ({
          name: p.name.trim(),
          specialties: p.specialties.trim(),
          description: p.description.trim(),
          photoUrl: '',
          isActive: true,
          serviceIds: []
        }));

      const res = await apiFetch<{ publicUrl: string; tenant: { slug: string } }>(
        '/api/onboarding/complete',
        {
          method: 'POST',
          body: JSON.stringify({
            profile: {
              businessName,
              slug: slug || slugify(businessName),
              tagline,
              heroSubtitle: description,
              description,
              aboutText: description,
              footerText: `${businessName} — Todos os direitos reservados.`,
              templateKey,
              logoUrl,
              coverImageUrl,
              primaryColor,
              secondaryColor,
              accentColor,
              showGallery,
              showTeam,
              showMap,
              phone,
              whatsAppNumber,
              telegramUsername,
              email,
              instagram,
              postalCode,
              street,
              number,
              neighborhood,
              city,
              state: stateUf,
              complement,
              latitude: latitude ? Number(latitude) : null,
              longitude: longitude ? Number(longitude) : null
            },
            workingHours: hours.map((h) => ({
              dayOfWeek: h.dayOfWeek,
              startTime: h.startTime,
              endTime: h.endTime,
              breakStart: h.breakStart || null,
              breakEnd: h.breakEnd || null,
              isAvailable: h.isAvailable
            })),
            services: parsedServices,
            professionals: parsedProfs,
            publish: true
          })
        }
      );

      await refreshUser();
      setPublishedUrl(res.publicUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao publicar barbearia');
    } finally {
      setSaving(false);
    }
  };

  if (publishedUrl) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-12">
        <div className="w-full max-w-lg rounded-2xl border border-emerald-500/40 bg-slate-900 p-8 text-center shadow-2xl">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-400">
            <Rocket className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold text-white">Barbearia Publicada!</h1>
          <p className="mt-2 text-sm text-slate-300">
            Seu website público já está no ar com agendamento online pronto para receber clientes.
          </p>
          <div className="mt-6 rounded-xl border border-slate-700 bg-slate-950 p-4">
            <span className="text-xs text-slate-400">Link exclusivo da sua barbearia:</span>
            <p className="mt-1 font-mono text-sm font-semibold text-amber-400">
              {window.location.origin}
              {publishedUrl}
            </p>
          </div>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link
              to={publishedUrl}
              target="_blank"
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-700"
            >
              <ExternalLink className="h-4 w-4" />
              Abrir Meu Site
            </Link>
            <button
              onClick={() => navigate('/admin/dashboard')}
              className="flex-1 rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-amber-400"
            >
              Ir para o Painel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-white md:text-3xl">Configuração Inicial da Barbearia</h1>
          <p className="mt-1 text-sm text-slate-400">
            Complete as 7 etapas para gerar seu website público e sistema de agendamento.
          </p>
        </div>

        {/* Stepper */}
        <div className="mb-8 grid grid-cols-4 gap-2 sm:grid-cols-7">
          {STEPS.map((s) => {
            const Icon = s.icon;
            const active = s.id === step;
            const done = s.id < step;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  if (s.id < step || user?.tenantId) setStep(s.id);
                }}
                className={`flex flex-col items-center gap-1.5 rounded-xl border p-2.5 text-xs transition ${
                  active
                    ? 'border-amber-500 bg-amber-500/15 text-amber-300'
                    : done
                      ? 'border-emerald-500/40 bg-emerald-950/30 text-emerald-300'
                      : 'border-slate-800 bg-slate-900/50 text-slate-500'
                }`}
              >
                {done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                <span className="truncate font-medium">{s.label}</span>
              </button>
            );
          })}
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 md:p-8">
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-white">Etapa 1 — Informações Básicas</h2>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm text-slate-300">Nome da Barbearia *</label>
                  <input
                    name="barbershop-name"
                    autoComplete="organization"
                    value={businessName}
                    onChange={(e) => {
                      setBusinessName(e.target.value);
                      if (!user?.tenantId && !slugManuallyEdited) {
                        void checkSlugAvailability(e.target.value);
                      }
                    }}
                    placeholder="Ex: Barbearia Dom Pedro"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label htmlFor="barbershop-slug" className="mb-1 block text-sm text-slate-300">
                    Link personalizado (/b/...)
                  </label>
                  <input
                    id="barbershop-slug"
                    name="barbershop-slug"
                    autoComplete="off"
                    value={slug}
                    onChange={(e) => {
                      setSlugManuallyEdited(true);
                      void checkSlugAvailability(e.target.value);
                    }}
                    placeholder="barbearia-dom-pedro"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm font-mono text-white outline-none focus:border-amber-500"
                  />
                  {slugAvailable === true && (
                    <p className="mt-1 text-xs text-emerald-400">Disponível: /b/{slug}</p>
                  )}
                  {slugAvailable === false && (
                    <p className="mt-1 text-xs text-red-400">{slugReason}</p>
                  )}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm text-slate-300">Descrição da Barbearia</label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Conte a história, estilo e diferenciais da sua barbearia..."
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                <div>
                  <label className="mb-1 block text-sm text-slate-300">Telefone</label>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(11) 99999-8888"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-slate-300">WhatsApp</label>
                  <input
                    value={whatsAppNumber}
                    onChange={(e) => setWhatsAppNumber(e.target.value)}
                    placeholder="5511999998888"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-slate-300">E-mail Comercial</label>
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="contato@barbearia.com"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-slate-300">Instagram</label>
                  <input
                    value={instagram}
                    onChange={(e) => setInstagram(e.target.value)}
                    placeholder="@suabarbearia"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-slate-300">Telegram (opcional)</label>
                  <input
                    value={telegramUsername}
                    onChange={(e) => setTelegramUsername(e.target.value)}
                    placeholder="@SeuBotOuCanal"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white outline-none focus:border-amber-500"
                  />
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <h2 className="text-xl font-semibold text-white">Etapa 2 — Identidade Visual</h2>
              <div className="grid gap-6 md:grid-cols-2">
                <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                  <label className="mb-2 block text-sm font-medium text-slate-200">Logotipo</label>
                  {logoUrl && (
                    <img src={logoUrl} alt="Logo preview" className="mb-3 h-20 w-20 rounded-xl object-cover" />
                  )}
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800">
                    <ImagePlus className="h-4 w-4 text-amber-400" />
                    Enviar Logotipo (WebP otimizado)
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => void handleUpload(e, 'logos', setLogoUrl)}
                    />
                  </label>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                  <label className="mb-2 block text-sm font-medium text-slate-200">Imagem de Capa (Hero)</label>
                  {coverImageUrl && (
                    <img src={coverImageUrl} alt="Cover preview" className="mb-3 h-24 w-full rounded-xl object-cover" />
                  )}
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800">
                    <ImagePlus className="h-4 w-4 text-amber-400" />
                    Enviar Capa
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => void handleUpload(e, 'covers', setCoverImageUrl)}
                    />
                  </label>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-sm text-slate-300">Cor Principal</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="h-10 w-14 rounded bg-transparent" />
                    <input value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono" />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-sm text-slate-300">Cor Secundária</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={secondaryColor} onChange={(e) => setSecondaryColor(e.target.value)} className="h-10 w-14 rounded bg-transparent" />
                    <input value={secondaryColor} onChange={(e) => setSecondaryColor(e.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono" />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-sm text-slate-300">Cor de Destaque</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} className="h-10 w-14 rounded bg-transparent" />
                    <input value={accentColor} onChange={(e) => setAccentColor(e.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono" />
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm text-slate-300">Estilo Visual</label>
                  <select
                    value={templateKey}
                    onChange={(e) => setTemplateKey(e.target.value as typeof templateKey)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white"
                  >
                    <option value="classic-luxury">Clássico Premium (Luxury)</option>
                    <option value="modern-minimal">Moderno Minimalista</option>
                    <option value="urban-studio">Urbano Studio</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm text-slate-300">Frase de Apresentação (Hero)</label>
                  <input
                    value={tagline}
                    onChange={(e) => setTagline(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-6 pt-2 text-sm text-slate-300">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={showTeam} onChange={(e) => setShowTeam(e.target.checked)} />
                  Exibir seção Equipe
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={showGallery} onChange={(e) => setShowGallery(e.target.checked)} />
                  Exibir seção Galeria
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={showMap} onChange={(e) => setShowMap(e.target.checked)} />
                  Exibir Mapa de localização
                </label>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-white">Etapa 3 — Localização</h2>
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-sm text-slate-300">CEP</label>
                  <input
                    value={postalCode}
                    onChange={(e) => void lookupCep(e.target.value)}
                    placeholder="01310-100"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-slate-300">Estado (UF)</label>
                  <input
                    value={stateUf}
                    onChange={(e) => setStateUf(e.target.value)}
                    placeholder="SP"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-slate-300">Cidade</label>
                  <input
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="São Paulo"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-sm text-slate-300">Bairro</label>
                  <input value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white" />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-sm text-slate-300">Rua / Avenida</label>
                  <input value={street} onChange={(e) => setStreet(e.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white" />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-4">
                <div>
                  <label className="mb-1 block text-sm text-slate-300">Número</label>
                  <input value={number} onChange={(e) => setNumber(e.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white" />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-slate-300">Complemento</label>
                  <input value={complement} onChange={(e) => setComplement(e.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white" />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-slate-300">Latitude (opcional)</label>
                  <input value={latitude} onChange={(e) => setLatitude(e.target.value)} placeholder="-23.5616" className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white" />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-slate-300">Longitude (opcional)</label>
                  <input value={longitude} onChange={(e) => setLongitude(e.target.value)} placeholder="-46.6559" className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white" />
                </div>
              </div>

              {latitude && longitude && !Number.isNaN(Number(latitude)) && !Number.isNaN(Number(longitude)) && (
                <div className="overflow-hidden rounded-xl border border-slate-800">
                  <iframe
                    title="Mapa da barbearia"
                    className="h-56 w-full"
                    src={`https://www.openstreetmap.org/export/embed.html?bbox=${Number(longitude) - 0.005},${Number(latitude) - 0.005},${Number(longitude) + 0.005},${Number(latitude) + 0.005}&layer=mapnik&marker=${latitude},${longitude}`}
                  />
                </div>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-white">Etapa 4 — Horários de Funcionamento</h2>
              <div className="space-y-2.5">
                {hours.map((h, idx) => (
                  <div
                    key={h.dayOfWeek}
                    className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm"
                  >
                    <label className="flex w-36 items-center gap-2 font-medium text-white">
                      <input
                        type="checkbox"
                        checked={h.isAvailable}
                        onChange={(e) => {
                          const next = [...hours];
                          next[idx] = { ...h, isAvailable: e.target.checked };
                          setHours(next);
                        }}
                      />
                      {DAY_LABELS[h.dayOfWeek]}
                    </label>
                    {h.isAvailable ? (
                      <>
                        <input
                          type="time"
                          value={h.startTime}
                          onChange={(e) => {
                            const next = [...hours];
                            next[idx] = { ...h, startTime: e.target.value };
                            setHours(next);
                          }}
                          className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5"
                        />
                        <span className="text-slate-400">às</span>
                        <input
                          type="time"
                          value={h.endTime}
                          onChange={(e) => {
                            const next = [...hours];
                            next[idx] = { ...h, endTime: e.target.value };
                            setHours(next);
                          }}
                          className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5"
                        />
                        <span className="text-xs text-slate-400">Intervalo:</span>
                        <input
                          type="time"
                          value={h.breakStart}
                          onChange={(e) => {
                            const next = [...hours];
                            next[idx] = { ...h, breakStart: e.target.value };
                            setHours(next);
                          }}
                          className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs"
                        />
                        <input
                          type="time"
                          value={h.breakEnd}
                          onChange={(e) => {
                            const next = [...hours];
                            next[idx] = { ...h, breakEnd: e.target.value };
                            setHours(next);
                          }}
                          className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs"
                        />
                      </>
                    ) : (
                      <span className="text-slate-500">Fechado</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-white">Etapa 5 — Primeiros Serviços</h2>
                <button
                  type="button"
                  onClick={() =>
                    setServices([
                      ...services,
                      { name: '', description: '', priceReais: '40.00', durationMinutes: 30 }
                    ])
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-amber-300 hover:bg-slate-700"
                >
                  <Plus className="h-3.5 w-3.5" /> Adicionar Serviço
                </button>
              </div>
              <div className="space-y-3">
                {services.map((srv, idx) => (
                  <div key={idx} className="grid gap-3 rounded-xl border border-slate-800 bg-slate-950 p-4 md:grid-cols-12">
                    <input
                      placeholder="Nome do serviço"
                      value={srv.name}
                      onChange={(e) => {
                        const next = [...services];
                        next[idx] = { ...srv, name: e.target.value };
                        setServices(next);
                      }}
                      className="md:col-span-4 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                    />
                    <input
                      placeholder="Preço (R$)"
                      value={srv.priceReais}
                      onChange={(e) => {
                        const next = [...services];
                        next[idx] = { ...srv, priceReais: e.target.value };
                        setServices(next);
                      }}
                      className="md:col-span-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                    />
                    <input
                      type="number"
                      placeholder="Minutos"
                      value={srv.durationMinutes}
                      onChange={(e) => {
                        const next = [...services];
                        next[idx] = { ...srv, durationMinutes: Number(e.target.value) };
                        setServices(next);
                      }}
                      className="md:col-span-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                    />
                    <input
                      placeholder="Descrição curta"
                      value={srv.description}
                      onChange={(e) => {
                        const next = [...services];
                        next[idx] = { ...srv, description: e.target.value };
                        setServices(next);
                      }}
                      className="md:col-span-3 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setServices(services.filter((_, i) => i !== idx))}
                      className="flex items-center justify-center rounded-lg text-red-400 hover:bg-red-950/40"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 6 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-white">Etapa 6 — Profissionais</h2>
                <button
                  type="button"
                  onClick={() =>
                    setProfessionals([
                      ...professionals,
                      { name: '', specialties: '', description: '' }
                    ])
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-amber-300 hover:bg-slate-700"
                >
                  <Plus className="h-3.5 w-3.5" /> Adicionar Profissional
                </button>
              </div>
              <div className="space-y-3">
                {professionals.map((p, idx) => (
                  <div key={idx} className="grid gap-3 rounded-xl border border-slate-800 bg-slate-950 p-4 md:grid-cols-12">
                    <input
                      placeholder="Nome do barbeiro"
                      value={p.name}
                      onChange={(e) => {
                        const next = [...professionals];
                        next[idx] = { ...p, name: e.target.value };
                        setProfessionals(next);
                      }}
                      className="md:col-span-4 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                    />
                    <input
                      placeholder="Especialidades (ex: Degradê, Barba)"
                      value={p.specialties}
                      onChange={(e) => {
                        const next = [...professionals];
                        next[idx] = { ...p, specialties: e.target.value };
                        setProfessionals(next);
                      }}
                      className="md:col-span-4 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                    />
                    <input
                      placeholder="Biografia curta"
                      value={p.description}
                      onChange={(e) => {
                        const next = [...professionals];
                        next[idx] = { ...p, description: e.target.value };
                        setProfessionals(next);
                      }}
                      className="md:col-span-3 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setProfessionals(professionals.filter((_, i) => i !== idx))}
                      className="flex items-center justify-center rounded-lg text-red-400 hover:bg-red-950/40"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 7 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-white">Etapa 7 — Revisão e Publicação</h2>
              <div className="grid gap-4 rounded-xl border border-slate-800 bg-slate-950 p-5 text-sm md:grid-cols-2">
                <div>
                  <span className="text-slate-400">Estabelecimento:</span>
                  <p className="font-semibold text-white">{businessName}</p>
                </div>
                <div>
                  <span className="text-slate-400">URL Pública:</span>
                  <p className="font-mono text-amber-400">/b/{slug || slugify(businessName)}</p>
                </div>
                <div>
                  <span className="text-slate-400">Serviços cadastrados:</span>
                  <p className="font-semibold text-white">{services.filter((s) => s.name.trim()).length}</p>
                </div>
                <div>
                  <span className="text-slate-400">Profissionais:</span>
                  <p className="font-semibold text-white">{professionals.filter((p) => p.name.trim()).length}</p>
                </div>
              </div>
              <p className="text-xs text-slate-400">
                Ao clicar em Publicar Barbearia, seu site público será ativado automaticamente e você
                poderá personalizar galeria, chatbot e regras avançadas no painel administrativo.
              </p>
            </div>
          )}

          {/* Footer actions */}
          <div className="mt-8 flex items-center justify-between border-t border-slate-800 pt-5">
            <button
              type="button"
              disabled={step === 1 || saving}
              onClick={() => setStep(step - 1)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" /> Voltar
            </button>

            {step === 1 ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleStep1Next()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-6 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-60"
              >
                {saving ? 'Salvando...' : 'Próximo'} <ChevronRight className="h-4 w-4" />
              </button>
            ) : step < 7 ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => setStep(step + 1)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-6 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400"
              >
                Próximo <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                disabled={saving}
                onClick={() => void handlePublish()}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-6 py-2.5 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
              >
                <Rocket className="h-4 w-4" />
                {saving ? 'Publicando...' : 'Publicar Barbearia'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
