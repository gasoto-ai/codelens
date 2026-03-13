/**
 * Tests for the dependency graph engine.
 * buildDependencyGraph and parseInternalImports are pure functions — no mocks needed.
 */

import { buildDependencyGraph, parseInternalImports } from "../lib/analyzer"

// ─── parseInternalImports ─────────────────────────────────────────────────────

describe("parseInternalImports", () => {
  const knownFiles = [
    "src/lib/utils.ts",
    "src/lib/db.ts",
    "src/components/Button.tsx",
    "src/app/page.tsx",
    "src/index.ts",
  ]

  it("parses ES module relative imports", () => {
    const content = `
      import { foo } from './utils'
      import { bar } from './db'
    `
    const result = parseInternalImports(content, "src/lib/analyzer.ts", knownFiles)
    expect(result).toContain("src/lib/utils.ts")
    expect(result).toContain("src/lib/db.ts")
  })

  it("parses default and namespace imports", () => {
    const content = `
      import Button from '../components/Button'
      import * as DB from './db'
    `
    const result = parseInternalImports(content, "src/lib/something.ts", knownFiles)
    expect(result).toContain("src/components/Button.tsx")
    expect(result).toContain("src/lib/db.ts")
  })

  it("parses side-effect imports", () => {
    const content = `import './utils'`
    const result = parseInternalImports(content, "src/lib/init.ts", knownFiles)
    expect(result).toContain("src/lib/utils.ts")
  })

  it("parses CommonJS require", () => {
    const content = `const utils = require('./utils')`
    const result = parseInternalImports(content, "src/lib/something.ts", knownFiles)
    expect(result).toContain("src/lib/utils.ts")
  })

  it("parses @/ path alias imports", () => {
    const content = `import { getDb } from '@/lib/db'`
    const result = parseInternalImports(content, "src/app/page.tsx", knownFiles)
    expect(result).toContain("src/lib/db.ts")
  })

  it("ignores node_modules imports", () => {
    const content = `
      import React from 'react'
      import { NextResponse } from 'next/server'
      import { z } from 'zod'
    `
    const result = parseInternalImports(content, "src/app/page.tsx", knownFiles)
    expect(result).toHaveLength(0)
  })

  it("deduplicates repeated imports of the same file", () => {
    const content = `
      import { foo } from './utils'
      import { bar } from './utils'
    `
    const result = parseInternalImports(content, "src/lib/something.ts", knownFiles)
    const utils = result.filter((r) => r === "src/lib/utils.ts")
    expect(utils).toHaveLength(1)
  })

  it("returns empty array for files with no internal imports", () => {
    const content = `
      export const PI = 3.14
      export function add(a: number, b: number) { return a + b }
    `
    const result = parseInternalImports(content, "src/lib/math.ts", knownFiles)
    expect(result).toHaveLength(0)
  })

  it("resolves parent directory traversal (../)", () => {
    const content = `import { Button } from '../components/Button'`
    const result = parseInternalImports(content, "src/app/page.tsx", knownFiles)
    expect(result).toContain("src/components/Button.tsx")
  })

  it("returns empty when imported file is not in knownFiles", () => {
    const content = `import { thing } from './nonexistent-module'`
    const result = parseInternalImports(content, "src/lib/something.ts", knownFiles)
    expect(result).toHaveLength(0)
  })
})

// ─── buildDependencyGraph ─────────────────────────────────────────────────────

