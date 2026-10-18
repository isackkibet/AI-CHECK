import { useCallback, useEffect, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { api, type MapNode } from "../lib/api";

interface Props {
  onSelectFile: (filePath: string) => void;
}

function toFlowNodes(mapNodes: MapNode[]): Node[] {
  // Simple grid layout: ~6 columns, 160px apart
  return mapNodes.map((n, i) => ({
    id: n.id,
    data: {
      label: n.id.split("/").pop() ?? n.id,
      fullPath: n.id,
      recentlyChanged: n.recentlyChanged,
    },
    position: {
      x: (i % 6) * 220,
      y: Math.floor(i / 6) * 100,
    },
    style: {
      background: n.recentlyChanged ? "rgba(139,92,246,0.25)" : "var(--bg-elev)",
      border: n.recentlyChanged ? "1.5px solid var(--accent)" : "1px solid var(--border)",
      borderRadius: 8,
      color: "var(--text-h)",
      fontSize: 11,
      padding: "6px 10px",
    },
  }));
}

function toFlowEdges(rawEdges: { source: string; target: string }[]): Edge[] {
  return rawEdges.map((e, i) => ({
    id: `e${i}`,
    source: e.source,
    target: e.target,
    animated: false,
    style: { stroke: "var(--border)", strokeWidth: 1 },
  }));
}

export function CodebaseMapPage({ onSelectFile }: Props) {
  const [projects, setProjects] = useState<
    Array<{ projectPath: string; sessionCount: number; lastSeen: string }>
  >([]);
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [customPath, setCustomPath] = useState("");
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileCount, setFileCount] = useState(0);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  useEffect(() => {
    api.codebases().then((r) => setProjects(r.projects)).catch(() => {});
  }, []);

  const loadMap = useCallback(async (projectPath: string) => {
    setError(null);
    setScanning(true);
    try {
      const map = await api.codebaseMap(projectPath);
      setNodes(toFlowNodes(map.nodes));
      setEdges(toFlowEdges(map.edges));
      setFileCount(map.nodes.length);
    } catch (e) {
      setError(String(e));
    } finally {
      setScanning(false);
    }
  }, [setNodes, setEdges]);

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const fullPath = (node.data as { fullPath: string }).fullPath;
      onSelectFile(fullPath);
    },
    [onSelectFile],
  );

  const handleScan = async () => {
    const path = customPath.trim() || selectedProject;
    if (!path) return;
    setError(null);
    setScanning(true);
    try {
      await api.scanProject(path);
      await loadMap(path);
    } catch (e) {
      setError(String(e));
      setScanning(false);
    }
  };

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">PROJECT STRUCTURE</span>
          <h1>Codebase map</h1>
          <p className="page-description">See how files connect and spot recently changed areas.</p>
        </div>
      </div>
      <div className="toolbar" style={{ flexWrap: "wrap", gap: 8 }}>
        {projects.length > 0 && (
          <select
            className="filter-select"
            value={selectedProject}
            onChange={(e) => {
              setSelectedProject(e.target.value);
              if (e.target.value) loadMap(e.target.value);
            }}
            aria-label="Select known project"
          >
            <option value="">Known projects…</option>
            {projects.map((p) => (
              <option key={p.projectPath} value={p.projectPath}>
                {p.projectPath.split("/").slice(-2).join("/")}
              </option>
            ))}
          </select>
        )}
        <input
          className="search-input project-path-input"
          type="text"
          placeholder="Or enter project path…"
          value={customPath}
          onChange={(e) => setCustomPath(e.target.value)}
          style={{ flex: 1 }}
          aria-label="Project path"
        />
        <button className="btn btn-primary" onClick={handleScan} disabled={scanning}>
          {scanning ? "Scanning…" : "Scan & Map"}
        </button>
        {fileCount > 0 && (
          <span className="dim" style={{ fontSize: 12 }}>
            {fileCount} nodes · {edges.length} imports
          </span>
        )}
      </div>

      {error && <div className="error-banner">{error}</div>}

      {/* Map */}
      {nodes.length === 0 && !scanning ? (
        <div className="page-empty">
          <span style={{ fontSize: 32 }}>🗺</span>
          <p>Select or enter a project path to visualize its module graph.</p>
          <p className="dim">
            Purple nodes were recently edited by an AI agent.
          </p>
        </div>
      ) : (
        <div className="map-canvas">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={handleNodeClick}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            attributionPosition="bottom-right"
          >
            <Background color="var(--border)" gap={24} />
            <Controls />
            <MiniMap
              nodeColor={(n) =>
                (n.data as { recentlyChanged?: boolean }).recentlyChanged
                  ? "#8b5cf6"
                  : "#262a38"
              }
              style={{ background: "var(--bg-elev)" }}
            />
          </ReactFlow>
        </div>
      )}
    </div>
  );
}
