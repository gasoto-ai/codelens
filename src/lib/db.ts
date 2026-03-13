import Database from "better-sqlite3"
import path from "path"
import fs from "fs"

// ─── Exported types ────────────────────────────────────────────────────────────

export type JobStatus = "pending" | "analyzing" | "complete" | "error"

export type AnalysisJob = {
  id: number
  repo_url: string
  owner: string
  repo: string
  status: JobStatus
  error: string | null
  score: number | null
  findings: string | null  // JSON-serialised Finding[]
  metadata: string | null  // JSON-serialised AnalysisResult["metadata"]
  created_at: string
  updated_at: string
}

/** AnalysisJob with findings and metadata already parsed */
export type ParsedAnalysisJob = Omit<AnalysisJob, "findings" | "metadata"> & {
  findings: import("./analyzer").Finding[] | null
  metadata: import("./analyzer").AnalysisResult["metadata"] | null
}

// ─── DB singleton ──────────────────────────────────────────────────────────────

const DB_PATH = path.join(process.cwd(), "data", "codelens.db")

const dataDir = path.dirname(DB_PATH)
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
}

let _db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH)
    _db.pragma("journal_mode = WAL")
    _db.pragma("foreign_keys = ON")
    initSchema(_db)
  }
  return _db
}

// ─── Schema ────────────────────────────────────────────────────────────────────

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS analysis_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      repo_url TEXT NOT NULL,
      owner TEXT NOT NULL,
      repo TEXT NOT NULL,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'analyzing', 'complete', 'error')),
      error TEXT,
      score INTEGER,
      findings TEXT, -- JSON
      metadata TEXT, -- JSON: file count, language breakdown, etc.
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `)
}
