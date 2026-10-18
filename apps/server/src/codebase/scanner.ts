/**
 * Codebase scanner. Walks a project directory, finds JS/TS source files, and
 * extracts import relationships to build a dependency graph. Output nodes and
 * edges use paths relative to the project root so they stay portable.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, resolve, sep } from "node:path";
import { extractImportSpecifiers } from "./imports";

const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "coverage",
  ".cache",
  "out",
  ".turbo",
  ".vite",
]);
const CODE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const RESOLVE_EXTS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
const MAX_FILES = 5000;

export interface ScanResult {
  projectPath: string;
  nodes: string[];
  edges: Array<{ source: string; target: string }>;
  fileCount: number;
  truncated: boolean;
}

/** Resolve a relative/absolute import specifier to an actual file, or null. */
function resolveSpec(
  spec: string,
  importerDir: string,
): string | null {
  // Only resolve relative or absolute specs; bare specifiers (e.g. "react")
  // point into node_modules and are out of scope for the graph.
  if (!spec.startsWith(".") && !spec.startsWith("/")) return null;

  const base = spec.startsWith("/")
    ? resolve(spec)
    : resolve(importerDir, spec);

  const candidates: string[] = [base];
  for (const ext of RESOLVE_EXTS) candidates.push(base + ext);
  for (const ext of RESOLVE_EXTS) candidates.push(join(base, "index" + ext));

  for (const c of candidates) {
    try {
      if (statSync(c).isFile()) return c;
    } catch {
      // not found, try next
    }
  }
  return null;
}

/** Recursively collect source files under a directory. */
function collectFiles(dir: string, acc: string[], depth: number): void {
  if (acc.length >= MAX_FILES || depth > 12) return;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (name.startsWith(".") && IGNORED_DIRS.has(name)) continue;
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (IGNORED_DIRS.has(name)) continue;
      collectFiles(full, acc, depth + 1);
    } else if (st.isFile() && CODE_EXT.has(extname(name))) {
      acc.push(full);
      if (acc.length >= MAX_FILES) return;
    }
  }
}

/** Scan a project: returns relative nodes and import edges. */
export function scanProject(projectPath: string): ScanResult {
  const root = resolve(projectPath);
  const files: string[] = [];
  collectFiles(root, files, 0);

  const edges: Array<{ source: string; target: string }> = [];
  const nodeSet = new Set<string>();

  for (const file of files) {
    const relFile = relative(root, file);
    nodeSet.add(relFile);
    let source: string;
    try {
      source = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const spec of extractImportSpecifiers(source)) {
      const target = resolveSpec(spec, file);
      if (!target) continue;
      const relTarget = relative(root, target);
      // Only keep edges that resolve inside the project.
      if (relTarget.startsWith("..")) continue;
      nodeSet.add(relTarget);
      if (relFile !== relTarget) {
        edges.push({ source: relFile, target: relTarget });
      }
    }
  }

  return {
    projectPath: root,
    nodes: [...nodeSet].sort(),
    edges,
    fileCount: files.length,
    truncated: files.length >= MAX_FILES,
  };
}
