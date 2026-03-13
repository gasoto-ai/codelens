/**
 * TDD tests for GET /api/analysis/[id] and GET /api/analysis/[id]/report.
 */

const mockDb = {
  prepare: jest.fn(),
}

jest.mock("@/lib/db", () => ({
  getDb: () => mockDb,
}))

// Mock NextResponse to handle both .json() and new NextResponse() calls
jest.mock("next/server", () => {
  function MockNextResponse(
    this: { _body: unknown; status: number },
    body: unknown,
    init?: { status?: number }
  ) {
    this._body = body
    this.status = init?.status ?? 200
  }
  MockNextResponse.json = jest.fn().mockImplementation(
    (data: unknown, init?: { status?: number }) => ({
      data,
      status: init?.status ?? 200,
    })
  )
  return { NextResponse: MockNextResponse }
})

import { GET as getAnalysis } from "../../app/api/analysis/[id]/route"
import { GET as getReport } from "../../app/api/analysis/[id]/report/route"

function makeStmt(returnValue: unknown) {
  return {
    all: jest.fn().mockReturnValue(returnValue),
    get: jest.fn().mockReturnValue(returnValue),
    run: jest.fn().mockReturnValue({ lastInsertRowid: 1 }),
  }
}

const completeJob = {
  id: 1,
  repo_url: "https://github.com/gasoto-ai/codelens",
  owner: "gasoto-ai",
  repo: "codelens",
  status: "complete",
  error: null,
  score: 85,
  findings: JSON.stringify([
    { id: "ts-good", category: "typescript", severity: "info", title: "Strong TypeScript", detail: "90% TS", suggestion: "Add strict mode" }
  ]),
  metadata: JSON.stringify({
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
  }),
  created_at: "2026-03-13T00:00:00",
  updated_at: "2026-03-13T00:01:00",
}

const pendingJob = { ...completeJob, status: "pending", score: null, findings: null, metadata: null }

beforeEach(() => jest.clearAllMocks())

// ─── GET /api/analysis/[id] ───────────────────────────────────────────────────

describe("GET /api/analysis/[id]", () => {
  it("returns 404 when job not found", async () => {
    mockDb.prepare.mockReturnValue(makeStmt(undefined))
    const res = await getAnalysis({} as never, { params: Promise.resolve({ id: "99" }) })
    expect((res as { status: number }).status).toBe(404)
  })

  it("returns the job for a valid id", async () => {
    mockDb.prepare.mockReturnValue(makeStmt(completeJob))
    const res = await getAnalysis({} as never, { params: Promise.resolve({ id: "1" }) })
    expect((res as { status: number }).status).not.toBe(404)
  })

  it("parses findings JSON into an array", async () => {
    mockDb.prepare.mockReturnValue(makeStmt(completeJob))
    const res = await getAnalysis({} as never, { params: Promise.resolve({ id: "1" }) })
    const data = (res as { data: Record<string, unknown> }).data
    expect(Array.isArray(data.findings)).toBe(true)
  })

  it("parses metadata JSON into an object", async () => {
    mockDb.prepare.mockReturnValue(makeStmt(completeJob))
    const res = await getAnalysis({} as never, { params: Promise.resolve({ id: "1" }) })
    const data = (res as { data: Record<string, unknown> }).data
    expect(typeof data.metadata).toBe("object")
    expect(data.metadata).not.toBeNull()
  })

  it("returns null findings for pending jobs", async () => {
    mockDb.prepare.mockReturnValue(makeStmt(pendingJob))
    const res = await getAnalysis({} as never, { params: Promise.resolve({ id: "1" }) })
    const data = (res as { data: Record<string, unknown> }).data
    expect(data.findings).toBeNull()
  })

  it("includes status in the response", async () => {
    mockDb.prepare.mockReturnValue(makeStmt(completeJob))
    const res = await getAnalysis({} as never, { params: Promise.resolve({ id: "1" }) })
    const data = (res as { data: Record<string, unknown> }).data
    expect(data.status).toBe("complete")
  })
})

// ─── GET /api/analysis/[id]/report ────────────────────────────────────────────

describe("GET /api/analysis/[id]/report", () => {
  it("returns 404 when job not found", async () => {
    // Route queries with status = 'complete', returns undefined for missing/pending
    mockDb.prepare.mockReturnValue(makeStmt(undefined))
    const res = await getReport({} as never, { params: Promise.resolve({ id: "99" }) })
    expect((res as { status: number }).status).toBe(404)
  })

  it("returns a response (not 404) for a complete job", async () => {
    mockDb.prepare.mockReturnValue(makeStmt(completeJob))
    const res = await getReport({} as never, { params: Promise.resolve({ id: "1" }) })
    expect((res as { status: number }).status).not.toBe(404)
  })
})
