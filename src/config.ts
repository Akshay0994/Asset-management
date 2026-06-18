export const APP_NAME = 'AssetTrack IT';

/** Set `VITE_ADMIN_PASSWORD` at build time for production. Dev falls back to `admin`. */
export const ADMIN_PASSWORD =
  import.meta.env.VITE_ADMIN_PASSWORD ?? (import.meta.env.DEV ? 'admin' : '');

export const isAuthConfigured = ADMIN_PASSWORD.length > 0;
