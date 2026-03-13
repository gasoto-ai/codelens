import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"
import { analyzeRepo } from "@/lib/analyzer"

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { repoUrl } = body

  if (!repoUrl) {
    return NextResponse.json({ error: "repoUrl is required" }, { status: 400 })
  }

  // Parse GitHub URL
  const match = repoUrl.match(
    /^(?:https?:\/\/)?(?:www\.)?github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/
  )

  if (!match) {
    return NextResponse.json(
      { error: "Invalid GitHub URL. Expected format: https://github.com/owner/repo" },
      { status: 400 }
    )
  }

  const [, owner, repo] = match

  const db = getDb()

  // Check for recent analysis of same repo (cache for 10 min)
  const existing = db.prepare(`
    SELECT * FROM analysis_jobs
    WHERE owner = ? AND repo = ? AND status = 'complete'
    AND datetime(updated_at) > datetime('now', '-10 minutes')
    ORDER BY updated_at DESC
    LIMIT 1
  `).get(owner, repo) as { id: number } | undefined

  if (existing) {
    return NextResponse.json({ jobId: existing.id, cached: true })
  }

  // Create job
  const result = db.prepare(`
    INSERT INTO analysis_jobs (repo_url, owner, repo, status)
    VALUES (?, ?, ?, 'analyzing')
  `).run(repoUrl, owner, repo)

  const jobId = result.lastInsertRowid as number

  // Run analysis (async, but we'll do it inline for MVP — repos are fast enough)
  try {
    const analysis = await analyzeRepo(owner, repo)

    db.prepare(`
      UPDATE analysis_jobs
      SET status = 'complete',
          score = ?,
          findings = ?,
          metadata = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(
      analysis.score,
      JSON.stringify(analysis.findings),
      JSON.stringify(analysis.metadata),
      jobId
    )

    return NextResponse.json({ jobId, cached: false })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"

    db.prepare(`
      UPDATE analysis_jobs
      SET status = 'error', error = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(message, jobId)

    return NextResponse.json({ error: message }, { status: 500 })
  }
}
