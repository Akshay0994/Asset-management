# AssetTrack IT

Local-first IT asset and employee inventory for hardware fleet tracking, assignments, warranty status, and Excel import/export. All data is stored in the browser (`localStorage`); no backend required.

## Prerequisites

- Node.js 20+

## Local development

```bash
npm install
cp .env.example .env.local   # optional — dev works without it (password: admin)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Production build

1. Copy the environment template and set a strong password:

   ```bash
   cp .env.example .env.production
   ```

   Edit `.env.production`:

   ```env
   VITE_ADMIN_PASSWORD=your-strong-password-here
   ```

2. Build static assets:

   ```bash
   npm run build
   ```

   Output is in `dist/`.

3. Preview the production build locally:

   ```bash
   npm run preview
   ```

## Deploy

AssetTrack IT is a static SPA. Deploy the `dist/` folder to any static host.

### Vercel

```bash
npm i -g vercel
vercel --prod
```

Set `VITE_ADMIN_PASSWORD` in the Vercel project environment variables. `vercel.json` is included for SPA routing.

### Netlify

Connect the repo or run:

```bash
npm run build
npx netlify deploy --prod --dir=dist
```

Set `VITE_ADMIN_PASSWORD` in Netlify environment variables. `netlify.toml` is included.

### Other hosts (S3, Cloudflare Pages, nginx, etc.)

Upload `dist/` and configure all routes to serve `index.html` (SPA fallback).

If hosting under a sub-path, set `VITE_BASE_PATH` before building (e.g. `VITE_BASE_PATH=/assettrack/`).

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_ADMIN_PASSWORD` | **Yes (production)** | Workspace sign-in password baked in at build time |
| `VITE_BASE_PATH` | No | Base URL path (default `/`) |

## Security notes

- This is a **client-side only** app. The password is embedded in the built JavaScript bundle — suitable for a trusted internal team on a private network, not for public internet exposure without additional auth (e.g. SSO proxy, VPN).
- Data lives in each user's browser. Clearing site data removes inventory.
- Session auth uses `sessionStorage` (cleared when the tab closes).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Development server |
| `npm run build` | Production build → `dist/` |
| `npm run preview` | Serve production build locally |
| `npm run lint` | TypeScript check |
| `npm run clean` | Remove `dist/` |
