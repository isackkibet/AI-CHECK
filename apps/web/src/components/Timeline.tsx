import type { BrainstormEvent, EventType } from "@brainstorm/shared";

interface EventMeta {
  icon: string;
  label: string;
  tone: string;
}

/** Display metadata for each normalized event type. */
const EVENT_META: Record<EventType, EventMeta> = {
  session_started: { icon: "🟢", label: "Session", tone: "start" },
  session_ended: { icon: "⏹", label: "Session", tone: "end" },
  file_read: { icon: "📖", label: "Read", tone: "read" },
  file_edit: { icon: "✏", label: "Edited", tone: "edit" },
  tool_call: { icon: "🔧", label: "Tool", tone: "tool" },
  tool_result: { icon: "📋", label: "Result", tone: "tool" },
  command_run: { icon: "▶", label: "Command", tone: "command" },
  tool_error: { icon: "⚠", label: "Error", tone: "error" },
  test_result: { icon: "✅", label: "Test", tone: "test" },
  agent_step: { icon: "🧩", label: "Agent", tone: "agent" },
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function Timeline({ events }: { events: BrainstormEvent[] }) {
  // Newest first so the live feed scrolls upward as new events arrive.
  const sorted = [...events].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  if (sorted.length === 0) {
    return <div className="timeline-empty">Waiting for agent activity…</div>;
  }

  return (
    <ol className="timeline" aria-label="Live agent event timeline">
      {sorted.map((evt) => {
        const meta = EVENT_META[evt.type] ?? {
          icon: "•",
          label: evt.type,
          tone: "default",
        };
        return (
          <li key={evt.id} className={`timeline-item tone-${meta.tone}`}>
            <div className="timeline-rail" aria-hidden="true">
              <span className="timeline-icon">{meta.icon}</span>
            </div>
            <div className="timeline-content">
              <div className="timeline-head">
                <span className="timeline-summary">{evt.summary}</span>
                <time className="timeline-time" dateTime={evt.timestamp}>
                  {formatTime(evt.timestamp)}
                </time>
              </div>
              {evt.filePath && (
                <code className="timeline-file">{evt.filePath}</code>
              )}
              <span className="timeline-tag">{meta.label}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