describe("buildDependencyGraph", () => {
  it("builds correct importedBy for hub files", () => {
    // utils.ts is imported by 3 files — should be the top hub
    const fileContents = {
      "src/lib/utils.ts": `export const helper = () => {}`,
      "src/app/page.tsx": `import { helper } from '../lib/utils'`,
      "src/app/layout.tsx": `import { helper } from '../lib/utils'`,
      "src/components/Nav.tsx": `import { helper } from '../lib/utils'`,
    }

    const graph = buildDependencyGraph(fileContents)
    const utilsNode = graph.nodes.find((n) => n.file === "src/lib/utils.ts")

    expect(utilsNode).toBeDefined()
    expect(utilsNode!.importedBy).toHaveLength(3)
    expect(utilsNode!.importedBy).toContain("src/app/page.tsx")
    expect(utilsNode!.importedBy).toContain("src/app/layout.tsx")
    expect(utilsNode!.importedBy).toContain("src/components/Nav.tsx")
  })

  it("correctly identifies hub files (fan-in ≥ 2)", () => {
    const fileContents = {
      "src/lib/db.ts": `export const getDb = () => {}`,
      "src/lib/utils.ts": `export const helper = () => {}`,
      "src/routes/a.ts": `import { getDb } from '../lib/db'\nimport { helper } from '../lib/utils'`,
      "src/routes/b.ts": `import { getDb } from '../lib/db'`,
      "src/routes/c.ts": `import { getDb } from '../lib/db'`,
    }

    const graph = buildDependencyGraph(fileContents)

    // db.ts has fan-in 3, utils.ts has fan-in 1
    expect(graph.hubFiles).toHaveLength(1)
    expect(graph.hubFiles[0].file).toBe("src/lib/db.ts")
    expect(graph.hubFiles[0].fanIn).toBe(3)
  })

  it("orders hub files by descending fan-in", () => {
    const fileContents = {
      "src/lib/a.ts": ``,
      "src/lib/b.ts": ``,
      "src/lib/c.ts": ``,
      "src/x.ts": `import {} from './lib/a'\nimport {} from './lib/b'\nimport {} from './lib/c'`,
      "src/y.ts": `import {} from './lib/a'\nimport {} from './lib/b'`,
      "src/z.ts": `import {} from './lib/a'`,
    }

    const graph = buildDependencyGraph(fileContents)

    // a: fan-in 3, b: fan-in 2 (both ≥ 2 → both hubs)
    expect(graph.hubFiles[0].file).toBe("src/lib/a.ts")
    expect(graph.hubFiles[0].fanIn).toBe(3)
    expect(graph.hubFiles[1].file).toBe("src/lib/b.ts")
    expect(graph.hubFiles[1].fanIn).toBe(2)
  })

  it("caps hub files at 5", () => {
    // Create 7 hub files, each imported by 2+ files
    const fileContents: Record<string, string> = {}
    for (let i = 0; i < 7; i++) {
      fileContents[`src/lib/mod${i}.ts`] = ``
    }
    // Two importers each
    fileContents["src/a.ts"] = Array.from(
      { length: 7 },
      (_, i) => `import {} from './lib/mod${i}'`
    ).join("\n")
    fileContents["src/b.ts"] = Array.from(
      { length: 7 },
      (_, i) => `import {} from './lib/mod${i}'`
    ).join("\n")

    const graph = buildDependencyGraph(fileContents)
    expect(graph.hubFiles.length).toBeLessThanOrEqual(5)
  })

  it("identifies orphan files (no imports, not imported)", () => {
    const fileContents = {
      "src/lib/utils.ts": `export const x = 1`,         // has an importer — not orphan
      "src/lib/math.ts": `export const PI = 3.14`,       // nothing imports this — orphan
      "src/lib/dead.ts": `export const y = 2`,           // nothing imports this — orphan
      "src/app/page.tsx": `import {} from '../lib/utils'`, // imports utils
    }

    const graph = buildDependencyGraph(fileContents)

    // math.ts and dead.ts are orphans; utils.ts has an importer; page.tsx has an import
    expect(graph.orphanFiles).toContain("src/lib/math.ts")
    expect(graph.orphanFiles).toContain("src/lib/dead.ts")
    expect(graph.orphanFiles).not.toContain("src/lib/utils.ts")
    expect(graph.orphanFiles).not.toContain("src/app/page.tsx")
  })

  it("returns no hubs for a linear chain (each file imports one other)", () => {
    const fileContents = {
      "src/a.ts": `import {} from './b'`,
      "src/b.ts": `import {} from './c'`,
      "src/c.ts": `export const x = 1`,
    }

    const graph = buildDependencyGraph(fileContents)
    // No file has fan-in ≥ 2
    expect(graph.hubFiles).toHaveLength(0)
  })

  it("handles empty input", () => {
    const graph = buildDependencyGraph({})
    expect(graph.nodes).toHaveLength(0)
    expect(graph.hubFiles).toHaveLength(0)
    expect(graph.orphanFiles).toHaveLength(0)
  })

  it("builds correct imports list per node", () => {
    const fileContents = {
      "src/lib/a.ts": ``,
      "src/lib/b.ts": ``,
      "src/app/main.ts": `
        import {} from '../lib/a'
        import {} from '../lib/b'
      `,
    }

    const graph = buildDependencyGraph(fileContents)
    const mainNode = graph.nodes.find((n) => n.file === "src/app/main.ts")

    expect(mainNode!.imports).toContain("src/lib/a.ts")
    expect(mainNode!.imports).toContain("src/lib/b.ts")
    expect(mainNode!.imports).toHaveLength(2)
  })
})
