import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Scissors } from 'lucide-react';
import { loginSchema } from '@shared/schemas';
import { apiFetch } from '@web/lib/api';
import { useAuth } from '@web/lib/authContext';
import { TurnstileWidget } from '@web/components/TurnstileWidget';
import type { AuthUser } from '@shared/types';
import { z } from 'zod';

type LoginForm = z.infer<typeof loginSchema>;

export function LoginPage() {
  const navigate = useNavigate();
  const { setUser, turnstileSiteKey } = useAuth();
  const [turnstileToken, setTurnstileToken] = useState('');
  const [serverError, setServerError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema)
  });

  const onSubmit = async (values: LoginForm) => {
    setServerError('');
    try {
      const data = await apiFetch<{ user: AuthUser }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ ...values, turnstileToken })
      });
      setUser(data.user);
      if (data.user.isSuperAdmin && !data.user.tenantId) {
        navigate('/superadmin');
      } else if (!data.user.tenantId) {
        navigate('/admin/onboarding');
      } else {
        navigate('/admin/dashboard');
      }
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Erro ao entrar');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-xl">
        <div className="mb-6 text-center">
          <Link to="/" className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500 text-slate-950">
            <Scissors className="h-6 w-6" />
          </Link>
          <h1 className="text-2xl font-bold text-white">Acessar Painel</h1>
          <p className="mt-1 text-sm text-slate-400">Entre para gerenciar sua barbearia</p>
        </div>

        {serverError && (
          <div className="mb-4 rounded-lg border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-200">
            {serverError}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-300">E-mail</label>
            <input
              type="email"
              {...register('email')}
              placeholder="voce@barbearia.com"
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white outline-none focus:border-amber-500"
            />
            {errors.email && <p className="mt-1 text-xs text-red-400">{errors.email.message}</p>}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-300">Senha</label>
            <input
              type="password"
              {...register('password')}
              placeholder="••••••••"
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white outline-none focus:border-amber-500"
            />
            {errors.password && <p className="mt-1 text-xs text-red-400">{errors.password.message}</p>}
          </div>

          <TurnstileWidget siteKey={turnstileSiteKey} onToken={setTurnstileToken} />

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-xl bg-amber-500 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-400 disabled:opacity-60"
          >
            {isSubmitting ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-400">
          Ainda não tem conta?{' '}
          <Link to="/register" className="font-semibold text-amber-400 hover:text-amber-300">
            Cadastre sua barbearia
          </Link>
        </p>
      </div>
    </div>
  );
}
