# Brainstorm

Brainstorm is a local-first dashboard for understanding what Claude Code does in a project. It reads Claude Code session logs, stores normalized activity in SQLite, and streams updates to a React dashboard.

## Languages and tools

- **TypeScript** is the main application language for the React frontend, Express backend, and shared event types.
- **CSS** styles the dashboard and its responsive layouts.
- **HTML** provides the Vite app entry point.
- **Python** is used by a development-only log inspection utility; it is not part of the application runtime.

The frontend uses React, Vite, Socket.IO Client, and React Flow. The backend uses Node.js, Express, Socket.IO, SQLite (`better-sqlite3`), and Chokidar to watch session logs.

## Features

- **Live timeline:** Browse, search, and filter agent activity, including file reads and edits, commands, errors, tests, and session events.
- **Codebase map:** Scan a project’s JavaScript and TypeScript imports and view the dependency graph. Recently changed files can be highlighted from recorded activity.
- **Failure tracking:** Group repeated tool errors, inspect their evidence, and mark groups as resolved.
- **Change explorer:** Review activity for a file and ask why it changed. Claude powered answers are optional; recorded evidence remains available without an API key.
- **Local storage:** Keep sessions, events, failure records, dependency edges, and summaries in a local SQLite database.
- **Demo mode:** Generate sample events when you want to explore the dashboard without a live Claude Code session.

## How it works

1. **Load session history.** When the backend starts, it reads existing Claude Code JSONL session files from `~/.claude/projects` (or `CLAUDE_LOGS_DIR`).
2. **Watch for new activity.** Chokidar follows session files as Claude Code appends new entries. The parser converts those entries into shared Brainstorm events such as file reads, edits, commands, and errors.
3. **Store events locally.** The server writes sessions and events to the SQLite database. Event IDs make repeated reads safe when the server restarts. Tool failures are grouped so recurring errors can be reviewed together.
4. **Serve and stream updates.** Express provides the HTTP API. Socket.IO sends the saved event history to each connected dashboard and broadcasts new events as they arrive.
5. **Explore the work.** The React dashboard shows the live timeline, scans source imports for the codebase map, groups failures, and lets you ask about file changes. Claude and Nemotron calls are optional; without API keys the dashboard still records local activity and can use local heuristics for file summaries.

The main data path is:

```text
Claude Code JSONL → parser → SQLite → Express / Socket.IO → React dashboard
```

## Requirements

- Node.js 22 or newer
- npm

## Quick start

Install dependencies from the repository root and start the frontend and backend:

```sh
npm install
npm run dev
```

Open the dashboard at [http://localhost:5173](http://localhost:5173). The backend listens on [http://localhost:3001](http://localhost:3001).

By default, the backend reads Claude Code logs from `~/.claude/projects` and creates its SQLite database at `apps/server/data/brainstorm.db` when run through the workspace scripts. Disable log ingestion with `WATCH_CLAUDE_SESSIONS=false`. Set `BRAINSTORM_DEMO=true` to add sample events.

Brainstorm does not require API keys for local logging, storage, or the dashboard. Optional AI requests use the provider configured for that feature; the file summarization and explanation features can send file contents to the selected provider.

## Environment configuration

Set these values in the environment used to start the backend. `.env.example` lists the available settings.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3001` | Backend HTTP and Socket.IO port |
| `FRONTEND_URL` | `http://localhost:5173` | Frontend origin allowed by CORS |
| `BRAINSTORM_DB` | `data/brainstorm.db` | SQLite database path, relative to the backend working directory |
| `CLAUDE_LOGS_DIR` | `$HOME/.claude/projects` | Claude Code session log directory |
| `WATCH_CLAUDE_SESSIONS` | `true` | Set to `false` to disable session backfill and watching |
| `BRAINSTORM_DEMO` | `false` | Set to `true` to generate sample events |
| `ANTHROPIC_API_KEY` | unset | Enables Claude powered explanations and summaries |
| `ANTHROPIC_MODEL` | `claude-sonnet-5` | Anthropic model for explanations |
| `NVIDIA_API_KEY` | unset | Enables Nemotron summaries |
| `NEMOTRON_MODEL` | `nvidia/llama-3.1-nemotron-nano-8b-v1` | NVIDIA model for summaries |
| `NEMOTRON_URL` | `https://integrate.api.nvidia.com/v1` | NVIDIA compatible API base URL |
| `VITE_SERVER_URL` | `http://localhost:3001` | Backend address used by the frontend |

## HTTP API

| Method and path | Description |
| --- | --- |
| `GET /api/health` | Backend status, uptime, and event count |
| `GET /api/events` | Events, with optional `limit` and `sessionId` query parameters |
| `GET /api/sessions` | Recorded sessions |
| `GET /api/failures` | Failure groups |
| `GET /api/failures/:id` | A failure group and recent occurrences |
| `POST /api/failures/:id/resolve` | Mark a failure group resolved or unresolved |
| `GET /api/codebase/projects` | Projects discovered from session logs |
| `POST /api/codebase/scan` | Scan a project and store its import graph |
| `GET /api/codebase/map?projectPath=...` | Return a project's dependency graph |
| `GET /api/ai/status` | Report whether Claude and Nemotron are configured |
| `POST /api/ask` | Ask about activity on a file |
| `POST /api/summarize/file` | Summarize a file |
| `POST /api/summarize/bulk` | Summarize several files with Nemotron |
| `GET /api/summaries` | List stored file summaries |

The Socket.IO server sends `events:history` on connection and `event:new` when a new event arrives.

## Workspace commands

| Command | Description |
| --- | --- |
| `npm run dev` | Start the frontend and backend together |
| `npm run dev:web` | Start the Vite frontend only |
| `npm run dev:server` | Start the backend only |
| `npm run build` | Build both workspaces |
| `npm run typecheck` | Run workspace type checks that are configured |

## Project structure

```text
apps/
  server/       Express API, SQLite store, Claude Code watcher, and AI adapters
  web/          React dashboard, timeline, maps, and change explorer
packages/
  shared/       Event types and Socket.IO event names
```

