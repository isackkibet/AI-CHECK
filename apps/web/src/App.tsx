import { useEvents } from "./hooks/useEvents";
import { Timeline } from "./components/Timeline";
import "./App.css";

function App() {
  const { events, connected } = useEvents();
  const errorCount = events.filter((e) => e.type === "tool_error").length;
  const editCount = events.filter((e) => e.type === "file_edit").length;

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            🧠
          </span>
          <div className="brand-text">
            <h1>Brainstorm</h1>
            <p className="tagline">A live map of your AI coding agent</p>
          </div>
        </div>
        <div className={`status ${connected ? "on" : "off"}`}>
          <span className="status-dot" />
          <span>{connected ? "Live" : "Disconnected"}</span>
        </div>
      </header>

      <section className="stats">
        <div className="stat">
          <span className="stat-value">{events.length}</span>
          <span className="stat-label">Events</span>
        </div>
        <div className="stat">
          <span className="stat-value">{editCount}</span>
          <span className="stat-label">Edits</span>
        </div>
        <div className="stat stat-error">
          <span className="stat-value">{errorCount}</span>
          <span className="stat-label">Failures</span>
        </div>
      </section>

      <main className="main">
        <div className="section-head">
          <h2>Live Timeline</h2>
          <span className="section-hint">
            Streaming from the Brainstorm server
          </span>
        </div>
        <Timeline events={events} />
      </main>

      <footer className="app-footer">
        Phase 1 MVP · sample events · backend → websocket → React
      </footer>
    </div>
  );
}

export default App;
