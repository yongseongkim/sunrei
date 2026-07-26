'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import axios from 'axios';
import { Loader2, LogOut } from 'lucide-react';
import { config } from '@/lib/config';
import { useAuthStore } from '@/stores/auth-store';
import { useUiStore } from '@/stores/ui-store';
import { Avatar } from '@/components/wf';
import { cn } from '@/lib/utils';

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (opts: unknown) => { requestAccessToken: () => void };
        };
      };
    };
  }
}

/** 4-color Google "G". */
function GoogleG({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className="shrink-0">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

/**
 * Google Identity Services token-client sign-in → POST /api/auth/google → store
 * the session (same flow the admin app uses). The account chooser that opens is
 * browser/OS chrome, not our UI.
 */
export function useGoogleLogin(onSuccess?: () => void) {
  const setSession = useAuthStore((s) => s.setSession);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const login = async () => {
    setError(false);
    setLoading(true);
    try {
      // Google Maps also owns window.google, so check for the GIS namespace
      // specifically — otherwise the GSI script is never loaded on map pages.
      if (!window.google?.accounts?.oauth2) {
        await new Promise<void>((resolve, reject) => {
          const sc = document.createElement('script');
          sc.src = 'https://accounts.google.com/gsi/client';
          sc.onload = () => resolve();
          sc.onerror = () => reject(new Error('gis'));
          document.head.appendChild(sc);
        });
      }
      const client = window.google?.accounts?.oauth2?.initTokenClient({
        client_id: config.googleAuth.clientId,
        scope: 'openid email profile',
        callback: async (resp: { access_token?: string; error?: string }) => {
          if (resp.access_token) {
            try {
              const r = await axios.post(`${config.api.baseUrl}/api/auth/google`, {
                idToken: resp.access_token,
              });
              setSession(r.data.user, r.data.token);
              onSuccess?.();
            } catch {
              setError(true);
            } finally {
              setLoading(false);
            }
          } else {
            setError(true);
            setLoading(false);
          }
        },
        error_callback: () => {
          setError(true);
          setLoading(false);
        },
      });
      if (!client) throw new Error('gis');
      client.requestAccessToken();
    } catch {
      setError(true);
      setLoading(false);
    }
  };

  return { login, loading, error };
}

function GoogleButton({ full, onClick, loading }: { full?: boolean; onClick: () => void; loading?: boolean }) {
  const t = useTranslations('auth');
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={cn(
        'inline-flex items-center justify-center gap-2.5 rounded-[10px] border border-[#dadce0] bg-white px-4 py-2.5',
        'text-[13.5px] font-semibold text-[#3c4043] shadow-sm hover:bg-[#f8f9fa] disabled:opacity-60',
        full && 'w-full py-3 text-[14.5px]'
      )}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleG size={full ? 20 : 17} />}
      {t('signIn')}
    </button>
  );
}

/** Header auth control — the sign-in button, or the account chip + dropdown. */
export function AuthControl({ variant = 'header' }: { variant?: 'header' | 'mobile' }) {
  const t = useTranslations('auth');
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const setLoginOpen = useUiStore((s) => s.setLoginOpen);
  const [menuOpen, setMenuOpen] = useState(false);

  if (!user) {
    if (variant === 'mobile') {
      return (
        <button
          type="button"
          onClick={() => setLoginOpen(true)}
          aria-label={t('signIn')}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line2 bg-card text-ink2 shadow-[0_2px_8px_rgba(0,0,0,0.1)]"
        >
          <svg width="19" height="19" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
            <circle cx="10" cy="6.5" r="3.2" />
            <path d="M3.8 16.5c0-3.2 2.8-5 6.2-5s6.2 1.8 6.2 5" strokeLinecap="round" />
          </svg>
        </button>
      );
    }
    return (
      <button
        type="button"
        onClick={() => setLoginOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full border border-[#dadce0] bg-white px-2.5 py-1.5 text-[12px] font-semibold text-[#3c4043] shadow-sm hover:bg-[#f8f9fa]"
      >
        <GoogleG size={15} />
        {t('signIn')}
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        className={cn(
          'inline-flex items-center gap-2 rounded-full border py-1 pl-1 pr-2.5',
          menuOpen ? 'border-primary bg-accent-soft' : 'border-line2 bg-card'
        )}
      >
        <Avatar label={user.name || user.email} size={variant === 'mobile' ? 30 : 26} />
        {variant === 'header' && (
          <span className="max-w-[90px] truncate text-[12.5px] font-bold text-foreground">
            {user.name || user.email}
          </span>
        )}
        <span className={cn('text-[9px] text-ink3 transition-transform', menuOpen && 'rotate-180')}>▾</span>
      </button>
      {menuOpen && (
        <>
          <button
            type="button"
            aria-hidden
            onClick={() => setMenuOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-60 overflow-hidden rounded-xl border border-line2 bg-card shadow-[0_14px_40px_rgba(0,0,0,0.2)]">
            <div className="flex items-center gap-2.5 border-b border-line px-4 py-3.5">
              <Avatar label={user.name || user.email} size={38} />
              <div className="min-w-0">
                <div className="truncate text-[13px] font-extrabold text-foreground">
                  {user.name || user.email}
                </div>
                <div className="truncate text-[11.5px] text-ink3">{user.email}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 px-4 py-2.5 text-[11.5px] text-ink3">
              <GoogleG size={14} /> {t('connected')}
            </div>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                logout();
              }}
              className="flex w-full items-center gap-2 border-t border-line px-4 py-3 text-left text-[13px] font-bold text-foreground hover:bg-bg2"
            >
              <LogOut className="h-4 w-4" /> {t('logout')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** Sign-in modal (§6) — our card; the Google chooser that follows is browser chrome. */
export function LoginModal() {
  const t = useTranslations('auth');
  const open = useUiStore((s) => s.loginOpen);
  const setLoginOpen = useUiStore((s) => s.setLoginOpen);
  const { login, loading, error } = useGoogleLogin(() => setLoginOpen(false));
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/35 sm:items-center sm:p-4"
      onClick={() => setLoginOpen(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[384px] rounded-t-2xl bg-card p-8 pb-7 text-center shadow-2xl sm:rounded-2xl"
      >
        <div className="mx-auto grid h-[46px] w-[46px] place-items-center rounded-xl bg-primary">
          <span className="h-[22px] w-[22px] rounded-md bg-white/90" />
        </div>
        <h2 className="mt-4 text-[20px] font-extrabold tracking-tight text-foreground">{t('signInTitle')}</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-ink2">{t('signInBody')}</p>
        <div className="mt-5">
          <GoogleButton full onClick={login} loading={loading} />
        </div>
        {error ? (
          <p className="mt-2.5 text-[11.5px] font-semibold text-destructive">{t('failed')}</p>
        ) : (
          <p className="mt-2.5 text-[11px] leading-snug text-ink3">{t('signInNote')}</p>
        )}
        <button
          type="button"
          onClick={() => setLoginOpen(false)}
          className="mt-4 text-[12.5px] font-bold text-ink3 hover:text-foreground"
        >
          {t('later')}
        </button>
      </div>
    </div>
  );
}
