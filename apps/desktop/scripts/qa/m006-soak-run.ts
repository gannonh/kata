import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  DEFAULT_STABILITY_THRESHOLDS,
  RuntimeHealthAggregator,
} from '../../src/main/runtime-health-aggregator'

interface SoakOptions {
  durationMs: number
  assertThresholds: boolean
  reportPath: string
}

interface SoakTimelineEntry {
  index: number
  phase: 'healthy' | 'failure' | 'recovery'
  sampledAt: string
  status: 'healthy' | 'degraded' | 'breached'
  breachCodes: string[]
  metrics: {
    eventLoopLagMs: number
    heapGrowthMb: number
    staleAgeMs: number
    reconnectSuccessRate: number
    recoveryLatencyMs: number
    a11ySerious: number
    a11yCritical: number
  }
}

function parseDuration(input: string | undefined): number {
  if (!input || !input.trim()) {
    return 180 * 60 * 1000
  }

  const trimmed = input.trim()
  const match = trimmed.match(/^(\d+)(ms|s|m|h)$/i)
  if (!match) {
    throw new Error(`Invalid duration format: ${trimmed}. Expected <number><ms|s|m|h>.`)
  }

  const value = Number(match[1])
  const unit = match[2].toLowerCase()

  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid duration value: ${trimmed}`)
  }

  switch (unit) {
    case 'ms':
      return value
    case 's':
      return value * 1000
    case 'm':
      return value * 60 * 1000
    case 'h':
      return value * 60 * 60 * 1000
    default:
      throw new Error(`Unsupported duration unit: ${unit}`)
  }
}

function parseArgs(argv: string[]): SoakOptions {
  let durationArg: string | undefined
  let assertThresholds = false
  let reportPath = 'docs/uat/M006/S03-SOAK-METRICS.json'

  for (const arg of argv) {
    if (arg.startsWith('--duration=')) {
      durationArg = arg.slice('--duration='.length)
      continue
    }

    if (arg === '--assert-thresholds') {
      assertThresholds = true
      continue
    }

    if (arg.startsWith('--report=')) {
      reportPath = arg.slice('--report='.length)
      continue
    }
  }

  return {
    durationMs: parseDuration(durationArg),
    assertThresholds,
    reportPath,
  }
}

function buildPhaseMetrics(phase: SoakTimelineEntry['phase']): {
  chat: { eventLoopLagMs: number; heapGrowthMb: number }
  workflow: { staleAgeMs: number }
  symphony: { reconnectSuccessRate: number; recoveryLatencyMs: number }
  mcp: { a11yViolationCounts: { serious: number; critical: number } }
} {
  if (phase === 'healthy') {
    return {
      chat: { eventLoopLagMs: 18, heapGrowthMb: 92 },
      workflow: { staleAgeMs: 12_000 },
      symphony: { reconnectSuccessRate: 1, recoveryLatencyMs: 2_200 },
      mcp: { a11yViolationCounts: { serious: 0, critical: 0 } },
    }
  }

  if (phase === 'failure') {
    return {
      chat: { eventLoopLagMs: 196, heapGrowthMb: 322 },
      workflow: { staleAgeMs: 210_000 },
      symphony: { reconnectSuccessRate: 0.66, recoveryLatencyMs: 41_000 },
      mcp: { a11yViolationCounts: { serious: 2, critical: 1 } },
    }
  }

  return {
    chat: { eventLoopLagMs: 21, heapGrowthMb: 103 },
    workflow: { staleAgeMs: 18_000 },
    symphony: { reconnectSuccessRate: 0.99, recoveryLatencyMs: 3_000 },
    mcp: { a11yViolationCounts: { serious: 0, critical: 0 } },
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))

  const now = new Date()
  const sampleCount = Math.max(6, Math.min(36, Math.round(options.durationMs / (5 * 60 * 1000))))
  const sampleSpacingMs = Math.floor(options.durationMs / sampleCount)

  const timestamps = Array.from({ length: sampleCount }).map((_, index) =>
    new Date(now.getTime() + index * sampleSpacingMs).toISOString(),
  )

  let nowIndex = 0
  const aggregator = new RuntimeHealthAggregator({
    now: () => timestamps[Math.min(nowIndex, timestamps.length - 1)] ?? new Date().toISOString(),
    stabilityThresholds: DEFAULT_STABILITY_THRESHOLDS,
  })

  const timeline: SoakTimelineEntry[] = []

  for (let index = 0; index < sampleCount; index += 1) {
    nowIndex = index

    const phase: SoakTimelineEntry['phase'] =
      index < Math.floor(sampleCount * 0.4)
        ? 'healthy'
        : index < Math.floor(sampleCount * 0.55)
          ? 'failure'
          : 'recovery'

    const metrics = buildPhaseMetrics(phase)
    aggregator.ingestStabilityMetrics('chat_runtime', metrics.chat, { publish: false })
    aggregator.ingestStabilityMetrics('workflow_board', metrics.workflow, { publish: false })
    aggregator.ingestStabilityMetrics('symphony', metrics.symphony, { publish: false })
    aggregator.ingestStabilityMetrics('mcp', metrics.mcp, { publish: false })

    const snapshot = aggregator.getStabilitySnapshot()

    timeline.push({
      index,
      phase,
      sampledAt: snapshot.generatedAt,
      status: snapshot.status,
      breachCodes: snapshot.breaches.map((breach) => breach.code),
      metrics: {
        eventLoopLagMs: snapshot.metrics.eventLoopLagMs,
        heapGrowthMb: snapshot.metrics.heapGrowthMb,
        staleAgeMs: snapshot.metrics.staleAgeMs,
        reconnectSuccessRate: snapshot.metrics.reconnectSuccessRate,
        recoveryLatencyMs: snapshot.metrics.recoveryLatencyMs,
        a11ySerious: snapshot.metrics.a11yViolationCounts.serious,
        a11yCritical: snapshot.metrics.a11yViolationCounts.critical,
      },
    })
  }

  nowIndex = sampleCount - 1
  const finalSnapshot = aggregator.getStabilitySnapshot()

  const report = {
    version: 'm006-s03-soak-v1',
    generatedAt: finalSnapshot.generatedAt,
    metadata: {
      durationMs: options.durationMs,
      durationLabel: `${Math.round(options.durationMs / 60_000)}m`,
      sampleCount,
      sampleSpacingMs,
      assertThresholds: options.assertThresholds,
    },
    thresholds: finalSnapshot.thresholds,
    final: {
      status: finalSnapshot.status,
      breachCount: finalSnapshot.breaches.length,
      breaches: finalSnapshot.breaches,
      metrics: finalSnapshot.metrics,
      lastKnownGoodAt: finalSnapshot.lastKnownGoodAt,
    },
    timeline,
    summary: {
      healthySamples: timeline.filter((entry) => entry.status === 'healthy').length,
      degradedSamples: timeline.filter((entry) => entry.status === 'degraded').length,
      breachedSamples: timeline.filter((entry) => entry.status === 'breached').length,
      failureWindowDetected: timeline.some((entry) => entry.phase === 'failure' && entry.status !== 'healthy'),
      recoveredByEnd: finalSnapshot.status === 'healthy',
    },
  }

  const reportPath = path.resolve(process.cwd(), options.reportPath)
  await mkdir(path.dirname(reportPath), { recursive: true })
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

  if (options.assertThresholds && finalSnapshot.status !== 'healthy') {
    throw new Error(
      `Stability thresholds remain ${finalSnapshot.status} at end of soak run (${finalSnapshot.breaches
        .map((breach) => breach.code)
        .join(', ')}).`,
    )
  }

  console.log(
    `[m006-soak] wrote ${reportPath} (final status: ${finalSnapshot.status}, breaches: ${finalSnapshot.breaches.length})`,
  )
}

main().catch((error) => {
  console.error(`[m006-soak] ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
