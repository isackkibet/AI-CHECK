/**
 * Data access layer. Thin, typed functions over the SQLite schema so the rest
 * of the server never writes raw SQL. Each function takes plain objects and
 * returns plain objects (or shared BrainstormEvent types).
 */
import { type BrainstormEvent } from "@brainstorm/shared";
import { getDb } from "./db";

// --- Sessions ---

export interface SessionRow {
  id: string;
  title: string | null;
  projectPath: string | null;
  firstSeen: string;
  lastSeen: string;
  status: string;
}

export function upsertSession(s: SessionRow): void {
  getDb()
    .prepare(
      `INSERT INTO sessions (id, title, project_path, first_seen, last_seen, status)
       VALUES (@id, @title, @projectPath, @firstSeen, @lastSeen, @status)
       ON CONFLICT(id) DO UPDATE SET
         title       = COALESCE(excluded.title, sessions.title),
         project_path= COALESCE(excluded.project_path, sessions.project_path),
         last_seen   = excluded.last_seen,
         status      = excluded.status`,
    )
    .run(s);
}

// --- Events ---

interface EventRow {
  id: string;
  session_id: string;
  type: string;
  timestamp: string;
  summary: string;
  file_path: string | null;
  source: string;
  evidence: string | null;
}

/** Convert a stored row into the shared BrainstormEvent shape. */
function rowToEvent(row: EventRow): BrainstormEvent {
  return {
    id: row.id,
    sessionId: row.session_id,
    type: row.type as BrainstormEvent["type"],
    timestamp: row.timestamp,
    summary: row.summary,
    filePath: row.file_path ?? undefined,
    evidence: row.evidence ? JSON.parse(row.evidence) : undefined,
  };
}

/**
 * Insert an event, ignoring duplicates by id. Idempotent so re-parsing a
 * session log on watcher restart never produces duplicate events.
 */
export function insertEvent(evt: BrainstormEvent): boolean {
  const res = getDb()
    .prepare(
      `INSERT OR IGNORE INTO events
         (id, session_id, type, timestamp, summary, file_path, source, evidence)
       VALUES (@id, @sessionId, @type, @timestamp, @summary, @filePath, @source, @evidence)`,
    )
    .run({
      id: evt.id,
      sessionId: evt.sessionId,
      type: evt.type,
      timestamp: evt.timestamp,
      summary: evt.summary,
      filePath: evt.filePath ?? null,
      source: (evt.evidence?.source as string) ?? "session_log",
      evidence: evt.evidence ? JSON.stringify(evt.evidence) : null,
    });
  return res.changes > 0;
}

/** Insert many events in a single transaction. */
export function insertEvents(events: BrainstormEvent[]): number {
  if (events.length === 0) return 0;
  const db = getDb();
  let inserted = 0;
  const tx = db.transaction((rows: BrainstormEvent[]) => {
    for (const evt of rows) if (insertEvent(evt)) inserted += 1;
  });
  tx(events);
  return inserted;
}

/** Return events newest-first, optionally limited or filtered by session. */
export function queryEvents(limit = 500, sessionId?: string): BrainstormEvent[] {
  const db = getDb();
  const rows = (
    sessionId
      ? db.prepare(
          "SELECT * FROM events WHERE session_id = ? ORDER BY timestamp ASC LIMIT ?",
        ).all(sessionId, limit)
      : db.prepare("SELECT * FROM events ORDER BY timestamp DESC LIMIT ?").all(
          limit,
        )
  ) as EventRow[];
  return sessionId ? rows.map(rowToEvent) : rows.map(rowToEvent);
}

export function getEventCount(): number {
  return (getDb().prepare("SELECT COUNT(*) AS n FROM events").get() as {
    n: number;
  }).n;
}

export function getEventById(id: string): BrainstormEvent | null {
  const row = getDb()
    .prepare("SELECT * FROM events WHERE id = ?")
    .get(id) as EventRow | undefined;
  return row ? rowToEvent(row) : null;
}

// --- File changes ---

export function insertFileChange(args: {
  sessionId?: string;
  filePath: string;
  eventId?: string;
  timestamp: string;
}): void {
  getDb()
    .prepare(
      `INSERT INTO file_changes (session_id, file_path, event_id, timestamp)
       VALUES (@sessionId, @filePath, @eventId, @timestamp)`,
    )
    .run({
      sessionId: args.sessionId ?? null,
      filePath: args.filePath,
      eventId: args.eventId ?? null,
      timestamp: args.timestamp,
    });
}

export function getFileChanges(limit = 200): Array<{
  filePath: string;
  timestamp: string;
  sessionId: string | null;
}> {
  return getDb()
    .prepare(
      "SELECT file_path AS filePath, timestamp, session_id AS sessionId FROM file_changes ORDER BY timestamp DESC LIMIT ?",
    )
    .all(limit) as Array<{ filePath: string; timestamp: string; sessionId: string | null }>;
}

// --- Dependency edges ---

