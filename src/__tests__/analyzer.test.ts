/**
 * Tests for the CodeLens static analysis engine.
 * We mock Octokit to control exactly what the analyzer "sees" in a repo,
 * then assert the right findings and score come back.
 */

import { analyzeRepo, type Finding } from "../lib/analyzer"
import { Octokit } from "@octokit/rest"

jest.mock("@octokit/rest")

const MockOctokit = Octokit as jest.MockedClass<typeof Octokit>

// Helpers to build mock API responses
function makeTree(paths: string[]) {
  return {
    data: {
      tree: paths.map((path) => ({
        path,
        type: "blob",
        sha: "abc123",
        size: 1000, // ~33 lines — not a god file
      })),
    },
  }
}

function makeFileContent(content: string) {
  return {
    data: {
      content: Buffer.from(content).toString("base64"),
      encoding: "base64",
    },
  }
}

function setupMocks(
  treePaths: string[],
  fileContent: (args: { path: string }) => ReturnType<typeof makeFileContent> = () => makeFileContent("{}")
) {
  MockOctokit.mockImplementation(() => ({
    repos: {
      get: jest.fn().mockResolvedValue({ data: { default_branch: "main" } }),
      getContent: jest.fn().mockImplementation(fileContent),
    },
    git: {
      getTree: jest.fn().mockResolvedValue(makeTree(treePaths)),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any))
}

beforeEach(() => {
  jest.clearAllMocks()
})

// ─── TypeScript ───────────────────────────────────────────────────────────────

describe("TypeScript analysis", () => {
  it("flags critical when no TypeScript files exist", async () => {
    setupMocks(["index.js", "utils.js", "components/App.jsx"])

    const result = await analyzeRepo("owner", "repo")
    const finding = result.findings.find((f) => f.id === "ts-none")

    expect(finding).toBeDefined()
    expect(finding?.severity).toBe("critical")
    expect(result.score).toBeLessThan(80)
  })

  it("warns on partial TypeScript adoption", async () => {
    setupMocks(["index.ts", "utils.js", "components/App.jsx", "server.js"])

    const result = await analyzeRepo("owner", "repo")
    const finding = result.findings.find((f) => f.id === "ts-partial")

    expect(finding).toBeDefined()
    expect(finding?.severity).toBe("warn")
    expect(finding?.files).toContain("utils.js")
  })

  it("reports good TypeScript when all code files are .ts/.tsx", async () => {
    setupMocks(["index.ts", "utils.ts", "components/App.tsx", "tsconfig.json"])

    const result = await analyzeRepo("owner", "repo")
    const finding = result.findings.find((f) => f.id === "ts-good")

    expect(finding).toBeDefined()
    expect(finding?.severity).toBe("info")
  })
})

// ─── Testing ──────────────────────────────────────────────────────────────────

describe("Testing analysis", () => {
  it("flags critical when no test files exist", async () => {
    setupMocks(["index.ts", "utils.ts", "components/App.tsx"])

    const result = await analyzeRepo("owner", "repo")
    const finding = result.findings.find((f) => f.id === "test-none")

    expect(finding).toBeDefined()
    expect(finding?.severity).toBe("critical")
  })

  it("warns on low test ratio", async () => {
    setupMocks([
      "index.ts", "utils.ts", "a.ts", "b.ts", "c.ts",
      "d.ts", "e.ts", "f.ts", "g.ts", "h.ts", "i.ts",
      "utils.test.ts", // only 1 test for 11 source files
    ])

    const result = await analyzeRepo("owner", "repo")
    const finding = result.findings.find((f) => f.id === "test-low")

    expect(finding).toBeDefined()
    expect(finding?.severity).toBe("warn")
  })

  it("passes when test files are present at healthy ratio", async () => {
    setupMocks(["index.ts", "utils.ts", "index.test.ts", "utils.test.ts"])

    const result = await analyzeRepo("owner", "repo")
    const finding = result.findings.find((f) => f.id === "test-good")

    expect(finding).toBeDefined()
    expect(finding?.severity).toBe("info")
  })

  it("detects test files in __tests__ directories", async () => {
    setupMocks([
      "index.ts", "utils.ts",
      "__tests__/index.test.ts", "__tests__/utils.test.ts",
    ])

    const result = await analyzeRepo("owner", "repo")
    expect(result.metadata.testFiles).toBe(2)
  })
})

// ─── Legacy dependencies ──────────────────────────────────────────────────────

describe("Dependency analysis", () => {
  it("flags critical for Create React App", async () => {
    setupMocks(
      ["index.tsx", "App.tsx", "App.test.tsx", "package.json"],
      () => makeFileContent(JSON.stringify({ dependencies: { "react-scripts": "5.0.1", react: "18.0.0" } }))
    )

    const result = await analyzeRepo("owner", "repo")
    const finding = result.findings.find((f) => f.id === "deps-cra")

    expect(finding).toBeDefined()
    expect(finding?.severity).toBe("critical")
  })

  it("warns about moment.js", async () => {
    setupMocks(
      ["index.ts", "utils.ts", "utils.test.ts", "package.json"],
      () => makeFileContent(JSON.stringify({ dependencies: { moment: "2.29.0" } }))
    )

    const result = await analyzeRepo("owner", "repo")
    const finding = result.findings.find((f) => f.id === "deps-moment")

    expect(finding).toBeDefined()
    expect(finding?.severity).toBe("warn")
  })

  it("flags tslint as critical", async () => {
    setupMocks(
      ["index.ts", "utils.ts", "utils.test.ts", "package.json"],
      () => makeFileContent(JSON.stringify({ devDependencies: { tslint: "5.20.1" } }))
    )

    const result = await analyzeRepo("owner", "repo")
    const finding = result.findings.find((f) => f.id === "deps-tslint")

    expect(finding).toBeDefined()
    expect(finding?.severity).toBe("critical")
  })

  it("passes clean for modern deps", async () => {
    setupMocks(
      ["index.ts", "utils.ts", "index.test.ts", "package.json"],
      () => makeFileContent(JSON.stringify({ dependencies: { next: "15.0.0", react: "18.3.0" } }))
    )

    const result = await analyzeRepo("owner", "repo")
    const finding = result.findings.find((f) => f.id === "deps-clean")

    expect(finding).toBeDefined()
    expect(finding?.severity).toBe("info")
  })
})

// ─── Documentation ────────────────────────────────────────────────────────────

describe("Documentation analysis", () => {
  it("warns when no README exists", async () => {
    setupMocks(["index.ts", "utils.ts"])

    const result = await analyzeRepo("owner", "repo")
    const finding = result.findings.find((f) => f.id === "readme-none")

    expect(finding).toBeDefined()
    expect(finding?.severity).toBe("warn")
  })

  it("flags thin README missing setup section", async () => {
    setupMocks(
      ["index.ts", "utils.ts", "README.md"],
      () => makeFileContent("# My Project\n\nThis is a project.")
    )

    const result = await analyzeRepo("owner", "repo")
    const finding = result.findings.find((f) => f.id === "readme-thin")

    expect(finding).toBeDefined()
    expect(finding?.severity).toBe("info")
  })

  it("passes README with setup section", async () => {
    setupMocks(
      ["index.ts", "utils.ts", "README.md"],
      () => makeFileContent("# My Project\n\n## Installation\n\n```\nnpm install\n```")
    )

    const result = await analyzeRepo("owner", "repo")
    const finding = result.findings.find((f) => f.id === "readme-good")

    expect(finding).toBeDefined()
    expect(finding?.severity).toBe("info")
  })
})

// ─── Scoring ──────────────────────────────────────────────────────────────────

describe("Score calculation", () => {
  it("returns 100 for a fully modern repo", async () => {
    setupMocks(
      [
        "index.ts", "utils.ts", "server.ts",
        "index.test.ts", "utils.test.ts",
        "tsconfig.json", ".eslintrc.json", ".prettierrc",
        "README.md", "package.json",
      ],
      ({ path }: { path: string }) => {
        if (path === "package.json") {
          return makeFileContent(JSON.stringify({ dependencies: { next: "15.0.0" } }))
        }
        if (path === "README.md") {
          return makeFileContent("# Project\n\n## Installation\n\nnpm install")
        }
        return makeFileContent("{}")
      }
    )

    const result = await analyzeRepo("owner", "repo")
    expect(result.score).toBe(100)
  })

  it("deducts 20 points per critical finding", async () => {
    // No TS, no tests = 2 criticals = -40
    setupMocks(["index.js", "utils.js"])

    const result = await analyzeRepo("owner", "repo")
    const criticals = result.findings.filter((f: Finding) => f.severity === "critical")
    expect(result.score).toBeLessThanOrEqual(100 - criticals.length * 20)
  })

  it("score is never below 0", async () => {
    setupMocks(
      ["index.js", "utils.js", "package.json"],
      () => makeFileContent(JSON.stringify({
        dependencies: { "react-scripts": "5.0.0" },
        devDependencies: { tslint: "5.20.1" },
      }))
    )

    const result = await analyzeRepo("owner", "repo")
    expect(result.score).toBeGreaterThanOrEqual(0)
  })
})

// ─── Metadata ─────────────────────────────────────────────────────────────────

describe("Metadata extraction", () => {
  it("correctly counts TS, JS, and test files", async () => {
    setupMocks([
      "index.ts", "server.ts",
      "legacy.js",
      "index.test.ts", "server.spec.ts",
    ])

    const result = await analyzeRepo("owner", "repo")
    // .test.ts files are also .ts files — both counts include them
    expect(result.metadata.tsFiles).toBe(4) // index.ts, server.ts, index.test.ts, server.spec.ts
    expect(result.metadata.jsFiles).toBe(1) // legacy.js
    expect(result.metadata.testFiles).toBe(2) // index.test.ts, server.spec.ts
  })

  it("detects Python in a mixed repo", async () => {
    setupMocks(["main.py", "utils.py", "index.ts"])

    const result = await analyzeRepo("owner", "repo")
    expect(result.metadata.languages).toContain("Python")
    expect(result.metadata.languages).toContain("TypeScript")
  })
})

// ─── Coupling analysis ────────────────────────────────────────────────────────

describe("Coupling analysis", () => {
  it("reports coupling-clean when no highly coupled files are found", async () => {
    // Simple repo where no file is imported by 2+ others
    setupMocks(
      ["src/index.ts", "src/utils.ts", "src/server.ts"],
      ({ path }: { path: string }) => {
        if (path === "src/index.ts") {
          return makeFileContent(`import { helper } from './utils'`)
        }
        return makeFileContent(`export const x = 1`)
      }
    )

    const result = await analyzeRepo("owner", "repo")
    const finding = result.findings.find((f) => f.id === "coupling-clean")
    expect(finding).toBeDefined()
    expect(finding?.category).toBe("coupling")
  })

  it("reports coupling-hubs when a file is imported by 2+ others", async () => {
    // utils.ts imported by both page.ts and server.ts
    setupMocks(
      ["src/lib/utils.ts", "src/app/page.ts", "src/app/server.ts"],
      ({ path }: { path: string }) => {
        if (path === "src/app/page.ts") {
          return makeFileContent(`import { helper } from '../lib/utils'`)
        }
        if (path === "src/app/server.ts") {
          return makeFileContent(`import { helper } from '../lib/utils'`)
        }
        return makeFileContent(`export const helper = () => {}`)
      }
    )

    const result = await analyzeRepo("owner", "repo")
    const finding = result.findings.find((f) => f.id === "coupling-hubs")
    expect(finding).toBeDefined()
    expect(finding?.category).toBe("coupling")
    expect(finding?.files?.[0]).toContain("src/lib/utils.ts")
    expect(finding?.files?.[0]).toContain("2 importers")
  })

  it("coupling findings do not affect the score (info severity only)", async () => {
    setupMocks(
      [
        "src/lib/utils.ts", "src/app/page.ts", "src/app/server.ts",
        "src/index.test.ts", "tsconfig.json", ".eslintrc.json", ".prettierrc",
        "README.md", "package.json",
      ],
      ({ path }: { path: string }) => {
        if (path === "src/app/page.ts") {
          return makeFileContent(`import { helper } from '../lib/utils'`)
        }
        if (path === "src/app/server.ts") {
          return makeFileContent(`import { helper } from '../lib/utils'`)
        }
        if (path === "package.json") {
          return makeFileContent(JSON.stringify({ dependencies: { next: "15.0.0" } }))
        }
        if (path === "README.md") {
          return makeFileContent("# Project\n\n## Installation\n\nnpm install")
        }
        return makeFileContent(`export const helper = () => {}`)
      }
    )

    const result = await analyzeRepo("owner", "repo")
    const couplingFindings = result.findings.filter((f) => f.category === "coupling")
    // All coupling findings should be info — no score impact
    expect(couplingFindings.every((f) => f.severity === "info")).toBe(true)
    expect(result.score).toBe(100)
  })
})
