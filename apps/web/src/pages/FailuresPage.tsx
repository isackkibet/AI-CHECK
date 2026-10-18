import { useEffect, useState } from "react";
import { api, type FailureGroup, type FailureOccurrence } from "../lib/api";

export function FailuresPage() {
  const [groups, setGroups] = useState<FailureGroup[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<{
    group: FailureGroup;
    occurrences: FailureOccurrence[];
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.failures().then(setGroups).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selected) { setDetail(null); return; }
    api.failureDetail(selected).then(setDetail);
  }, [selected]);

  const handleResolve = async (id: string, resolved: boolean) => {
    await api.resolveFailure(id, resolved);
    setGroups((prev) =>
      prev.map((g) => (g.id === id ? { ...g, resolved: resolved ? 1 : 0 } : g)),
    );
  };

  if (loading) return <div className="page-empty">Loading failures…</div>;
  if (groups.length === 0)
    return (
      <div className="page-empty">
        <span style={{ fontSize: 32 }}>✅</span>
        <p>No failures recorded yet.</p>
        <p className="dim">Tool errors will appear here, grouped by type.</p>
      </div>
    );

  return (
    <div className="page failures-layout">
      {/* Left: ranked list */}
      <aside className="failures-list">
        <div className="section-head">
          <h2>Failures</h2>
          <span className="dim">{groups.length} groups</span>
        </div>
        {groups.map((g) => (
          <button
            key={g.id}
            className={`failure-row ${selected === g.id ? "active" : ""} ${g.resolved ? "resolved" : ""}`}
            onClick={() => setSelected(g.id === selected ? null : g.id)}
          >
            <div className="failure-row-top">
              <span className="failure-count">{g.occurrenceCount}×</span>
              <span className="failure-type">{g.errorType ?? "error"}</span>
              {g.resolved === 1 && <span className="badge-resolved">Resolved</span>}
            </div>
            <div className="failure-msg">{g.normalizedMessage}</div>
            <div className="failure-dates dim">
              First: {new Date(g.firstSeen).toLocaleString()} · Last: {new Date(g.lastSeen).toLocaleString()}
            </div>
          </button>
        ))}
      </aside>

      {/* Right: detail */}
      <section className="failures-detail">
        {!detail ? (
          <div className="page-empty">Select a failure to see evidence</div>
        ) : (
          <>
            <div className="section-head">
              <h2>{detail.group.errorType ?? "error"}</h2>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className="btn"
                  onClick={() =>
                    handleResolve(detail.group.id, detail.group.resolved !== 1)
                  }
                >
                  {detail.group.resolved === 1 ? "Mark Unresolved" : "Mark Resolved"}
                </button>
              </div>
            </div>
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="dim" style={{ marginBottom: 4 }}>Normalized signature</div>
              <code>{detail.group.normalizedMessage}</code>
              <div className="dim" style={{ marginTop: 8 }}>
                {detail.group.occurrenceCount} occurrences · first{" "}
                {new Date(detail.group.firstSeen).toLocaleString()} · last{" "}
                {new Date(detail.group.lastSeen).toLocaleString()}
              </div>
            </div>

            <h3 style={{ marginBottom: 8 }}>Recent evidence</h3>
            <ol className="occurrence-list" aria-label="Failure occurrences">
              {detail.occurrences.map((o, i) => (
                <li key={i} className="occurrence-item">
                  <div className="occurrence-time dim">
                    {new Date(o.timestamp).toLocaleString()}
                  </div>
                  {o.command && (
                    <code className="occurrence-cmd">$ {o.command}</code>
                  )}
                  {o.exitCode != null && (
                    <span className={`badge ${o.exitCode === 0 ? "badge-ok" : "badge-err"}`}>
                      exit {o.exitCode}
                    </span>
                  )}
                  {o.message && (
                    <div className="occurrence-msg">{o.message}</div>
                  )}
                  {o.filePath && (
                    <code className="timeline-file">{o.filePath}</code>
                  )}
                </li>
              ))}
            </ol>
          </>
        )}
      </section>
    </div>
  );
}
