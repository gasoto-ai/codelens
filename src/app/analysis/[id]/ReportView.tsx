"use client"

import { useState, useEffect } from "react"
import type { AnalysisResult, Finding } from "@/lib/analyzer"
import { generatePlainSummary } from "@/lib/report"

type Props = {
  jobId: number
  owner: string
  repo: string
  repoUrl: string
  status: "pending" | "analyzing" | "complete" | "error"
  result: AnalysisResult | null
}

const categoryLabels: Record<Finding["category"], string> = {
  typescript: "TypeScript",
  testing: "Testing",
  dependencies: "Dependencies",
  structure: "Structure & Config",
  docs: "Documentation",
}

const severityConfig = {
  critical: { color: "text-red-400", bg: "bg-red-900/20 border-red-800/40", dot: "bg-red-500", label: "Critical" },
  warn: { color: "text-yellow-400", bg: "bg-yellow-900/20 border-yellow-800/40", dot: "bg-yellow-500", label: "Warning" },
  info: { color: "text-blue-400", bg: "bg-blue-900/10 border-blue-800/20", dot: "bg-blue-500", label: "Info" },
}

function ScoreRing({ score }: { score: number }) {
  const color = score >= 80 ? "#10b981" : score >= 60 ? "#f59e0b" : score >= 40 ? "#f97316" : "#ef4444"
  const label = score >= 80 ? "Modern" : score >= 60 ? "Decent" : score >= 40 ? "Needs Work" : "Outdated"

  return (
    <div className="flex flex-col items-center">
      <div
        className="w-32 h-32 rounded-full flex items-center justify-center border-4"
        style={{ borderColor: color }}
      >
        <div className="text-center">
          <div className="text-4xl font-bold" style={{ color }}>{score}</div>
          <div className="text-xs text-neutral-500">/100</div>
        </div>
      </div>
      <div className="mt-2 text-sm font-medium" style={{ color }}>{label}</div>
    </div>
  )
}

