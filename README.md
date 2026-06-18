# AssetTrack IT

Local-first IT asset and employee inventory for hardware fleet tracking, assignments, warranty status, and Excel import/export. All data is stored in the browser (`localStorage`); no backend required.

## Prerequisites

- Node.js 20+

## Local development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Production build

```bash
npm run build
```

Output is in `dist/`. Preview locally:

```bash
npm run preview
```

## Deploy

AssetTrack IT is a static SPA. Deploy the `dist/` folder to any static host (Vercel, Netlify, Cloudflare Pages, S3, nginx, etc.).

- **Vercel** — `vercel.json` included for SPA routing
- **Netlify** — `netlify.toml` included

If hosting under a sub-path, set `VITE_BASE_PATH` before building (e.g. `VITE_BASE_PATH=/assettrack/`).

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_BASE_PATH` | No | Base URL path (default `/`) |

## Notes

- Data lives in each user's browser. Clearing site data removes inventory.
- No sign-in required — open the app and start managing assets.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Development server |
| `npm run build` | Production build → `dist/` |
| `npm run preview` | Serve production build locally |
| `npm run lint` | TypeScript check |
| `npm run clean` | Remove `dist/` |
