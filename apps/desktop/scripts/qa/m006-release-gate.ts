import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

type CheckpointResult = 'pass' | 'fail' | 'skip'

type Recommendation = 'go' | 'no-go' | 'unknown'

interface ReleaseGateOptions {
  help: boolean
  assertCheckpoints: boolean
  dryRun: boolean
  reportPath: string
  uatReportPath: string
  acceptanceReportPath: string
  soakMetricsPath: string
}

interface ParsedCheckpoint {
  name: string
  result: CheckpointResult
  evidenceRef: string
  timestamp: string
  failureReason: string | null
}

interface CriterionSummary {
  id: string
  description: string
  status: 'pass' | 'fail'
  evidence: string[]
  notes: string[]
}

const REQUIRED_CHECKPOINTS = [
  'install',
  'onboard',
  'plan',
  'execute',
  'operate-symphony',
  'operate-mcp',
  'trigger-failure',
  'recover',
  'shutdown',
] as const

const DEFAULT_REPORT_PATH = 'docs/uat/M006/S04-RELEASE-GATE-SUMMARY.json'
const DEFAULT_UAT_REPORT_PATH = 'docs/uat/M006/S04-BETA-UAT-REPORT.md'
const DEFAULT_ACCEPTANCE_REPORT_PATH = 'docs/uat/M006/M006-ACCEPTANCE-REPORT.md'
const DEFAULT_SOAK_METRICS_PATH = 'docs/uat/M006/S03-SOAK-METRICS.json'

function printHelp(): void {
  console.log(`m006-release-gate

Usage:
  bun run scripts/qa/m006-release-gate.ts [options]

Options:
  --help                        Show this help text
  --assert-checkpoints          Exit non-zero when any required checkpoint fails/missing
  --dry-run                     Evaluate and print status without writing report JSON
  --report=<path>               Output JSON path (default: ${DEFAULT_REPORT_PATH})
  --uat-report=<path>           S04 UAT markdown source (default: ${DEFAULT_UAT_REPORT_PATH})
  --acceptance-report=<path>    Milestone acceptance report markdown source (default: ${DEFAULT_ACCEPTANCE_REPORT_PATH})
  --soak-metrics=<path>         S03 soak metrics JSON source (default: ${DEFAULT_SOAK_METRICS_PATH})

Input contract:
  The UAT report must include a markdown table with headers:
  | Checkpoint | Result | Evidence | Timestamp | Failure reason |
`)
}

function parseArgs(argv: string[]): ReleaseGateOptions {
  const options: ReleaseGateOptions = {
    help: false,
    assertCheckpoints: false,
    dryRun: false,
    reportPath: DEFAULT_REPORT_PATH,
    uatReportPath: DEFAULT_UAT_REPORT_PATH,
    acceptanceReportPath: DEFAULT_ACCEPTANCE_REPORT_PATH,
    soakMetricsPath: DEFAULT_SOAK_METRICS_PATH,
  }

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      options.help = true
      continue
    }

    if (arg === '--assert-checkpoints') {
      options.assertCheckpoints = true
      continue
    }

    if (arg === '--dry-run') {
      options.dryRun = true
      continue
    }

    if (arg.startsWith('--report=')) {
      options.reportPath = arg.slice('--report='.length)
      continue
    }

    if (arg.startsWith('--uat-report=')) {
      options.uatReportPath = arg.slice('--uat-report='.length)
      continue
    }

    if (arg.startsWith('--acceptance-report=')) {
      options.acceptanceReportPath = arg.slice('--acceptance-report='.length)
      continue
    }

    if (arg.startsWith('--soak-metrics=')) {
      options.soakMetricsPath = arg.slice('--soak-metrics='.length)
      continue
    }

    throw new Error(`Unknown argument: ${arg}. Run with --help for usage.`)
  }

  return options
}

function normalizeCheckpointResult(raw: string): CheckpointResult {
  const normalized = raw.trim().toLowerCase()
  if (normalized === 'pass' || normalized === '✅ pass' || normalized === '✅') {
    return 'pass'
  }

  if (normalized === 'skip' || normalized === '⏭ skip' || normalized === '⏭') {
    return 'skip'
  }

  return 'fail'
}

function splitTableRow(row: string): string[] {
  return row
    .split('|')
    .map((cell) => cell.trim())
    .filter((_, index, arr) => !(index === 0 && arr.length > 0 && row.trim().startsWith('|')))
    .filter((_, index, arr) => !(index === arr.length - 1 && row.trim().endsWith('|')))
}

function parseCheckpointTable(markdown: string): ParsedCheckpoint[] {
  const lines = markdown.split(/\r?\n/)
  const headerIndex = lines.findIndex((line) => {
    const normalized = line.toLowerCase()
    return (
      normalized.includes('| checkpoint') &&
      normalized.includes('| result') &&
      normalized.includes('| evidence') &&
      normalized.includes('| timestamp')
    )
  })

  if (headerIndex < 0) {
    return []
  }

  const parsed: ParsedCheckpoint[] = []

  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]?.trim() ?? ''

    if (!line.startsWith('|')) {
      if (parsed.length > 0) {
        break
      }
      continue
    }

    if (/^\|\s*[-:]+\s*\|/.test(line)) {
      continue
    }

    const cells = splitTableRow(line)
    if (cells.length < 4) {
      continue
    }

    parsed.push({
      name: cells[0] ?? '',
      result: normalizeCheckpointResult(cells[1] ?? ''),
      evidenceRef: cells[2] ?? '',
      timestamp: cells[3] ?? '',
      failureReason: cells[4] && cells[4] !== '-' ? cells[4] : null,
    })
  }

  return parsed
}

