# Brainstorm

Brainstorm is a local-first dashboard for viewing activity from AI coding agents. The current MVP serves a sample event stream from an Express and Socket.IO backend and displays it in a React timeline.

## Requirements

- Node.js 22 or newer
- npm

## Run locally

Install dependencies from the repository root, then start both apps:

```sh
npm install
npm run dev
```

The dashboard runs at [http://localhost:5173](http://localhost:5173). The backend health endpoint is [http://localhost:3001/api/health](http://localhost:3001/api/health).

The server streams sample events for the MVP. It accepts `PORT` and `FRONTEND_URL` environment variables; defaults are `3001` and `http://localhost:5173`.

## Workspace commands

- `npm run dev:web` starts the frontend.
- `npm run dev:server` starts the backend.
- `npm run build` builds both workspaces.
- `npm run typecheck` runs available workspace type checks.

## Project layout

- `apps/web` — React dashboard and Vite development server
- `apps/server` — Express API and Socket.IO event stream
- `packages/shared` — shared event types and constants
