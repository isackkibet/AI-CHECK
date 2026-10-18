/**
 * Import specifier extraction for JS/TS source files.
 *
 * Uses regex matching rather than a full AST for the MVP: it covers the common
 * forms (ESM static imports, dynamic import(), and require()) and is fast and
 * dependency-free. A real parser can replace this later for edge cases.
 *
 * Only the specifiers are extracted here; resolving them to actual files is the
 * scanner's job (src/codebase/scanner.ts).
 */

// import "x"  |  import a from "x"  |  import { a } from "x"  |  import * as n from "x"
const ESM_IMPORT = /import\s+(?:[^\n;]*?\s+from\s+)?["']([^"'\n]+)["']/g;
// require("x")
const REQUIRE = /\brequire\(\s*["']([^"'\n]+)["']\s*\)/g;
// import("x")
const DYNAMIC_IMPORT = /\bimport\(\s*["']([^"'\n]+)["']\s*\)/g;

/** Return the import/require specifiers found in a source string. */
export function extractImportSpecifiers(source: string): string[] {
  const specs = new Set<string>();
  for (const re of [ESM_IMPORT, REQUIRE, DYNAMIC_IMPORT]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) {
      const spec = m[1];
      // Skip node built-ins and virtual module specifiers.
      if (spec && !spec.startsWith("node:") && !spec.startsWith("bun:")) {
        specs.add(spec);
      }
    }
  }
  return [...specs];
}
