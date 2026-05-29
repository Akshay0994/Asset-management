import React, { useState, useEffect, useCallback, useRef } from 'react';
import { UserProfile } from '../types';
import { LogOut, Shield, ChevronDown } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';

const SESSION_KEY = 'assettrack-it-auth';

/** Password for local sign-in (no backend). */
export const ADMIN_PASSWORD = 'admin';

export type SessionUser = {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
};

export const AuthContext = React.createContext<{
  user: SessionUser | null;
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  login: (password: string) => boolean;
  logout: () => void;
}>({
  user: null,
  profile: null,
  loading: true,
  isAdmin: false,
  login: () => false,
  logout: () => {},
});

const mockProfile: UserProfile = {
  uid: 'local-admin',
  email: 'admin@local',
  displayName: 'Admin',
  photoURL: '',
  role: 'admin',
};

const mockUser: SessionUser = {
  uid: 'local-admin',
  email: 'admin@local',
  displayName: 'Admin',
  photoURL: '',
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loggedIn, setLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      setLoggedIn(sessionStorage.getItem(SESSION_KEY) === 'ok');
    } finally {
      setLoading(false);
    }
  }, []);

  const login = useCallback((password: string) => {
    if (password !== ADMIN_PASSWORD) return false;
    sessionStorage.setItem(SESSION_KEY, 'ok');
    setLoggedIn(true);
    return true;
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem(SESSION_KEY);
    setLoggedIn(false);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user: loggedIn ? mockUser : null,
        profile: loggedIn ? mockProfile : null,
        loading,
        isAdmin: loggedIn,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function LoginForm() {
  const { login } = React.useContext(AuthContext);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    setError(null);
    if (!login(password)) {
      setError('Invalid password. Check with your administrator or refer to the password configured for this deployment.');
    }
  };

  return (
    <form onSubmit={onSubmit} className="w-full max-w-sm mx-auto space-y-6 text-left">
      <div>
        <label htmlFor="login-password" className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
          Password
        </label>
        <input
          id="login-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(ev) => setPassword(ev.target.value)}
          placeholder="Enter workspace password"
          className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50/80 text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm transition-shadow"
        />
      </div>
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2" role="alert">
          {error}
        </p>
      )}
      <motion.button
        type="submit"
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-indigo-600 text-white rounded-xl font-semibold shadow-lg shadow-indigo-900/15 hover:bg-indigo-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
      >
        <Shield size={18} aria-hidden />
        Sign in
      </motion.button>
      <p className="text-xs text-slate-400 text-center leading-relaxed">
        Local-only workspace. Data stays in this browser. Demo password is often <span className="font-mono text-slate-500">admin</span> unless changed in code.
      </p>
    </form>
  );
}

export function UserMenu() {
  const { user, profile, isAdmin, logout } = React.useContext(AuthContext);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!user) return null;

  const displayName = profile?.displayName || user.displayName || 'Administrator';
  const roleLabel = profile?.role ?? (isAdmin ? 'admin' : 'user');
  const email = profile?.email || user.email;

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex items-center gap-2 rounded-xl py-1.5 pl-1 pr-2 transition-colors',
          'hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2',
          open && 'bg-slate-50'
        )}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <div
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600 text-xs font-bold text-white shadow-sm"
          aria-hidden
        >
          {displayName.slice(0, 2).toUpperCase()}
        </div>
        <ChevronDown
          size={16}
          className={cn('hidden text-slate-400 transition-transform sm:block', open && 'rotate-180')}
          aria-hidden
        />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border border-slate-200/80 bg-white py-2 shadow-xl shadow-slate-900/10"
          role="menu"
        >
          <div className="border-b border-slate-100 px-4 pb-3 pt-1">
            <p className="truncate text-sm font-semibold text-slate-900">{displayName}</p>
            <p className="truncate text-xs text-slate-500">{email}</p>
            <div className="mt-2 flex items-center gap-1">
              {isAdmin && <Shield size={12} className="shrink-0 text-indigo-600" aria-hidden />}
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{roleLabel}</span>
            </div>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              logout();
            }}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-red-600 hover:bg-red-50"
          >
            <LogOut size={16} aria-hidden />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