function FindingCard({ finding }: { finding: Finding }) {
  const [expanded, setExpanded] = useState(false)
  const config = severityConfig[finding.severity]

  return (
    <div className={`border rounded-lg p-4 ${config.bg}`}>
      <button
        className="w-full text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${config.dot}`} />
            <span className="text-neutral-100 text-sm font-medium">{finding.title}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs ${config.color}`}>{config.label}</span>
            <span className="text-neutral-600 text-xs">{expanded ? "▲" : "▼"}</span>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="mt-3 space-y-2 border-t border-neutral-700/30 pt-3">
          <p className="text-neutral-400 text-sm">{finding.detail}</p>
          <div className="bg-neutral-900/50 rounded-md p-3">
            <p className="text-xs text-neutral-500 uppercase tracking-wider mb-1">Suggested fix</p>
            <p className="text-neutral-300 text-sm">{finding.suggestion}</p>
          </div>
          {finding.files && finding.files.length > 0 && (
            <div>
              <p className="text-xs text-neutral-500 uppercase tracking-wider mb-1">Affected files</p>
              <div className="space-y-0.5">
                {finding.files.map((f) => (
                  <code key={f} className="block text-xs text-neutral-400 font-mono">
                    {f}
                  </code>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function ReportView({ jobId, owner, repo, repoUrl, status: initialStatus, result: initialResult }: Props) {
  const [status, setStatus] = useState(initialStatus)
  const [result, setResult] = useState<AnalysisResult | null>(initialResult)
  const [copied, setCopied] = useState(false)
  const [activeCategory, setActiveCategory] = useState<Finding["category"] | "all">("all")

  // Poll if still analyzing
  useEffect(() => {
    if (status !== "analyzing" && status !== "pending") return

    const interval = setInterval(async () => {
      const res = await fetch(`/api/analysis/${jobId}`)
      const data = await res.json()
      setStatus(data.status)
      if (data.status === "complete") {
        setResult({ score: data.score, findings: data.findings, metadata: data.metadata })
        clearInterval(interval)
      } else if (data.status === "error") {
        clearInterval(interval)
      }
    }, 2000)

    return () => clearInterval(interval)
  }, [jobId, status])

  const copyPlainSummary = async () => {
    if (!result) return
    const summary = generatePlainSummary(owner, repo, result)
    await navigator.clipboard.writeText(summary)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (status === "analyzing" || status === "pending") {
    return (
      <main className="max-w-2xl mx-auto px-6 py-20 text-center">
        <div className="animate-pulse mb-4">
          <span className="text-4xl">◎</span>
        </div>
        <h2 className="text-xl font-semibold mb-2">Analyzing {owner}/{repo}</h2>
        <p className="text-neutral-500 text-sm">Fetching file tree and running checks...</p>
      </main>
    )
  }

  if (!result) {
    return (
      <main className="max-w-2xl mx-auto px-6 py-20 text-center">
        <p className="text-red-400">Analysis unavailable.</p>
        <a href="/" className="text-emerald-400 text-sm mt-4 inline-block">← Back</a>
      </main>
    )
  }

  const { score, findings, metadata } = result
  const criticals = findings.filter((f) => f.severity === "critical")
  const warns = findings.filter((f) => f.severity === "warn")
  const infos = findings.filter((f) => f.severity === "info")

  const categories = [...new Set(findings.map((f) => f.category))]
  const filteredFindings = activeCategory === "all"
    ? findings
    : findings.filter((f) => f.category === activeCategory)

  const byCategory = Object.groupBy(filteredFindings, (f) => f.category) as Record<
    Finding["category"],
    Finding[]
  >

  return (
    <main className="max-w-4xl mx-auto px-6 py-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
        <div>
          <a href="/" className="text-neutral-600 hover:text-neutral-400 text-sm transition-colors block mb-1">
            ← New analysis
          </a>
          <h1 className="text-2xl font-bold">
            <a
              href={repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-emerald-400 transition-colors"
            >
              {owner}/{repo}
            </a>
          </h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={copyPlainSummary}
            className={`text-sm px-4 py-2 rounded-lg border transition-colors ${
              copied
                ? "border-emerald-700 text-emerald-400 bg-emerald-900/20"
                : "border-neutral-700 text-neutral-400 hover:border-neutral-500 hover:text-neutral-200"
            }`}
          >
            {copied ? "Copied!" : "Copy summary"}
          </button>
          <a
            href={`/api/analysis/${jobId}/report`}
            download
            className="text-sm px-4 py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg transition-colors"
          >
            Download .md
          </a>
        </div>
      </div>

      {/* Score + stats */}
      <div className="grid md:grid-cols-[auto_1fr] gap-8 mb-10">
        <ScoreRing score={score} />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 content-start">
          {[
            { label: "Files scanned", value: metadata.totalFiles },
            { label: "Languages", value: metadata.languages.join(", ") || "—" },
            { label: "Critical issues", value: criticals.length, color: criticals.length > 0 ? "text-red-400" : undefined },
            { label: "Warnings", value: warns.length, color: warns.length > 0 ? "text-yellow-400" : undefined },
            { label: "TypeScript files", value: metadata.tsFiles },
            { label: "JS files", value: metadata.jsFiles },
            { label: "Test files", value: metadata.testFiles },
            { label: "Info", value: infos.length },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-neutral-900 rounded-lg p-3">
              <p className="text-neutral-600 text-xs mb-1">{label}</p>
              <p className={`text-lg font-semibold ${color || "text-neutral-100"}`}>{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Category filter */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => setActiveCategory("all")}
          className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
            activeCategory === "all"
              ? "border-emerald-700 text-emerald-400 bg-emerald-900/20"
              : "border-neutral-800 text-neutral-500 hover:border-neutral-600"
          }`}
        >
          All ({findings.length})
        </button>
        {categories.map((cat) => {
          const count = findings.filter((f) => f.category === cat).length
          return (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
                activeCategory === cat
                  ? "border-emerald-700 text-emerald-400 bg-emerald-900/20"
                  : "border-neutral-800 text-neutral-500 hover:border-neutral-600"
              }`}
            >
              {categoryLabels[cat]} ({count})
            </button>
          )
        })}
      </div>

      {/* Findings */}
      <div className="space-y-6">
        {(Object.entries(byCategory) as [Finding["category"], Finding[]][]).map(([cat, catFindings]) => (
          <div key={cat}>
            <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider mb-3">
              {categoryLabels[cat]}
            </h2>
            <div className="space-y-2">
              {catFindings
                .sort((a, b) => {
                  const order = { critical: 0, warn: 1, info: 2 }
                  return order[a.severity] - order[b.severity]
                })
                .map((f) => (
                  <FindingCard key={f.id} finding={f} />
                ))}
            </div>
          </div>
        ))}
      </div>
    </main>
  )
}
