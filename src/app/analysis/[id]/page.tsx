import { notFound } from "next/navigation"
import { getDb } from "@/lib/db"
import ReportView from "./ReportView"
import type { AnalysisResult } from "@/lib/analyzer"

export const dynamic = "force-dynamic"

type Job = {
  id: number
  owner: string
  repo: string
  repo_url: string
  status: "pending" | "analyzing" | "complete" | "error"
  error: string | null
  score: number | null
  findings: string | null
  metadata: string | null
  created_at: string
}

export default async function AnalysisPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const db = getDb()
  const job = db.prepare("SELECT * FROM analysis_jobs WHERE id = ?").get(id) as Job | undefined

  if (!job) notFound()

  if (job.status === "error") {
    return (
      <main className="max-w-2xl mx-auto px-6 py-20 text-center">
        <p className="text-red-400 text-lg mb-2">Analysis failed</p>
        <p className="text-neutral-600 text-sm mb-8">{job.error}</p>
        <a href="/" className="text-emerald-400 hover:text-emerald-300 text-sm">← Try another repo</a>
      </main>
    )
  }

  const result: AnalysisResult | null = job.status === "complete" && job.findings && job.metadata
    ? {
        score: job.score!,
        findings: JSON.parse(job.findings),
        metadata: JSON.parse(job.metadata),
      }
    : null

  return (
    <ReportView
      jobId={job.id}
      owner={job.owner}
      repo={job.repo}
      repoUrl={job.repo_url}
      status={job.status}
      result={result}
    />
  )
}