export interface DepEdge {
  source: string;
  target: string;
}

/** Replace all edges for a project in one transaction (re-scan semantics). */
export function replaceDependencyEdges(
  projectPath: string,
  edges: DepEdge[],
): void {
  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM dependency_edges WHERE project_path = ?").run(
      projectPath,
    );
    const ins = db.prepare(
      "INSERT INTO dependency_edges (project_path, source, target, scanned_at) VALUES (?, ?, ?, ?)",
    );
    const now = new Date().toISOString();
    for (const e of edges) ins.run(projectPath, e.source, e.target, now);
  });
  tx();
}

export function getDependencyEdges(projectPath: string): DepEdge[] {
  return getDb()
    .prepare(
      "SELECT source, target FROM dependency_edges WHERE project_path = ?",
    )
    .all(projectPath) as DepEdge[];
}

// --- Failure groups ---

export interface FailureGroupRow {
  id: string;
  signature: string;
  normalizedMessage: string;
  errorType: string | null;
  occurrenceCount: number;
  firstSeen: string;
  lastSeen: string;
  resolved: number;
}

export function upsertFailureGroup(g: FailureGroupRow): void {
  getDb()
    .prepare(
      `INSERT INTO failure_groups
         (id, signature, normalized_message, error_type, occurrence_count, first_seen, last_seen, resolved)
       VALUES (@id, @signature, @normalizedMessage, @errorType, 1, @firstSeen, @lastSeen, @resolved)
       ON CONFLICT(signature) DO UPDATE SET
         occurrence_count = failure_groups.occurrence_count + 1,
         last_seen        = excluded.last_seen`,
    )
    .run(g);
}

export function insertFailureOccurrence(o: {
  groupId: string;
  eventId?: string;
  message?: string;
  command?: string;
  exitCode?: number;
  filePath?: string;
  timestamp: string;
}): void {
  getDb()
    .prepare(
      `INSERT INTO failure_occurrences
         (group_id, event_id, message, command, exit_code, file_path, timestamp)
       VALUES (@groupId, @eventId, @message, @command, @exitCode, @filePath, @timestamp)`,
    )
    .run({
      groupId: o.groupId,
      eventId: o.eventId ?? null,
      message: o.message ?? null,
      command: o.command ?? null,
      exitCode: o.exitCode ?? null,
      filePath: o.filePath ?? null,
      timestamp: o.timestamp,
    });
}

export function getFailureGroups(): FailureGroupRow[] {
  return getDb()
    .prepare(
      "SELECT id, signature, normalized_message AS normalizedMessage, error_type AS errorType, occurrence_count AS occurrenceCount, first_seen AS firstSeen, last_seen AS lastSeen, resolved FROM failure_groups ORDER BY occurrence_count DESC, last_seen DESC",
    )
    .all() as FailureGroupRow[];
}

// --- File summaries ---

export function upsertFileSummary(s: {
  filePath: string;
  summary?: string;
  risk?: string;
  riskReason?: string;
}): void {
  getDb()
    .prepare(
      `INSERT INTO file_summaries (file_path, summary, risk, risk_reason, updated_at)
       VALUES (@filePath, @summary, @risk, @riskReason, @updatedAt)
       ON CONFLICT(file_path) DO UPDATE SET
         summary     = COALESCE(excluded.summary, file_summaries.summary),
         risk        = COALESCE(excluded.risk, file_summaries.risk),
         risk_reason= COALESCE(excluded.risk_reason, file_summaries.risk_reason),
         updated_at = excluded.updated_at`,
    )
    .run({
      ...s,
      summary: s.summary ?? null,
      risk: s.risk ?? null,
      riskReason: s.riskReason ?? null,
      updatedAt: new Date().toISOString(),
    });
}

export function getFileSummaries(): Array<{
  filePath: string;
  summary: string | null;
  risk: string | null;
  riskReason: string | null;
  updatedAt: string;
}> {
  return getDb()
    .prepare(
      "SELECT file_path AS filePath, summary, risk, risk_reason AS riskReason, updated_at AS updatedAt FROM file_summaries",
    )
    .all() as Array<{
      filePath: string;
      summary: string | null;
      risk: string | null;
      riskReason: string | null;
      updatedAt: string;
    }>;
}

// --- AI Q&A ---

export function insertAiQuestion(q: {
  id: string;
  filePath?: string;
  question: string;
  context?: string;
}): void {
  getDb()
    .prepare(
      "INSERT INTO ai_questions (id, file_path, question, context, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .run(q.id, q.filePath ?? null, q.question, q.context ?? null, new Date().toISOString());
}

export function insertAiAnswer(a: {
  id: string;
  questionId: string;
  answer: string;
  citations?: string;
  model?: string;
}): void {
  getDb()
    .prepare(
      "INSERT INTO ai_answers (id, question_id, answer, citations, model, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(
      a.id,
      a.questionId,
      a.answer,
      a.citations ?? null,
      a.model ?? null,
      new Date().toISOString(),
    );
}