function parseRecommendation(markdown: string): Recommendation {
  const match = markdown.match(/beta recommendation\s*:\s*(go|no-go)/i)
  if (!match?.[1]) {
    return 'unknown'
  }

  return match[1].toLowerCase() === 'go' ? 'go' : 'no-go'
}

function parseBlockers(markdown: string): { p0: string[]; p1: string[] } {
  const parseSeverity = (severity: 'P0' | 'P1'): string[] => {
    const regex = new RegExp(`^-\\s*${severity}:\\s*(.+)$`, 'gim')
    const results: string[] = []

    for (const match of markdown.matchAll(regex)) {
      const value = (match[1] ?? '').trim()
      if (!value || /^none$/i.test(value) || /^no(?:ne)?\b/i.test(value)) {
        continue
      }
      results.push(value)
    }

    return results
  }

  return {
    p0: parseSeverity('P0'),
    p1: parseSeverity('P1'),
  }
}

async function readTextFile(filePath: string): Promise<string> {
  return readFile(filePath, 'utf8')
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  const raw = await readTextFile(filePath)
  return JSON.parse(raw) as T
}

function buildCheckpointLookup(parsed: ParsedCheckpoint[], nowIso: string): ParsedCheckpoint[] {
  const lookup = new Map(parsed.map((checkpoint) => [checkpoint.name.trim().toLowerCase(), checkpoint]))

  return REQUIRED_CHECKPOINTS.map((name) => {
    const existing = lookup.get(name)
    if (existing) {
      return {
        ...existing,
        name,
      }
    }

    return {
      name,
      result: 'fail' as const,
      evidenceRef: 'missing',
      timestamp: nowIso,
      failureReason: 'Missing checkpoint row in S04-BETA-UAT-REPORT.md',
    }
  })
}

function allRequiredCheckpointsPass(checkpoints: ParsedCheckpoint[]): boolean {
  return checkpoints.every((checkpoint) => checkpoint.result === 'pass')
}

interface SoakReport {
  final?: {
    status?: string
    breachCount?: number
  }
}

