/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Workspace sign-in password (required for production builds). */
  readonly VITE_ADMIN_PASSWORD?: string;
  /** Public base path when hosted under a sub-path (default `/`). */
  readonly VITE_BASE_PATH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
