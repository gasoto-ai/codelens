/**
 * TDD tests for POST /api/analyze.
 * Tests the URL parsing, caching logic, job creation, and error handling.
 * analyzeRepo is mocked so we don't hit GitHub.
 */

const mockDb = {
  prepare: jest.fn(),
}

jest.mock("@/lib/db", () => ({
  getDb: () => mockDb,
}))

jest.mock("@/lib/analyzer", () => ({
  analyzeRepo: jest.fn(),
}))

jest.mock("next/server", () => ({
  NextResponse: {
    json: jest.fn().mockImplementation((data, init) => ({
      data,
      status: init?.status ?? 200,
    })),
  },
}))

import { POST as analyze } from "../../app/api/analyze/route"
import { analyzeRepo } from "@/lib/analyzer"

const mockAnalyze = analyzeRepo as jest.MockedFunction<typeof analyzeRepo>

function makeRequest(body?: unknown) {
  return {
    json: jest.fn().mockResolvedValue(body),
  } as unknown as Request
}

function makeStmt(returnValue: unknown) {
  return {
    all: jest.fn().mockReturnValue(returnValue),
    get: jest.fn().mockReturnValue(returnValue),
    run: jest.fn().mockReturnValue({ lastInsertRowid: 1 }),
  }
}

const mockResult = {
  score: 85,
  findings: [],
  metadata: {
    totalFiles: 20,
    tsFiles: 18,
    jsFiles: 2,
    testFiles: 5,
    languages: ["TypeScript"],
    hasPackageJson: true,
    hasReadme: true,
    hasEslint: true,
    hasPrettier: true,
    hasTsConfig: true,
    deps: {},
  },
}

beforeEach(() => jest.clearAllMocks())

// ─── Input validation ─────────────────────────────────────────────────────────

describe("POST /api/analyze — validation", () => {
  it("returns 400 when repoUrl is missing", async () => {
    const res = await analyze(makeRequest({}) as never)
    expect((res as { status: number }).status).toBe(400)
  })

  it("returns 400 for non-GitHub URLs", async () => {
    const res = await analyze(makeRequest({ repoUrl: "https://gitlab.com/owner/repo" }) as never)
    expect((res as { status: number }).status).toBe(400)
  })

  it("returns 400 for malformed URL strings", async () => {
    const res = await analyze(makeRequest({ repoUrl: "not-a-url" }) as never)
    expect((res as { status: number }).status).toBe(400)
  })

  it("accepts a valid github.com URL", async () => {
    mockDb.prepare.mockReturnValue(makeStmt(undefined)) // no cache
    mockAnalyze.mockResolvedValue(mockResult as never)

    const res = await analyze(makeRequest({ repoUrl: "https://github.com/gasoto-ai/codelens" }) as never)
    expect((res as { status: number }).status).not.toBe(400)
  })
})

// ─── Caching ──────────────────────────────────────────────────────────────────

describe("POST /api/analyze — caching", () => {
  it("returns cached result when recent complete job exists", async () => {
    mockDb.prepare.mockReturnValue(makeStmt({ id: 42 })) // cache hit

    const res = await analyze(makeRequest({ repoUrl: "https://github.com/gasoto-ai/codelens" }) as never)
    expect((res as { data: { jobId: number; cached: boolean } }).data.cached).toBe(true)
    expect((res as { data: { jobId: number } }).data.jobId).toBe(42)
  })

  it("does not call analyzeRepo when serving from cache", async () => {
    mockDb.prepare.mockReturnValue(makeStmt({ id: 42 }))

    await analyze(makeRequest({ repoUrl: "https://github.com/gasoto-ai/codelens" }) as never)
    expect(mockAnalyze).not.toHaveBeenCalled()
  })

  it("creates a new job when no recent cache exists", async () => {
    mockDb.prepare.mockReturnValue(makeStmt(undefined)) // no cache
    mockAnalyze.mockResolvedValue(mockResult as never)

    const res = await analyze(makeRequest({ repoUrl: "https://github.com/gasoto-ai/codelens" }) as never)
    expect((res as { data: { cached: boolean } }).data.cached).toBe(false)
  })
})

// ─── Error handling ────────────────────────────────────────────────────────────

describe("POST /api/analyze — error handling", () => {
  it("returns 500 when analyzeRepo throws", async () => {
    mockDb.prepare.mockReturnValue(makeStmt(undefined))
    mockAnalyze.mockRejectedValue(new Error("GitHub API rate limited"))

    const res = await analyze(makeRequest({ repoUrl: "https://github.com/gasoto-ai/codelens" }) as never)
    expect((res as { status: number }).status).toBe(500)
  })

  it("parses owner and repo correctly from URL", async () => {
    mockDb.prepare.mockReturnValue(makeStmt(undefined))
    mockAnalyze.mockResolvedValue(mockResult as never)

    await analyze(makeRequest({ repoUrl: "https://github.com/gasoto-ai/codelens" }) as never)

    expect(mockAnalyze).toHaveBeenCalledWith("gasoto-ai", "codelens")
  })
})
