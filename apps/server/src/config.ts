/**
 * Centralized server configuration. All tunables come from environment
 * variables with sensible local-first defaults so Brainstorm runs out of the
 * box without any configuration.
 */
export const config = {
  /** HTTP + WebSocket port for the backend. */
  port: Number(process.env.PORT ?? 3001),

  /** Origin allowed by CORS (the Vite dev server). */
  frontendOrigin: process.env.FRONTEND_URL ?? "http://localhost:5173",

  /** Path to the SQLite database file. */
  dbPath: process.env.BRAINSTORM_DB ?? "data/brainstorm.db",

  /** Directory where Claude Code stores per-project session JSONL logs. */
  claudeLogsDir:
    process.env.CLAUDE_LOGS_DIR ?? `${process.env.HOME}/.claude/projects`,

  /** When true, watch real Claude Code session logs for live events. */
  watchClaudeSessions: process.env.WATCH_CLAUDE_SESSIONS !== "false",

  /** When true, also emit demo events on a timer so the dashboard is never empty. */
  demoMode: process.env.BRAINSTORM_DEMO === "true",

  /** Anthropic API key for Claude-powered explanations. Empty = disabled. */
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",

  /** NVIDIA / Brev API key for Nemotron bulk processing. Empty = disabled. */
  nvidiaApiKey: process.env.NVIDIA_API_KEY ?? "",
} as const;

/** Whether Claude-powered Q&A and summaries are available. */
export const aiEnabled = config.anthropicApiKey.length > 0;

/** Whether Nemotron bulk processing is available. */
export const nemotronEnabled = config.nvidiaApiKey.length > 0;
