import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "CodeLens — Codebase Modernization Analyzer",
  description: "Analyze any public GitHub repo and get a modernization score with actionable recommendations",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-neutral-950 text-neutral-100 antialiased">
        <div className="min-h-screen">
          <header className="border-b border-neutral-800 px-6 py-4">
            <div className="max-w-4xl mx-auto flex items-center justify-between">
              <a href="/" className="flex items-center gap-2">
                <span className="text-emerald-400 text-lg">◎</span>
                <span className="font-semibold tracking-tight">CodeLens</span>
              </a>
              <span className="text-neutral-600 text-sm">Codebase Modernization Analyzer</span>
            </div>
          </header>
          {children}
        </div>
      </body>
    </html>
  )
}
