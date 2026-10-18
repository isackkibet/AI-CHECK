/**
 * SQLite database connection and schema migrations.
 *
 * Uses better-sqlite3 (synchronous, fast, embedded). The database file lives
 * in `data/brainstorm.db` by default so it stays local to this machine, which
 * matches Brainstorm's local-first principle.
 */
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "../config";

let db: Database.Database | null = null;

/** The full schema. Created with IF NOT EXISTS so it is idempotent. */
const SCHEMA = `
-- A Claude Code session (one JSONL file under ~/.claude/projects/<encoded>).
CREATE TABLE IF NOT EXISTS sessions (
  id            TEXT PRIMARY KEY,
  title         TEXT,
  project_path  TEXT,
  first_seen    TEXT NOT NULL,
  last_seen     TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active'
);

-- Every normalized observation (file read, edit, tool call, error, ...).
CREATE TABLE IF NOT EXISTS events (
  id            TEXT PRIMARY KEY,
  session_id    TEXT NOT NULL,
  type          TEXT NOT NULL,
  timestamp     TEXT NOT NULL,
  summary       TEXT NOT NULL,
  file_path     TEXT,
  source        TEXT NOT NULL DEFAULT 'session_log',
  evidence      TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);
CREATE INDEX IF NOT EXISTS idx_events_session   ON events(session_id);
CREATE INDEX IF NOT EXISTS idx_events_type       ON events(type);
CREATE INDEX IF NOT EXISTS idx_events_timestamp  ON events(timestamp);

-- Links an event to a concrete file change (from file-history-delta or a Write/Edit tool).
CREATE TABLE IF NOT EXISTS file_changes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id    TEXT,
  file_path     TEXT NOT NULL,
  event_id      TEXT,
  timestamp     TEXT NOT NULL,
  FOREIGN KEY (event_id) REFERENCES events(id)
);
CREATE INDEX IF NOT EXISTS idx_file_changes_path ON file_changes(file_path);

-- Import / dependency edges for a scanned project.
CREATE TABLE IF NOT EXISTS dependency_edges (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  project_path  TEXT NOT NULL,
  source        TEXT NOT NULL,
  target        TEXT NOT NULL,
  scanned_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dep_edges_project ON dependency_edges(project_path);

-- A group of identical/near-identical tool errors.
CREATE TABLE IF NOT EXISTS failure_groups (
  id                  TEXT PRIMARY KEY,
  signature           TEXT UNIQUE NOT NULL,
  normalized_message  TEXT NOT NULL,
  error_type          TEXT,
  occurrence_count    INTEGER NOT NULL DEFAULT 0,
  first_seen          TEXT NOT NULL,
  last_seen           TEXT NOT NULL,
  resolved            INTEGER NOT NULL DEFAULT 0
);

-- Individual occurrences that belong to a failure group.
CREATE TABLE IF NOT EXISTS failure_occurrences (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id      TEXT NOT NULL,
  event_id      TEXT,
  message       TEXT,
  command       TEXT,
  exit_code     INTEGER,
  file_path     TEXT,
  timestamp     TEXT NOT NULL,
  FOREIGN KEY (group_id) REFERENCES failure_groups(id)
);
CREATE INDEX IF NOT EXISTS idx_fail_occ_group ON failure_occurrences(group_id);

-- AI-generated file summaries and risk flags.
CREATE TABLE IF NOT EXISTS file_summaries (
  file_path     TEXT PRIMARY KEY,
  summary       TEXT,
  risk          TEXT,
  risk_reason   TEXT,
  updated_at    TEXT NOT NULL
);

-- User questions about a change, and the AI answers.
CREATE TABLE IF NOT EXISTS ai_questions (
  id            TEXT PRIMARY KEY,
  file_path     TEXT,
  question      TEXT NOT NULL,
  context       TEXT,
  created_at    TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ai_answers (
  id            TEXT PRIMARY KEY,
  question_id   TEXT NOT NULL,
  answer        TEXT NOT NULL,
  citations     TEXT,
  model         TEXT,
  created_at    TEXT NOT NULL,
  FOREIGN KEY (question_id) REFERENCES ai_questions(id)
);
`;

/** Get the shared database connection, creating and migrating it on first use. */
export function getDb(): Database.Database {
  if (db) return db;

  mkdirSync(dirname(config.dbPath), { recursive: true });
  db = new Database(config.dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  console.log(`[db] opened ${config.dbPath}`);
  return db;
}

/** Close the database connection (used on shutdown). */
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
