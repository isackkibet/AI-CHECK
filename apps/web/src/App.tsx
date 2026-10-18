import { useState } from "react";
import { useEvents } from "./hooks/useEvents";
import { TimelinePage } from "./pages/TimelinePage";
import { FailuresPage } from "./pages/FailuresPage";
import { CodebaseMapPage } from "./pages/CodebaseMapPage";
import { ChangeExplorerPage } from "./pages/ChangeExplorerPage";
import "./App.css";

type Tab = "timeline" | "map" | "failures" | "explorer";

const TABS: { id: Tab; label: string; description: string; icon: string }[] = [
  { id: "timeline", label: "Activity", description: "Live agent activity", icon: "activity" },
  { id: "map", label: "Codebase map", description: "Explore project structure", icon: "map" },
  { id: "failures", label: "Failures", description: "Review recurring errors", icon: "warning" },
  { id: "explorer", label: "Change explorer", description: "Understand file changes", icon: "explore" },
];

function NavIcon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    activity: "M3 12h4l3-8 4 16 3-8h4",
    map: "M9 18 3 21V6l6-3m0 15 6 3m-6-3V3m6 18 6-3V3l-6 3m0 15V6m0 0L9 3",
    warning: "M12 9v4m0 4h.01M10.3 3.9 2.6 17.3A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.7L13.7 3.9a2 2 0 0 0-3.4 0Z",
    explore: "M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z",
  };

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
      <path d={paths[name]} />
    </svg>
  );
}

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
  const activeTab = TABS.find((item) => item.id === tab) ?? TABS[0];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">B</span>
          <div className="brand-text">
            <span className="brand-name">Brainstorm</span>
            <span className="tagline">Agent activity, clearly</span>
          </div>
        </div>

        <div className="sidebar-label">Workspace</div>
        <nav className="nav-tabs" aria-label="Dashboard sections">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-current={tab === item.id ? "page" : undefined}
              className={`nav-tab ${tab === item.id ? "active" : ""}`}
              onClick={() => setTab(item.id)}
            >
              <span className="nav-icon"><NavIcon name={item.icon} /></span>
              <span>{item.label}</span>
              {item.id === "failures" && errorCount > 0 && (
                <span className="badge-count">{errorCount}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className={`connection-card ${connected ? "on" : "off"}`}>
            <span className="connection-orb"><span /></span>
            <div>
              <strong>{connected ? "Connected" : "Reconnecting"}</strong>
              <span>Local event stream</span>
            </div>
          </div>
          <div className="local-note"><span aria-hidden="true">⌂</span> Local-first workspace</div>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div className="topbar-context">
            <span>Workspace</span><span className="crumb-divider">/</span><strong>{activeTab.label}</strong>
          </div>
          <div className={`topbar-status ${connected ? "on" : "off"}`}>
            <span className="status-dot" />
            {connected ? "Live connection" : "Connection lost"}
          </div>
        </header>

        <main className="app-main">
          {tab === "timeline" && (
            <TimelinePage
              events={events}
              connected={connected}
              onSelectFile={handleSelectFile}
            />
          )}
          {tab === "map" && <CodebaseMapPage onSelectFile={handleSelectFile} />}
          {tab === "failures" && <FailuresPage />}
          {tab === "explorer" && (
            <ChangeExplorerPage events={events} initialFile={selectedFile} />
          )}
        </main>

        <footer className="app-footer">
          <span>Brainstorm <span className="footer-separator">·</span> Local-first agent observability</span>
          <span>{events.length.toLocaleString()} events captured</span>
        </footer>
      </div>
    </div>
  );
}
