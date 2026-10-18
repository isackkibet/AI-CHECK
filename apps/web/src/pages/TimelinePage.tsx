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
  const [frozenEvents, setFrozenEvents] = useState<BrainstormEvent[]>([]);

  const sourceEvents = paused ? frozenEvents : events;

  const filtered = sourceEvents.filter((e) => {
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

  const togglePause = () => {
    if (paused) {
      setPaused(false);
      return;
    }
    setFrozenEvents(events);
    setPaused(true);
  };

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">MONITOR</span>
          <h1>Agent activity</h1>
          <p className="page-description">Follow the work as it happens across your coding sessions.</p>
        </div>
        <div className={`activity-state ${connected ? "on" : "off"}`}>
          <span className="status-dot" />
          <div>
            <strong>{connected ? "Streaming live" : "Waiting for connection"}</strong>
            <span>{paused ? "Timeline paused" : "Updates arrive automatically"}</span>
          </div>
        </div>
      </div>

      <div className="stats-row">
        <div className="stat-card">
          <span className="stat-icon stat-icon-purple" aria-hidden="true">↗</span>
          <div><span className="stat-lbl">Total events</span><strong className="stat-val">{events.length.toLocaleString()}</strong></div>
        </div>
        <div className="stat-card">
          <span className="stat-icon stat-icon-blue" aria-hidden="true">✎</span>
          <div><span className="stat-lbl">File edits</span><strong className="stat-val">{editCount.toLocaleString()}</strong></div>
        </div>
        <div className="stat-card">
          <span className="stat-icon stat-icon-red" aria-hidden="true">!</span>
          <div><span className="stat-lbl">Tool errors</span><strong className="stat-val">{errorCount.toLocaleString()}</strong></div>
        </div>
      </div>

      <section className="activity-panel">
        <div className="activity-toolbar">
          <div className="activity-panel-heading">
            <div><h2>Recent activity</h2><p>Search and filter the event stream.</p></div>
            <span className="result-count">{filtered.length.toLocaleString()} shown</span>
          </div>
          <div className="toolbar-controls">
            <label className="search-wrap">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" /><path d="m16 16 4 4" /></svg>
              <input
                className="search-input"
                type="search"
                placeholder="Search activity or file path"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search events"
              />
              {search && <button className="search-clear" type="button" onClick={() => setSearch("")} aria-label="Clear search">×</button>}
            </label>
            <select
              className="filter-select"
              value={filter}
              onChange={(e) => setFilter(e.target.value as EventType | "")}
              aria-label="Filter by event type"
            >
              <option value="">All event types</option>
              {EVENT_TYPES.map((t) => (
                <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
              ))}
            </select>
            <button
              className={`btn ${paused ? "btn-active" : ""}`}
              type="button"
              onClick={togglePause}
              aria-pressed={paused}
            >
              <span aria-hidden="true">{paused ? "▶" : "Ⅱ"}</span>{paused ? "Resume" : "Pause"}
            </button>
          </div>
        </div>

        {filtered.length === 0 && sourceEvents.length > 0 ? (
          <div className="filtered-empty">
            <span className="empty-search-icon" aria-hidden="true">⌕</span>
            <strong>No matching activity</strong>
            <span>Try a different search or event type.</span>
            <button className="text-button" type="button" onClick={() => { setSearch(""); setFilter(""); }}>Clear filters</button>
          </div>
        ) : (
          <Timeline events={displayed} onFileClick={onSelectFile} />
        )}

        {displayed.length < filtered.length && (
          <button className="load-more" type="button" onClick={() => setDisplayCount((c) => c + 100)}>
            Load {Math.min(100, filtered.length - displayed.length)} older events
          </button>
        )}
      </section>
    </div>
  );
}