function evaluateCriteria(input: {
  checkpoints: ParsedCheckpoint[]
  recommendation: Recommendation
  blockers: { p0: string[]; p1: string[] }
  s03SoakReport: SoakReport
  acceptanceReportPath: string
  soakMetricsPath: string
  s02EvidencePath: string
  s03EvidencePath: string
  s01EvidencePath: string
}): CriterionSummary[] {
  const checkpointByName = new Map(input.checkpoints.map((checkpoint) => [checkpoint.name, checkpoint]))

  const isPass = (name: (typeof REQUIRED_CHECKPOINTS)[number]): boolean =>
    checkpointByName.get(name)?.result === 'pass'

  const criteria: CriterionSummary[] = []

  criteria.push({
    id: 'm006-sc-01',
    description:
      'Packaged install + onboarding to usable chat session is proven without hidden recovery steps.',
    status: isPass('install') && isPass('onboard') ? 'pass' : 'fail',
    evidence: [input.s02EvidencePath, 'docs/uat/M006/S04-BETA-UAT-REPORT.md#checkpoint-results'],
    notes: [],
  })

  criteria.push({
    id: 'm006-sc-02',
    description:
      'One integrated Desktop session proves plan → execute → Symphony operation → MCP operation with coherent UI state.',
    status:
      isPass('plan') && isPass('execute') && isPass('operate-symphony') && isPass('operate-mcp')
        ? 'pass'
        : 'fail',
    evidence: ['docs/uat/M006/S04-BETA-UAT-REPORT.md#checkpoint-results'],
    notes: [],
  })

  criteria.push({
    id: 'm006-sc-03',
    description:
      'Representative failures visibly degrade and recover while preserving last-known-good context.',
    status: isPass('trigger-failure') && isPass('recover') ? 'pass' : 'fail',
    evidence: [input.s01EvidencePath, 'docs/uat/M006/S04-BETA-UAT-REPORT.md#checkpoint-results'],
    notes: [],
  })

  const s03Healthy = String(input.s03SoakReport.final?.status ?? '').toLowerCase() === 'healthy'
  criteria.push({
    id: 'm006-sc-04',
    description:
      'Long-run stability and accessibility baseline remains release-ready with no unresolved threshold breach.',
    status: s03Healthy ? 'pass' : 'fail',
    evidence: [input.s03EvidencePath, input.soakMetricsPath],
    notes: s03Healthy ? [] : ['S03 soak report final.status is not healthy.'],
  })

  const hasBlockingIssues = input.blockers.p0.length > 0 || input.blockers.p1.length > 0
  const evidenceComplete =
    isPass('shutdown') &&
    input.recommendation !== 'unknown' &&
    (input.recommendation === 'no-go' || !hasBlockingIssues)

  criteria.push({
    id: 'm006-sc-05',
    description:
      'Release evidence is complete in-repo and recommendation truthfully reflects remaining blocker state.',
    status: evidenceComplete ? 'pass' : 'fail',
    evidence: [input.acceptanceReportPath, 'docs/uat/M006/S04-RELEASE-GATE-SUMMARY.json'],
    notes: [
      input.recommendation === 'unknown' ? 'Beta recommendation line is missing in acceptance report.' : '',
      hasBlockingIssues && input.recommendation === 'go'
        ? 'Recommendation is GO while P0/P1 blockers are still present.'
        : '',
    ].filter(Boolean),
  })

  return criteria
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))

  if (options.help) {
    printHelp()
    return
  }

  const nowIso = new Date().toISOString()
  const cwd = process.cwd()

  const uatReportPath = path.resolve(cwd, options.uatReportPath)
  const acceptanceReportPath = path.resolve(cwd, options.acceptanceReportPath)
  const soakMetricsPath = path.resolve(cwd, options.soakMetricsPath)
  const reportPath = path.resolve(cwd, options.reportPath)

  const s01EvidencePath = 'docs/uat/M006/S01-UAT-REPORT.md'
  const s02EvidencePath = 'docs/uat/M006/S02-UAT-REPORT.md'
  const s03EvidencePath = 'docs/uat/M006/S03-UAT-REPORT.md'

  const [uatMarkdown, acceptanceMarkdown, soakReport] = await Promise.all([
    readTextFile(uatReportPath),
    readTextFile(acceptanceReportPath),
    readJsonFile<SoakReport>(soakMetricsPath),
  ])

  const parsedCheckpoints = parseCheckpointTable(uatMarkdown)
  const checkpoints = buildCheckpointLookup(parsedCheckpoints, nowIso)

  const blockers = parseBlockers(acceptanceMarkdown)
  const recommendation = parseRecommendation(acceptanceMarkdown)

  const criteria = evaluateCriteria({
    checkpoints,
    recommendation,
    blockers,
    s03SoakReport: soakReport,
    acceptanceReportPath: options.acceptanceReportPath,
    soakMetricsPath: options.soakMetricsPath,
    s01EvidencePath,
    s02EvidencePath,
    s03EvidencePath,
  })

  const checkpointPassCount = checkpoints.filter((checkpoint) => checkpoint.result === 'pass').length
  const criteriaPassCount = criteria.filter((criterion) => criterion.status === 'pass').length

  const summary = {
    version: 'm006-s04-release-gate-v1',
    generatedAt: nowIso,
    inputs: {
      uatReportPath: options.uatReportPath,
      acceptanceReportPath: options.acceptanceReportPath,
      soakMetricsPath: options.soakMetricsPath,
      consumedEvidence: {
        s01: s01EvidencePath,
        s02: s02EvidencePath,
        s03: s03EvidencePath,
      },
    },
    checkpoints,
    checkpointSummary: {
      required: REQUIRED_CHECKPOINTS.length,
      passed: checkpointPassCount,
      failed: checkpoints.filter((checkpoint) => checkpoint.result === 'fail').length,
      skipped: checkpoints.filter((checkpoint) => checkpoint.result === 'skip').length,
      allRequiredPass: allRequiredCheckpointsPass(checkpoints),
    },
    criteria,
    criteriaSummary: {
      required: criteria.length,
      passed: criteriaPassCount,
      failed: criteria.length - criteriaPassCount,
      allPass: criteria.every((criterion) => criterion.status === 'pass'),
    },
    blockers,
    recommendation: {
      decision: recommendation,
      explicit: recommendation !== 'unknown',
    },
  }

  if (!options.dryRun) {
    await mkdir(path.dirname(reportPath), { recursive: true })
    await writeFile(reportPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
  }

  if (options.assertCheckpoints) {
    const failedCheckpointNames = checkpoints
      .filter((checkpoint) => checkpoint.result !== 'pass')
      .map((checkpoint) => checkpoint.name)

    if (failedCheckpointNames.length > 0) {
      throw new Error(`Release gate checkpoint assertion failed: ${failedCheckpointNames.join(', ')}`)
    }

    const failedCriteria = criteria.filter((criterion) => criterion.status !== 'pass')
    if (failedCriteria.length > 0) {
      throw new Error(
        `Release gate criterion assertion failed: ${failedCriteria.map((criterion) => criterion.id).join(', ')}`,
      )
    }
  }

  console.log(
    `[m006-release-gate] ${options.dryRun ? 'evaluated' : 'wrote'} ${reportPath} (checkpoints ${checkpointPassCount}/${REQUIRED_CHECKPOINTS.length}, criteria ${criteriaPassCount}/${criteria.length}, recommendation: ${recommendation})`,
  )
}

main().catch((error) => {
  console.error(`[m006-release-gate] ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
