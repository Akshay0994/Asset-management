/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public base path when hosted under a sub-path (default `/`). */
  readonly VITE_BASE_PATH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
