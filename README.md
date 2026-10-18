# Brainstorm

Brainstorm is a local-first dashboard for seeing what an AI coding agent is doing. The current MVP connects a React timeline to an Express and Socket.IO server that generates sample activity events.

> **Status:** Early MVP. The current backend uses an in-memory demo event stream. Reading real Claude Code sessions and persisting events are planned next steps.

## What you can do

- Watch a live timeline of agent activity.
- See total events, file edits, and failures at a glance.
- Inspect normalized event types such as file reads, edits, commands, errors, and test results.
- Connect to the backend over Socket.IO and retrieve the current event list over HTTP.

## Requirements

- Node.js 22 or newer
- npm

## Run locally

From the repository root:

```sh
npm install
npm run dev
```

Open the dashboard at [http://localhost:5173](http://localhost:5173). The backend listens at [http://localhost:3001](http://localhost:3001).

The server seeds sample events at startup and emits another sample event every four seconds. This lets you explore the live timeline without connecting an AI coding agent.

## Backend endpoints

| Endpoint | Description |
| --- | --- |
| `GET /api/health` | Returns server status, uptime, and event count |
| `GET /api/events` | Returns the current sample event list |
| Socket.IO `events:history` | Sends the event history when a client connects |
| Socket.IO `event:new` | Sends each new event to connected clients |

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3001` | Backend HTTP and Socket.IO port |
| `FRONTEND_URL` | `http://localhost:5173` | Frontend origin allowed by backend CORS |
| `VITE_SERVER_URL` | `http://localhost:3001` | Backend address used by the frontend |

For example, to run the backend on another port:

```sh
PORT=4000 npm run dev:server
```

If you change the backend port, set `VITE_SERVER_URL` to the same address for the frontend.

## Workspace commands

| Command | Description |
| --- | --- |
| `npm run dev` | Start frontend and backend together |
| `npm run dev:web` | Start only the frontend |
| `npm run dev:server` | Start only the backend |
| `npm run build` | Build both workspaces |
| `npm run typecheck` | Run workspace type checks that are configured |

## Project layout

```text
apps/
  web/          React dashboard, timeline, and Vite configuration
  server/       Express API and Socket.IO sample event server
packages/
  shared/       Event types and Socket.IO event names
```

## Event flow

```text
Sample event generator
        │
        ▼
 Express + Socket.IO ──► React dashboard
        │
        └── HTTP API
```
