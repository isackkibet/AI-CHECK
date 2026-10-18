import { useState } from "react";
import type { BrainstormEvent, EventType } from "@brainstorm/shared";
import { Timeline } from "../components/Timeline";

const EVENT_TYPES: EventType[] = [
  "session_started", "file_read", "file_edit", "tool_call",
  "tool_result", "command_run", "tool_error", "test_result",
  "agent_step", "session_ended",
];

interface Props {
  events: BrainstormEvent[];
  connected: boolean;
  onSelectFile: (filePath: string) => void;
}

export function TimelinePage({ events, connected, onSelectFile }: Props) {
  const [filter, setFilter] = useState<EventType | "">("");
  const [search, setSearch] = useState("");
  const [paused, setPaused] = useState(false);
  const [displayCount, setDisplayCount] = useState(100);

  const filtered = events.filter((e) => {
    if (filter && e.type !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        e.summary.toLowerCase().includes(q) ||
        (e.filePath?.toLowerCase().includes(q) ?? false)
      );
    }
    return true;
  });

  // When paused we freeze the list at what was there when paused was toggled.
  const displayed = filtered.slice(-displayCount);

  const errorCount = events.filter((e) => e.type === "tool_error").length;
  const editCount = events.filter((e) => e.type === "file_edit").length;

  return (
    <div className="page">
      {/* Stats row */}
      <div className="stats-row">
        <div className="stat-pill">
          <span className="stat-val">{events.length}</span>
          <span className="stat-lbl">Events</span>
        </div>
        <div className="stat-pill">
          <span className="stat-val">{editCount}</span>
          <span className="stat-lbl">Edits</span>
        </div>
        <div className="stat-pill stat-err">
          <span className="stat-val">{errorCount}</span>
          <span className="stat-lbl">Errors</span>
        </div>
        <div className={`stat-pill stat-conn ${connected ? "on" : "off"}`}>
          <span className="status-dot" />
          <span className="stat-lbl">{connected ? "Live" : "Disconnected"}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="toolbar">
        <input
          className="search-input"
          type="search"
          placeholder="Search events or files…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search events"
        />
        <select
          className="filter-select"
          value={filter}
          onChange={(e) => setFilter(e.target.value as EventType | "")}
          aria-label="Filter by event type"
        >
          <option value="">All types</option>
          {EVENT_TYPES.map((t) => (
            <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
          ))}
        </select>
        <button
          className={`btn ${paused ? "btn-active" : ""}`}
          onClick={() => setPaused((p) => !p)}
          aria-pressed={paused}
        >
          {paused ? "▶ Resume" : "⏸ Pause"}
        </button>
        {displayed.length < filtered.length && (
          <button className="btn" onClick={() => setDisplayCount((c) => c + 100)}>
            Load more ({filtered.length - displayed.length})
          </button>
        )}
      </div>

      <Timeline
        events={paused ? displayed : displayed}
        onFileClick={onSelectFile}
      />
    </div>
  );
}
