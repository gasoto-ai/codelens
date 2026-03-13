import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"
import { generateMarkdownReport } from "@/lib/report"
import type { AnalysisResult } from "@/lib/analyzer"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const db = getDb()

  const job = db.prepare("SELECT * FROM analysis_jobs WHERE id = ? AND status = 'complete'").get(id) as {
    owner: string
    repo: string
    score: number
    findings: string
    metadata: string
  } | undefined

  if (!job) {
    return NextResponse.json({ error: "Analysis not found or not complete" }, { status: 404 })
  }

  const result: AnalysisResult = {
    score: job.score,
    findings: JSON.parse(job.findings),
    metadata: JSON.parse(job.metadata),
  }

  const markdown = generateMarkdownReport(job.owner, job.repo, result)

  return new NextResponse(markdown, {
    headers: {
      "Content-Type": "text/markdown",
      "Content-Disposition": `attachment; filename="codelens-${job.owner}-${job.repo}.md"`,
    },
  })
}
