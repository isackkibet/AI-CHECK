/**
 * Typed API client for the Brainstorm backend REST endpoints.
 */
import type { BrainstormEvent } from "@brainstorm/shared";

const BASE = import.meta.env.VITE_SERVER_URL ?? "http://localhost:3001";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(`POST ${path} → ${res.status}: ${msg}`);
  }
  return res.json() as Promise<T>;
}

// --- Types ---

export interface Session {
  id: string;
  title: string | null;
  projectPath: string | null;
  firstSeen: string;
  lastSeen: string;
  status: string;
}

export interface FailureGroup {
  id: string;
  normalizedMessage: string;
  errorType: string | null;
  occurrenceCount: number;
  firstSeen: string;
  lastSeen: string;
  resolved: number;
}

export interface FailureOccurrence {
  eventId: string | null;
  message: string | null;
  command: string | null;
  exitCode: number | null;
  filePath: string | null;
  timestamp: string;
}

export interface MapNode {
  id: string;
  recentlyChanged: boolean;
}

export interface MapEdge {
  source: string;
  target: string;
}

export interface CodebaseMap {
  projectPath: string;
  scanned: boolean;
  nodes: MapNode[];
  edges: MapEdge[];
}

export interface FileSummary {
  filePath: string;
  summary: string | null;
  risk: string | null;
  riskReason: string | null;
  updatedAt: string;
}

export interface AskResult {
  answer: string;
  citations: string[];
  model: string;
  configured: boolean;
  fileExists: boolean;
}

export interface AiStatus {
  claude: boolean;
  nemotron: boolean;
}

// --- Endpoints ---

export const api = {
  health: () => get<{ status: string; uptimeSeconds: number; eventCount: number }>("/api/health"),
  events: (limit = 500, sessionId?: string) =>
    get<BrainstormEvent[]>(`/api/events?limit=${limit}${sessionId ? `&sessionId=${sessionId}` : ""}`),
  sessions: () => get<Session[]>("/api/sessions"),

  failures: () => get<FailureGroup[]>("/api/failures"),
  failureDetail: (id: string) =>
    get<{ group: FailureGroup; occurrences: FailureOccurrence[] }>(`/api/failures/${id}`),
  resolveFailure: (id: string, resolved = true) =>
    post<{ ok: boolean }>(`/api/failures/${id}/resolve`, { resolved }),

  codebases: () => get<{ projects: Array<{ projectPath: string; sessionCount: number; lastSeen: string }> }>("/api/codebase/projects"),
  scanProject: (projectPath: string) =>
    post<{ projectPath: string; fileCount: number; edgeCount: number; truncated: boolean }>("/api/codebase/scan", { projectPath }),
  codebaseMap: (projectPath: string) =>
    get<CodebaseMap>(`/api/codebase/map?projectPath=${encodeURIComponent(projectPath)}`),

  aiStatus: () => get<AiStatus>("/api/ai/status"),
  ask: (filePath: string, question: string) =>
    post<AskResult>("/api/ask", { filePath, question }),
  summarizeFile: (filePath: string, nemotron = false) =>
    post<{ summary: string; risk: string; model: string }>("/api/summarize/file", { filePath, nemotron }),
  summaries: () => get<FileSummary[]>("/api/summaries"),
};
