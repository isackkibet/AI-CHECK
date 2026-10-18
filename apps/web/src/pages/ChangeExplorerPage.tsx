import { useEffect, useRef, useState } from "react";
import type { BrainstormEvent } from "@brainstorm/shared";
import { api, type AiStatus } from "../lib/api";

interface Props {
  events: BrainstormEvent[];
  initialFile?: string;
}

export function ChangeExplorerPage({ events, initialFile }: Props) {
  const [filePath, setFilePath] = useState(initialFile ?? "");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<{
    text: string;
    citations: string[];
    model: string;
    configured: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const answerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.aiStatus().then(setAiStatus).catch(() => {});
  }, []);

  // Sync when a file is selected from the timeline or map.
  useEffect(() => {
    if (initialFile) setFilePath(initialFile);
  }, [initialFile]);

  // Events that touched this file.
  const fileEvents = filePath
    ? events
        .filter(
          (e) =>
            e.filePath === filePath ||
            e.filePath?.endsWith("/" + filePath) ||
            filePath.endsWith("/" + (e.filePath ?? "")),
        )
        .slice(-20)
    : [];

  const handleAsk = async () => {
    if (!question.trim()) return;
    setLoading(true);
    setAnswer(null);
    try {
      const result = await api.ask(filePath, question);
      setAnswer({
        text: result.answer,
        citations: result.citations,
        model: result.model,
        configured: result.configured,
      });
      setTimeout(() => answerRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (e) {
      setAnswer({
        text: `Error: ${String(e)}`,
        citations: [],
        model: "error",
        configured: false,
      });
    } finally {
      setLoading(false);
    }
  };

  const recentEdits = events
    .filter((e) => e.type === "file_edit" && e.filePath)
    .slice(-30)
    .reverse();

  return (
    <div className="page explorer-layout">
      {/* Left: recent edits picker */}
      <aside className="explorer-files">
        <div className="section-head">
          <h2>Recent edits</h2>
          <span className="dim">{recentEdits.length}</span>
        </div>
        {recentEdits.length === 0 && (
          <div className="dim" style={{ padding: "12px 0" }}>No edits yet.</div>
        )}
        {recentEdits.map((e) => (
          <button
            key={e.id}
            className={`file-row ${e.filePath === filePath ? "active" : ""}`}
            onClick={() => setFilePath(e.filePath ?? "")}
          >
            <span className="file-row-name">{e.filePath?.split("/").pop()}</span>
            <span className="file-row-path dim">{e.filePath}</span>
          </button>
        ))}
      </aside>

      {/* Right: detail + Q&A */}
      <section className="explorer-detail">
        {/* File path input */}
        <div className="toolbar" style={{ marginBottom: 16 }}>
          <input
            className="search-input"
            type="text"
            placeholder="File path (e.g. src/auth/login.ts)"
            value={filePath}
            onChange={(e) => setFilePath(e.target.value)}
            style={{ flex: 1 }}
            aria-label="File path to explore"
          />
        </div>

        {/* AI status notice */}
        {aiStatus && !aiStatus.claude && (
          <div className="info-banner">
            💡 Claude is not configured. Set <code>ANTHROPIC_API_KEY</code> to get AI explanations. Evidence is still recorded locally.
          </div>
        )}

        {/* Recorded activity */}
        {filePath && (
          <>
            <div className="section-head" style={{ marginBottom: 8 }}>
              <h3>Recorded agent activity on this file</h3>
              <span className="dim">{fileEvents.length} events</span>
            </div>
            {fileEvents.length === 0 ? (
              <div className="dim" style={{ marginBottom: 16 }}>
                No recorded activity for this file yet.
              </div>
            ) : (
              <ol className="occurrence-list" style={{ marginBottom: 16 }} aria-label="File activity">
                {fileEvents.map((e) => (
                  <li key={e.id} className="occurrence-item">
                    <span className="occurrence-time dim">
                      {new Date(e.timestamp).toLocaleTimeString()}
                    </span>
                    <span className="timeline-tag" style={{ marginLeft: 8 }}>
                      {e.type.replace(/_/g, " ")}
                    </span>
                    <div style={{ marginTop: 4 }}>{e.summary}</div>
                  </li>
                ))}
              </ol>
            )}
          </>
        )}

        {/* Q&A */}
        <div className="qa-box">
          <label htmlFor="question-input" className="qa-label">
            Ask about this change
          </label>
          <textarea
            id="question-input"
            className="qa-textarea"
            rows={3}
            placeholder={
              filePath
                ? `Why did the agent change ${filePath.split("/").pop()}?`
                : "Enter a file path above, then ask a question…"
            }
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleAsk();
            }}
          />
          <button
            className="btn btn-primary"
            onClick={handleAsk}
            disabled={loading || !question.trim()}
            style={{ marginTop: 8, alignSelf: "flex-end" }}
          >
            {loading ? "Asking…" : "Ask Brainstorm"}
          </button>
        </div>

        {/* Answer */}
        {answer && (
          <div className="card" ref={answerRef} style={{ marginTop: 16 }}>
            <div className="section-head" style={{ marginBottom: 8 }}>
              <h3>Answer</h3>
              <span className={`badge ${answer.configured ? "badge-ok" : "badge-err"}`}>
                {answer.model}
              </span>
            </div>
            <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{answer.text}</p>
            {answer.citations.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div className="dim" style={{ fontSize: 12, marginBottom: 4 }}>
                  Evidence used:
                </div>
                <ul style={{ listStyle: "disc", paddingLeft: 20, margin: 0 }}>
                  {answer.citations.map((c, i) => (
                    <li key={i} className="dim" style={{ fontSize: 12 }}>
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
