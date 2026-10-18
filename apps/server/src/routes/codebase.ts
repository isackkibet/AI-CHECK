import { type Express } from "express";
import { resolve } from "node:path";
import { scanProject } from "../codebase/scanner";
import {
  replaceDependencyEdges,
  getDependencyEdges,
  getFileChanges,
} from "../database/repository";

/** Mount codebase scan + map routes. */
export function mountCodebaseRoutes(app: Express): void {
  /** List project paths discovered from Claude Code sessions (for the picker). */
  app.get("/api/codebase/projects", (_req, res) => {
    const rows = getDbSafe()
      .prepare(
        "SELECT project_path AS projectPath, COUNT(*) AS sessionCount, MAX(last_seen) AS lastSeen FROM sessions WHERE project_path IS NOT NULL AND project_path != '' GROUP BY project_path ORDER BY lastSeen DESC",
      )
      .all();
    res.json({ projects: rows });
  });

  /** Scan a project: extract imports and store the dependency graph. */
  app.post("/api/codebase/scan", (req, res) => {
    const projectPath = String(req.body?.projectPath ?? "").trim();
    if (!projectPath) {
      res.status(400).json({ error: "projectPath required" });
      return;
    }
    try {
      const result = scanProject(projectPath);
      replaceDependencyEdges(result.projectPath, result.edges);
      res.json({
        projectPath: result.projectPath,
        fileCount: result.fileCount,
        edgeCount: result.edges.length,
        truncated: result.truncated,
      });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  /** Return nodes + edges for the codebase map. Auto-scans if not scanned yet. */
  app.get("/api/codebase/map", (req, res) => {
    const rawPath = String(req.query.projectPath ?? "").trim();
    if (!rawPath) {
      res.status(400).json({ error: "projectPath required" });
      return;
    }
    const projectPath = resolve(rawPath);
    let edges = getDependencyEdges(projectPath);
    let scanned = true;

    if (edges.length === 0) {
      try {
        const result = scanProject(rawPath); // scanner resolves to absolute
        replaceDependencyEdges(result.projectPath, result.edges);
        edges = getDependencyEdges(result.projectPath);
      } catch {
        scanned = false;
      }
    }

    const nodeSet = new Set<string>();
    for (const e of edges) {
      nodeSet.add(e.source);
      nodeSet.add(e.target);
    }

    // Cross-reference file_changes to flag recently-modified nodes (glow).
    const changes = getFileChanges(500);
    const changedRel = new Set<string>();
    for (const c of changes) {
      for (const n of nodeSet) {
        if (
          c.filePath === n ||
          c.filePath.endsWith("/" + n) ||
          n.endsWith("/" + c.filePath)
        ) {
          changedRel.add(n);
        }
      }
    }

    const nodes = [...nodeSet]
      .sort()
      .map((id) => ({ id, recentlyChanged: changedRel.has(id) }));

    res.json({ projectPath, scanned, nodes, edges });
  });
}

// Local helper to avoid a circular import in tests; uses the live DB.
import { getDb } from "../database/db";
function getDbSafe() {
  return getDb();
}
