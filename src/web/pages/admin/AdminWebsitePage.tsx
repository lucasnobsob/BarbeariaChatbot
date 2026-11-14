import { useEffect, useState } from 'react';
import { ExternalLink, ImagePlus, Save, Sparkles } from 'lucide-react';
import type { BusinessProfile } from '@shared/types';
import { apiFetch } from '@web/lib/api';
import { uploadOptimizedImage } from '@web/lib/imageOptimizer';
import { useAuth } from '@web/lib/authContext';

export function AdminWebsitePage() {
  const { refreshUser } = useAuth();
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [slug, setSlug] = useState('');
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    apiFetch<{ tenant: { slug: string; status: string }; profile: BusinessProfile }>('/api/admin/website')
      .then((res) => {
        setProfile(res.profile);
        setSlug(res.tenant.slug);
        setStatus(res.tenant.status);
      })
      .catch(() => {});
  }, []);

  const handleUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    folder: 'logos' | 'covers',
    field: 'logoUrl' | 'coverImageUrl'
  ) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    setSaving(true);
    setErr('');
    try {
      const up = await uploadOptimizedImage(file, folder, folder === 'logos' ? 600 : 1600);
      setProfile({ ...profile, [field]: up.url });
      setMsg('Imagem enviada e otimizada em WebP! Clique em Salvar Alterações para publicar.');
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Erro no upload');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    setMsg('');
    setErr('');
    try {
      const res = await apiFetch<{ slug?: string | null }>('/api/admin/website', {
        method: 'PUT',
        body: JSON.stringify({ ...profile, slug })
      });
      if (res.slug) setSlug(res.slug);
      await refreshUser();
      setMsg('Alterações salvas! Seu website público já reflete as atualizações.');
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    setSaving(true);
    try {
      await apiFetch('/api/onboarding/publish', { method: 'POST' });
      setStatus('active');
      await refreshUser();
      setMsg('Website publicado com sucesso!');
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Erro ao publicar');
    } finally {
      setSaving(false);
    }
  };

  if (!profile) {
    return <div className="text-sm text-slate-400">Carregando personalização...</div>;
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Personalizar meu site</h1>
          <p className="text-sm text-slate-400">
            Altere identidade visual, textos, contato e endereço sem mexer em código.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={`/b/${slug}?preview=1`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            <ExternalLink className="h-4 w-4 text-amber-400" /> Visualizar Prévia
          </a>
          {status !== 'active' && (
            <button
              type="button"
              onClick={() => void handlePublish()}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950"
            >
              <Sparkles className="h-4 w-4" /> Publicar Site
            </button>
          )}
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-60"
          >
            <Save className="h-4 w-4" /> {saving ? 'Salvando...' : 'Salvar Alterações'}
          </button>
        </div>
      </div>

      {msg && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-200">
          {msg}
        </div>
      )}
      {err && (
        <div className="rounded-xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          {err}
        </div>
      )}

      {/* Identidade */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-white">Identidade & Aparência</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs text-slate-400">Nome do Estabelecimento</label>
            <input
              value={profile.businessName}
              onChange={(e) => setProfile({ ...profile, businessName: e.target.value })}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="admin-barbershop-slug" className="mb-1 block text-xs text-slate-400">
              Link personalizado (/b/...)
            </label>
            <input
              id="admin-barbershop-slug"
              name="barbershop-slug"
              autoComplete="off"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
              placeholder="nome-da-barbearia"
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-mono"
            />
            <p className="mt-1 text-[11px] text-slate-400">
              URL pública: <span className="text-amber-300">/b/{slug}</span>
            </p>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Template</label>
            <select
              value={profile.templateKey}
              onChange={(e) =>
                setProfile({
                  ...profile,
                  templateKey: e.target.value as BusinessProfile['templateKey']
                })
              }
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
            >
              <option value="classic-luxury">Clássico Premium</option>
              <option value="modern-minimal">Moderno Minimalista</option>
              <option value="urban-studio">Urbano Studio</option>
            </select>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
            <label className="mb-2 block text-xs text-slate-400">Logotipo</label>
            {profile.logoUrl && (
              <img src={profile.logoUrl} alt="Logo" className="mb-3 h-16 w-16 rounded-full object-cover" />
            )}
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs">
              <ImagePlus className="h-4 w-4 text-amber-400" /> Trocar Logotipo
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => void handleUpload(e, 'logos', 'logoUrl')}
              />
            </label>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
            <label className="mb-2 block text-xs text-slate-400">Imagem de Capa</label>
            {profile.coverImageUrl && (
              <img src={profile.coverImageUrl} alt="Capa" className="mb-3 h-20 w-full rounded-lg object-cover" />
            )}
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs">
              <ImagePlus className="h-4 w-4 text-amber-400" /> Trocar Capa
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => void handleUpload(e, 'covers', 'coverImageUrl')}
              />
            </label>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { key: 'primaryColor' as const, label: 'Cor Principal' },
            { key: 'secondaryColor' as const, label: 'Cor Secundária' },
            { key: 'accentColor' as const, label: 'Cor de Destaque' }
          ].map((cField) => (
            <div key={cField.key}>
              <label className="mb-1 block text-xs text-slate-400">{cField.label}</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={profile[cField.key]}
                  onChange={(e) => setProfile({ ...profile, [cField.key]: e.target.value })}
                  className="h-9 w-12 rounded bg-transparent"
                />
                <input
                  value={profile[cField.key]}
                  onChange={(e) => setProfile({ ...profile, [cField.key]: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-mono"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Conteúdo */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-white">Conteúdo do Website</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-slate-400">Frase Principal (Tagline)</label>
            <input
              value={profile.tagline}
              onChange={(e) => setProfile({ ...profile, tagline: e.target.value })}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Texto de Apresentação (Hero)</label>
            <input
              value={profile.heroSubtitle}
              onChange={(e) => setProfile({ ...profile, heroSubtitle: e.target.value })}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-400">Texto da Seção Sobre</label>
          <textarea
            rows={4}
            value={profile.aboutText}
            onChange={(e) => setProfile({ ...profile, aboutText: e.target.value })}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-400">Texto do Rodapé</label>
          <input
            value={profile.footerText}
            onChange={(e) => setProfile({ ...profile, footerText: e.target.value })}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
          />
        </div>
        <div className="flex flex-wrap gap-6 text-sm text-slate-300">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={profile.showTeam}
              onChange={(e) => setProfile({ ...profile, showTeam: e.target.checked })}
            />
            Mostrar Profissionais
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={profile.showGallery}
              onChange={(e) => setProfile({ ...profile, showGallery: e.target.checked })}
            />
            Mostrar Galeria
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={profile.showMap}
              onChange={(e) => setProfile({ ...profile, showMap: e.target.checked })}
            />
            Mostrar Mapa
          </label>
        </div>
      </div>

      {/* Informações comerciais & Endereço */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-3">
          <h2 className="text-lg font-semibold text-white">Contato e Redes Sociais</h2>
          <input placeholder="Telefone" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
          <input placeholder="WhatsApp (ex: 5511999998888)" value={profile.whatsAppNumber} onChange={(e) => setProfile({ ...profile, whatsAppNumber: e.target.value })} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
          <input placeholder="Telegram (@usuario)" value={profile.telegramUsername} onChange={(e) => setProfile({ ...profile, telegramUsername: e.target.value })} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
          <input placeholder="Instagram (@barbearia)" value={profile.instagram} onChange={(e) => setProfile({ ...profile, instagram: e.target.value })} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
          <input placeholder="E-mail comercial" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-3">
          <h2 className="text-lg font-semibold text-white">Endereço</h2>
          <div className="grid grid-cols-3 gap-2">
            <input placeholder="CEP" value={profile.postalCode} onChange={(e) => setProfile({ ...profile, postalCode: e.target.value })} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
            <input placeholder="Cidade" value={profile.city} onChange={(e) => setProfile({ ...profile, city: e.target.value })} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
            <input placeholder="UF" value={profile.state} onChange={(e) => setProfile({ ...profile, state: e.target.value })} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <input placeholder="Rua" value={profile.street} onChange={(e) => setProfile({ ...profile, street: e.target.value })} className="col-span-2 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
            <input placeholder="Número" value={profile.number} onChange={(e) => setProfile({ ...profile, number: e.target.value })} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input placeholder="Bairro" value={profile.neighborhood} onChange={(e) => setProfile({ ...profile, neighborhood: e.target.value })} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
            <input placeholder="Complemento" value={profile.complement} onChange={(e) => setProfile({ ...profile, complement: e.target.value })} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              placeholder="Latitude (ex: -23.56)"
              value={profile.latitude ?? ''}
              onChange={(e) =>
                setProfile({ ...profile, latitude: e.target.value ? Number(e.target.value) : null })
              }
              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
            />
            <input
              placeholder="Longitude (ex: -46.65)"
              value={profile.longitude ?? ''}
              onChange={(e) =>
                setProfile({ ...profile, longitude: e.target.value ? Number(e.target.value) : null })
              }
              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
            />
          </div>
        </div>
      </div>
    </form>
  );
}
