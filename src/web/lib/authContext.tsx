import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { AuthUser } from '@shared/types';
import { apiFetch } from './api';

interface AuthContextValue {
  user: AuthUser | null;
  turnstileSiteKey: string;
  loading: boolean;
  refreshUser: () => Promise<AuthUser | null>;
  logout: () => Promise<void>;
  setUser: React.Dispatch<React.SetStateAction<AuthUser | null>>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [turnstileSiteKey, setTurnstileSiteKey] = useState('1x00000000000000000000AA');
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const data = await apiFetch<{ user: AuthUser | null; turnstileSiteKey?: string }>(
        '/api/auth/me'
      );
      setUser(data.user);
      if (data.turnstileSiteKey) setTurnstileSiteKey(data.turnstileSiteKey);
      return data.user;
    } catch {
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  const logout = useCallback(async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, turnstileSiteKey, loading, refreshUser, logout, setUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
