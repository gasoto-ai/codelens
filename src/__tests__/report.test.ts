import { generateMarkdownReport, generatePlainSummary } from "../lib/report"
import type { AnalysisResult } from "../lib/analyzer"

const mockResult: AnalysisResult = {
  score: 72,
  findings: [
    {
      id: "ts-partial",
      category: "typescript",
      severity: "warn",
      title: "Partial TypeScript adoption",
      detail: "60% of files use TypeScript.",
      suggestion: "Migrate remaining JS files.",
      files: ["legacy.js"],
    },
    {
      id: "test-none",
      category: "testing",
      severity: "critical",
      title: "No tests found",
      detail: "No test files detected.",
      suggestion: "Add Jest.",
    },
    {
      id: "readme-good",
      category: "docs",
      severity: "info",
      title: "README looks good",
      detail: "README has setup instructions.",
      suggestion: "Consider adding architecture docs.",
    },
  ],
  metadata: {
    totalFiles: 20,
    tsFiles: 12,
    jsFiles: 8,
    testFiles: 0,
    languages: ["TypeScript", "JavaScript"],
    hasPackageJson: true,
    hasReadme: true,
    hasEslint: true,
    hasPrettier: false,
    hasTsConfig: true,
    deps: { next: "15.0.0" },
  },
}

describe("generateMarkdownReport", () => {
  it("includes repo name in output", () => {
    const md = generateMarkdownReport("gasoto-ai", "my-repo", mockResult)
    expect(md).toContain("gasoto-ai/my-repo")
  })

  it("includes the score", () => {
    const md = generateMarkdownReport("gasoto-ai", "my-repo", mockResult)
    expect(md).toContain("72/100")
  })

  it("includes all finding titles", () => {
    const md = generateMarkdownReport("gasoto-ai", "my-repo", mockResult)
    expect(md).toContain("Partial TypeScript adoption")
    expect(md).toContain("No tests found")
    expect(md).toContain("README looks good")
  })

  it("includes severity icons", () => {
    const md = generateMarkdownReport("gasoto-ai", "my-repo", mockResult)
    expect(md).toContain("🔴") // critical
    expect(md).toContain("🟡") // warn
    expect(md).toContain("🔵") // info
  })

  it("includes affected files when present", () => {
    const md = generateMarkdownReport("gasoto-ai", "my-repo", mockResult)
    expect(md).toContain("legacy.js")
  })

  it("includes file count metadata", () => {
    const md = generateMarkdownReport("gasoto-ai", "my-repo", mockResult)
    expect(md).toContain("20")
  })
})

describe("generatePlainSummary", () => {
  it("includes the score", () => {
    const summary = generatePlainSummary("gasoto-ai", "my-repo", mockResult)
    expect(summary).toContain("72/100")
  })

  it("includes the repo name", () => {
    const summary = generatePlainSummary("gasoto-ai", "my-repo", mockResult)
    expect(summary).toContain("gasoto-ai/my-repo")
  })

  it("mentions critical issue count", () => {
    const summary = generatePlainSummary("gasoto-ai", "my-repo", mockResult)
    expect(summary).toContain("1 critical issue")
  })

  it("mentions the top issue", () => {
    const summary = generatePlainSummary("gasoto-ai", "my-repo", mockResult)
    expect(summary.toLowerCase()).toContain("no tests found")
  })

  it("is a single paragraph (no newlines)", () => {
    const summary = generatePlainSummary("gasoto-ai", "my-repo", mockResult)
    expect(summary).not.toContain("\n")
  })

  it("says 'well-modernized' for score >= 80", () => {
    const highScore: AnalysisResult = { ...mockResult, score: 85 }
    const summary = generatePlainSummary("gasoto-ai", "my-repo", highScore)
    expect(summary).toContain("well-modernized")
  })

  it("says 'significantly outdated' for score < 40", () => {
    const lowScore: AnalysisResult = { ...mockResult, score: 25 }
    const summary = generatePlainSummary("gasoto-ai", "my-repo", lowScore)
    expect(summary).toContain("significantly outdated")
  })
})
