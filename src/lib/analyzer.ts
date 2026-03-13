import { Octokit } from "@octokit/rest"

export type Severity = "critical" | "warn" | "info"

export type Finding = {
  id: string
  category: "typescript" | "testing" | "dependencies" | "structure" | "docs"
  severity: Severity
  title: string
  detail: string
  suggestion: string
  files?: string[]
}

export type AnalysisResult = {
  score: number
  findings: Finding[]
  metadata: {
    totalFiles: number
    tsFiles: number
    jsFiles: number
    testFiles: number
    languages: string[]
    hasPackageJson: boolean
    hasReadme: boolean
    hasEslint: boolean
    hasPrettier: boolean
    hasTsConfig: boolean
    deps: Record<string, string>
  }
}

type GitHubTreeItem = {
  path: string
  type: string
  size?: number
  sha: string
}

type GitHubFileContent = {
  content?: string
  encoding?: string
}

export async function analyzeRepo(owner: string, repo: string): Promise<AnalysisResult> {
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN })
  // Get the full file tree
  const { data: repoData } = await octokit.repos.get({ owner, repo })
  const defaultBranch = repoData.default_branch

  const { data: treeData } = await octokit.git.getTree({
    owner,
    repo,
    tree_sha: defaultBranch,
    recursive: "1",
  })

  const tree = (treeData.tree as GitHubTreeItem[]).filter(
    (item) => item.type === "blob" && item.path
  )

  // Limit to 500 files
  const files = tree.slice(0, 500)
  const filePaths = files.map((f) => f.path)

  // Categorize files
  const tsFiles = filePaths.filter((p) => /\.(ts|tsx)$/.test(p) && !p.includes(".d.ts"))
  const jsFiles = filePaths.filter((p) => /\.(js|jsx)$/.test(p))
  const testFiles = filePaths.filter((p) =>
    /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(p) || /\/__tests__\//.test(p)
  )

  const hasPackageJson = filePaths.some((p) => p === "package.json")
  const hasReadme = filePaths.some((p) => /^readme\.md$/i.test(p))
  const hasEslint = filePaths.some((p) => /eslint/.test(p.toLowerCase()))
  const hasPrettier = filePaths.some((p) => /prettier/.test(p.toLowerCase()))
  const hasTsConfig = filePaths.some((p) => /tsconfig.*\.json/.test(p))

  // Determine languages
  const languages: string[] = []
  if (tsFiles.length > 0) languages.push("TypeScript")
  if (jsFiles.length > 0) languages.push("JavaScript")
  if (filePaths.some((p) => /\.py$/.test(p))) languages.push("Python")
  if (filePaths.some((p) => /\.go$/.test(p))) languages.push("Go")
  if (filePaths.some((p) => /\.rs$/.test(p))) languages.push("Rust")
  if (filePaths.some((p) => /\.java$/.test(p))) languages.push("Java")

  // Fetch key files
  let packageJson: Record<string, unknown> | null = null
  let readmeContent = ""
  let largeFiles: string[] = []

  if (hasPackageJson) {
    try {
      const { data } = await octokit.repos.getContent({ owner, repo, path: "package.json" }) as { data: GitHubFileContent }
      if (data.content) {
        const decoded = Buffer.from(data.content, "base64").toString("utf-8")
        packageJson = JSON.parse(decoded)
      }
    } catch {
      // ignore
    }
  }

  if (hasReadme) {
    try {
      const readmePath = filePaths.find((p) => /^readme\.md$/i.test(p))!
      const { data } = await octokit.repos.getContent({ owner, repo, path: readmePath }) as { data: GitHubFileContent }
      if (data.content) {
        readmeContent = Buffer.from(data.content, "base64").toString("utf-8")
      }
    } catch {
      // ignore
    }
  }

  // Check for large files (>500 lines) — sample a few TS/JS files
  const sampleFiles = [...tsFiles, ...jsFiles].slice(0, 30)
  for (const filePath of sampleFiles) {
    try {
      const fileItem = files.find((f) => f.path === filePath)
      if (fileItem?.size && fileItem.size > 15000) {
        // ~500 lines at ~30 chars/line
        largeFiles.push(filePath)
      }
    } catch {
      // ignore
    }
  }

  // Check for class components in React files
  const reactFiles = filePaths.filter((p) => /\.(jsx|tsx)$/.test(p))
  const classComponentFiles: string[] = []
  const sampleReact = reactFiles.slice(0, 20)
  for (const filePath of sampleReact) {
    try {
      const { data } = await octokit.repos.getContent({ owner, repo, path: filePath }) as { data: GitHubFileContent }
      if (data.content) {
        const content = Buffer.from(data.content, "base64").toString("utf-8")
        if (/class\s+\w+\s+extends\s+(React\.Component|Component)/.test(content)) {
          classComponentFiles.push(filePath)
        }
      }
    } catch {
      // ignore
    }
  }

  // Parse deps
  const deps: Record<string, string> = {
    ...(packageJson?.dependencies as Record<string, string> || {}),
    ...(packageJson?.devDependencies as Record<string, string> || {}),
  }

  // Build findings
  const findings: Finding[] = []
  const totalCodeFiles = tsFiles.length + jsFiles.length

  // --- TypeScript ---
  if (totalCodeFiles > 0) {
    const tsRatio = tsFiles.length / totalCodeFiles
    if (tsRatio === 0) {
      findings.push({
        id: "ts-none",
        category: "typescript",
        severity: "critical",
        title: "No TypeScript",
        detail: `All ${jsFiles.length} code files are JavaScript. TypeScript adoption is zero.`,
        suggestion: "Add a tsconfig.json and migrate files incrementally. Start with new files and use .ts/.tsx extensions.",
      })
    } else if (tsRatio < 0.5) {
      findings.push({
        id: "ts-partial",
        category: "typescript",
        severity: "warn",
        title: "Partial TypeScript adoption",
        detail: `${tsFiles.length} of ${totalCodeFiles} code files (${Math.round(tsRatio * 100)}%) use TypeScript. ${jsFiles.length} JavaScript files remain.`,
        suggestion: "Migrate remaining .js/.jsx files to TypeScript. Use strict mode in tsconfig for maximum benefit.",
        files: jsFiles.slice(0, 10),
      })
    } else if (!hasTsConfig) {
      findings.push({
        id: "ts-no-config",
        category: "typescript",
        severity: "warn",
        title: "No tsconfig.json found",
        detail: "TypeScript files exist but no tsconfig.json was found.",
        suggestion: "Add a tsconfig.json with strict: true for full type safety.",
      })
    } else {
      findings.push({
        id: "ts-good",
        category: "typescript",
        severity: "info",
        title: "Strong TypeScript adoption",
        detail: `${tsFiles.length} of ${totalCodeFiles} code files (${Math.round(tsRatio * 100)}%) use TypeScript.`,
        suggestion: "Ensure strict mode is enabled in tsconfig.json.",
      })
    }
  }

  // --- Testing ---
  if (testFiles.length === 0) {
    findings.push({
      id: "test-none",
      category: "testing",
      severity: "critical",
      title: "No tests found",
      detail: "No test files detected (*.test.*, *.spec.*, __tests__/).",
      suggestion: "Add a testing framework (Jest, Vitest, or Playwright). Start with unit tests for pure functions and utilities.",
    })
  } else {
    const testRatio = testFiles.length / Math.max(totalCodeFiles, 1)
    if (testRatio < 0.1) {
      findings.push({
        id: "test-low",
        category: "testing",
        severity: "warn",
        title: "Low test coverage signal",
        detail: `Only ${testFiles.length} test files for ${totalCodeFiles} code files. Coverage is likely thin.`,
        suggestion: "Aim for a test file alongside each module. Focus on business logic and utilities first.",
        files: testFiles,
      })
    } else {
      findings.push({
        id: "test-good",
        category: "testing",
        severity: "info",
        title: "Tests present",
        detail: `${testFiles.length} test files found.`,
        suggestion: "Ensure CI runs tests on every PR. Consider coverage thresholds.",
        files: testFiles.slice(0, 5),
      })
    }
  }

  // --- Config hygiene ---
  if (!hasEslint) {
    findings.push({
      id: "lint-none",
      category: "structure",
      severity: "warn",
      title: "No ESLint config",
      detail: "No ESLint configuration file found.",
      suggestion: "Add .eslintrc.json or eslint.config.js. Use eslint-config-next for Next.js projects.",
    })
  }

  if (!hasPrettier) {
    findings.push({
      id: "prettier-none",
      category: "structure",
      severity: "info",
      title: "No Prettier config",
      detail: "No Prettier configuration found.",
      suggestion: "Add a .prettierrc for consistent formatting. Integrate with ESLint via eslint-plugin-prettier.",
    })
  }

  // --- Large files ---
  if (largeFiles.length > 0) {
    findings.push({
      id: "god-files",
      category: "structure",
      severity: "warn",
      title: `${largeFiles.length} large file${largeFiles.length > 1 ? "s" : ""} detected`,
      detail: "Files over ~500 lines are often signs of poor separation of concerns.",
      suggestion: "Break large files into smaller modules. Extract hooks, utilities, and components into separate files.",
      files: largeFiles,
    })
  }

  // --- Class components ---
  if (classComponentFiles.length > 0) {
    findings.push({
      id: "class-components",
      category: "typescript",
      severity: "warn",
      title: "Legacy React class components",
      detail: `${classComponentFiles.length} file${classComponentFiles.length > 1 ? "s" : ""} use class-based React components.`,
      suggestion: "Migrate to functional components with hooks. Class components are effectively deprecated in modern React.",
      files: classComponentFiles,
    })
  }

  // --- Docs ---
  if (!hasReadme) {
    findings.push({
      id: "readme-none",
      category: "docs",
      severity: "warn",
      title: "No README",
      detail: "No README.md found in the repository root.",
      suggestion: "Add a README with: what the project does, tech stack, setup instructions, and how to run tests.",
    })
  } else {
    const hasSetup =
      /##?\s*(setup|install|getting started|usage|run)/i.test(readmeContent)
    if (!hasSetup) {
      findings.push({
        id: "readme-thin",
        category: "docs",
        severity: "info",
        title: "README missing setup section",
        detail: "README exists but doesn't appear to have setup/installation instructions.",
        suggestion: "Add a ## Setup or ## Getting Started section with install and run commands.",
      })
    } else {
      findings.push({
        id: "readme-good",
        category: "docs",
        severity: "info",
        title: "README looks good",
        detail: "README exists with setup instructions.",
        suggestion: "Consider adding architecture overview and contribution guidelines.",
      })
    }
  }

  // --- Dependencies ---
  if (Object.keys(deps).length === 0 && hasPackageJson) {
    findings.push({
      id: "deps-empty",
      category: "dependencies",
      severity: "info",
      title: "No dependencies",
      detail: "package.json has no dependencies listed.",
      suggestion: "Ensure dependencies are committed in package.json.",
    })
  } else if (Object.keys(deps).length > 0) {
    // Check for notoriously outdated patterns
    const legacyDeps: string[] = []
    const legacyPatterns = [
      "react-scripts", // CRA
      "moment", // replaced by date-fns/dayjs
      "request", // deprecated HTTP lib
      "node-fetch", // not needed in Node 18+
      "tslint", // replaced by eslint
      "enzyme", // replaced by testing-library
      "redux", // not legacy but check for redux without toolkit
    ]

    for (const dep of legacyPatterns) {
      if (deps[dep]) legacyDeps.push(dep)
    }

    if (legacyDeps.includes("react-scripts")) {
      findings.push({
        id: "deps-cra",
        category: "dependencies",
        severity: "critical",
        title: "Create React App detected",
        detail: "react-scripts indicates this project uses Create React App, which is no longer maintained.",
        suggestion: "Migrate to Next.js or Vite. CRA has been deprecated and receives no security updates.",
      })
    }

    if (legacyDeps.includes("moment")) {
      findings.push({
        id: "deps-moment",
        category: "dependencies",
        severity: "warn",
        title: "Moment.js in use",
        detail: "Moment.js is in maintenance mode and adds significant bundle size.",
        suggestion: "Replace with date-fns (tree-shakeable) or dayjs (2KB). Both are drop-in compatible.",
      })
    }

    if (legacyDeps.includes("tslint")) {
      findings.push({
        id: "deps-tslint",
        category: "dependencies",
        severity: "critical",
        title: "TSLint is deprecated",
        detail: "TSLint was deprecated in 2019 in favor of ESLint with TypeScript support.",
        suggestion: "Replace with @typescript-eslint/eslint-plugin and @typescript-eslint/parser.",
      })
    }

    if (legacyDeps.includes("enzyme")) {
      findings.push({
        id: "deps-enzyme",
        category: "testing",
        severity: "warn",
        title: "Enzyme testing library",
        detail: "Enzyme lacks React 18+ support and is no longer actively maintained.",
        suggestion: "Migrate to @testing-library/react, which tests behavior rather than implementation.",
      })
    }

    const remainingLegacy = legacyDeps.filter(
      (d) => !["react-scripts", "moment", "tslint", "enzyme"].includes(d)
    )
    if (remainingLegacy.length > 0) {
      findings.push({
        id: "deps-legacy",
        category: "dependencies",
        severity: "warn",
        title: `Potentially outdated dependencies`,
        detail: `Found: ${remainingLegacy.join(", ")}`,
        suggestion: "Review these dependencies for modern alternatives.",
      })
    }

    if (legacyDeps.length === 0) {
      findings.push({
        id: "deps-clean",
        category: "dependencies",
        severity: "info",
        title: "No major legacy dependencies detected",
        detail: `Scanned ${Object.keys(deps).length} dependencies.`,
        suggestion: "Run 'npm outdated' periodically to catch drift before it becomes a problem.",
      })
    }
  }

  // --- Compute score ---
  const score = computeScore(findings)

  return {
    score,
    findings,
    metadata: {
      totalFiles: files.length,
      tsFiles: tsFiles.length,
      jsFiles: jsFiles.length,
      testFiles: testFiles.length,
      languages,
      hasPackageJson,
      hasReadme,
      hasEslint,
      hasPrettier,
      hasTsConfig,
      deps,
    },
  }
}

function computeScore(findings: Finding[]): number {
  // Start at 100, deduct for issues
  const deductions: Record<Severity, number> = {
    critical: 20,
    warn: 8,
    info: 0,
  }

  let score = 100
  for (const f of findings) {
    if (f.severity !== "info") {
      score -= deductions[f.severity]
    }
  }

  return Math.max(0, Math.min(100, score))
}
