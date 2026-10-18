import { useState } from "react";
import { useEvents } from "./hooks/useEvents";
import { TimelinePage } from "./pages/TimelinePage";
import { FailuresPage } from "./pages/FailuresPage";
import { CodebaseMapPage } from "./pages/CodebaseMapPage";
import { ChangeExplorerPage } from "./pages/ChangeExplorerPage";
import "./App.css";

type Tab = "timeline" | "map" | "failures" | "explorer";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "timeline", label: "Timeline",       icon: "⏱" },
  { id: "map",      label: "Codebase Map",   icon: "🗺" },
  { id: "failures", label: "Failures",       icon: "⚠" },
  { id: "explorer", label: "Change Explorer",icon: "💬" },
];

export default function App() {
  const { events, connected } = useEvents();
  const [tab, setTab] = useState<Tab>("timeline");
  // File selected in timeline/map → passed to Change Explorer.
  const [selectedFile, setSelectedFile] = useState<string | undefined>();

  const handleSelectFile = (filePath: string) => {
    setSelectedFile(filePath);
    setTab("explorer");
  };

  const errorCount = events.filter((e) => e.type === "tool_error").length;

  return (
    <div className="app">
      {/* Top nav */}
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">🧠</span>
          <div className="brand-text">
            <span className="brand-name">Brainstorm</span>
            <span className="tagline">A live map of your AI coding agent</span>
          </div>
        </div>

        <nav className="nav-tabs" role="tablist" aria-label="Dashboard sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              className={`nav-tab ${tab === t.id ? "active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              <span aria-hidden="true">{t.icon}</span>
              {t.label}
              {t.id === "failures" && errorCount > 0 && (
                <span className="badge-count">{errorCount}</span>
              )}
            </button>
          ))}
        </nav>

        <div className={`status ${connected ? "on" : "off"}`}>
          <span className="status-dot" />
          <span>{connected ? "Live" : "Disconnected"}</span>
        </div>
      </header>

      {/* Page content */}
      <main className="app-main" role="tabpanel">
        {tab === "timeline" && (
          <TimelinePage
            events={events}
            connected={connected}
            onSelectFile={handleSelectFile}
          />
        )}
        {tab === "map" && (
          <CodebaseMapPage onSelectFile={handleSelectFile} />
        )}
        {tab === "failures" && <FailuresPage />}
        {tab === "explorer" && (
          <ChangeExplorerPage events={events} initialFile={selectedFile} />
        )}
      </main>

      <footer className="app-footer">
        Brainstorm · local-first Claude Code companion ·{" "}
        <span className="dim">{events.length} events in memory</span>
      </footer>
    </div>
  );
}
