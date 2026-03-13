import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const db = getDb()

  const job = db.prepare("SELECT * FROM analysis_jobs WHERE id = ?").get(id) as {
    id: number
    repo_url: string
    owner: string
    repo: string
    status: string
    error: string | null
    score: number | null
    findings: string | null
    metadata: string | null
    created_at: string
  } | undefined

  if (!job) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  return NextResponse.json({
    ...job,
    findings: job.findings ? JSON.parse(job.findings) : null,
    metadata: job.metadata ? JSON.parse(job.metadata) : null,
  })
}
