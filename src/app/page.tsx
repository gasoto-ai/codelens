"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export default function HomePage() {
  const [url, setUrl] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const analyze = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim()) return
    setLoading(true)
    setError(null)

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl: url }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "Analysis failed")
        return
      }

      router.push(`/analysis/${data.jobId}`)
    } catch {
      setError("Something went wrong. Try again.")
    } finally {
      setLoading(false)
    }
  }

  const examples = [
    "https://github.com/facebook/create-react-app",
    "https://github.com/vercel/next.js",
    "https://github.com/gasoto-ai/fish-tank-app",
  ]

  return (
    <main className="max-w-2xl mx-auto px-6 py-20">
      <div className="text-center mb-12">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-emerald-900/30 border border-emerald-700/30 mb-6">
          <span className="text-2xl">◎</span>
        </div>
        <h1 className="text-4xl font-bold tracking-tight mb-3">
          CodeLens
        </h1>
        <p className="text-neutral-400 text-lg">
          Drop in a GitHub repo. Get a modernization score and actionable fixes.
        </p>
      </div>

      <form onSubmit={analyze} className="space-y-4">
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="https://github.com/owner/repo"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="flex-1 bg-neutral-900 border border-neutral-700 text-neutral-100 placeholder-neutral-600 px-4 py-3 rounded-lg focus:outline-none focus:border-emerald-600 text-sm"
          />
          <button
            type="submit"
            disabled={loading || !url.trim()}
            className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-neutral-800 disabled:text-neutral-500 text-white font-medium rounded-lg transition-colors text-sm whitespace-nowrap"
          >
            {loading ? "Analyzing..." : "Analyze →"}
          </button>
        </div>

        {error && (
          <p className="text-red-400 text-sm">{error}</p>
        )}
      </form>

      <div className="mt-8">
        <p className="text-neutral-600 text-xs uppercase tracking-wider mb-3">Try an example</p>
        <div className="flex flex-wrap gap-2">
          {examples.map((ex) => (
            <button
              key={ex}
              onClick={() => setUrl(ex)}
              className="text-xs px-3 py-1.5 bg-neutral-900 border border-neutral-800 hover:border-neutral-600 text-neutral-500 hover:text-neutral-300 rounded-md transition-colors font-mono"
            >
              {ex.replace("https://github.com/", "")}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-16 grid grid-cols-3 gap-4 text-center">
        {[
          { icon: "🔍", label: "Static Analysis", desc: "TypeScript, tests, deps, patterns" },
          { icon: "📊", label: "Scored Report", desc: "0-100 with severity breakdown" },
          { icon: "📄", label: "Export", desc: "Download Markdown or copy summary" },
        ].map(({ icon, label, desc }) => (
          <div key={label} className="p-4 bg-neutral-900/50 rounded-lg border border-neutral-800">
            <div className="text-2xl mb-2">{icon}</div>
            <p className="text-neutral-200 text-sm font-medium">{label}</p>
            <p className="text-neutral-600 text-xs mt-1">{desc}</p>
          </div>
        ))}
      </div>
    </main>
  )
}
