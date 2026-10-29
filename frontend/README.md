# JobRadar AI — Frontend

React 19 + TypeScript + Vite + Tailwind CSS v4 single-page app for JobRadar AI.

## Develop

```bash
npm install
npm run dev        # http://localhost:5173 — /api is proxied to http://127.0.0.1:8000
```

Start the FastAPI backend on port 8000 first.

## Build

```bash
npm run build      # type-checks, then outputs static files to frontend/dist
npm run preview    # optional: serve the built files locally
```

The backend serves `frontend/dist` with SPA fallback. All API calls use relative `/api/...` URLs, so no extra configuration is needed.

## Layout

- `src/api.ts`: typed API client and contract types
- `src/pages/`: Jobs dashboard, job page (mobile), company, resume, settings
- `src/components/`: job card, detail drawer and tabs, shared UI primitives
- `src/lib/`: date formatting, theme, hooks, cross-component events
