/**
 * Kata Dashboard Overlay
 *
 * Full-screen overlay showing auto-mode progress: milestone/slice/task
 * breakdown, current unit, completed units, timing, and activity log.
 * Toggled with Ctrl+Alt+G or opened from /kata status.
 */

import type { Theme } from "@mariozechner/pi-coding-agent";
import { truncateToWidth, visibleWidth, matchesKey, Key } from "@mariozechner/pi-tui";
import { getAutoDashboardData, type AutoDashboardData } from "./auto.js";
import {
  getLedger, getProjectTotals, aggregateByPhase, aggregateBySlice,
  aggregateByModel, formatCost, formatTokenCount, formatCostProjection,
} from "./metrics.js";
import { loadEffectiveKataPreferences } from "./preferences.js";
import { createBackend } from "./backend-factory.js";
import type { DashboardSliceView } from "./backend.js";

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return `${m}m ${rs}s`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h}h ${rm}m`;
}

function unitLabel(type: string): string {
  switch (type) {
    case "research-milestone": return "Research";
    case "plan-milestone": return "Plan";
    case "research-slice": return "Research";
    case "plan-slice": return "Plan";
    case "execute-task": return "Execute";
    case "complete-slice": return "Complete";
    case "reassess-roadmap": return "Reassess";
    default: return type;
  }
}

function centerLine(content: string, width: number): string {
  const vis = visibleWidth(content);
  if (vis >= width) return truncateToWidth(content, width);
  const leftPad = Math.floor((width - vis) / 2);
  return " ".repeat(leftPad) + content;
}

function padRight(content: string, width: number): string {
  const vis = visibleWidth(content);
  return content + " ".repeat(Math.max(0, width - vis));
}

function joinColumns(left: string, right: string, width: number): string {
  const leftW = visibleWidth(left);
  const rightW = visibleWidth(right);
  if (leftW + rightW + 2 > width) {
    return truncateToWidth(`${left}  ${right}`, width);
  }
  return left + " ".repeat(width - leftW - rightW) + right;
}

function fitColumns(parts: string[], width: number, separator = "  "): string {
  const filtered = parts.filter(Boolean);
  if (filtered.length === 0) return "";
  let result = filtered[0];
  for (let i = 1; i < filtered.length; i++) {
    const candidate = `${result}${separator}${filtered[i]}`;
    if (visibleWidth(candidate) > width) break;
    result = candidate;
  }
  return truncateToWidth(result, width);
}

export class KataDashboardOverlay {
  private tui: { requestRender: () => void };
  private theme: Theme;
  private onClose: () => void;
  private cachedWidth?: number;
  private cachedLines?: string[];
  private refreshTimer: ReturnType<typeof setInterval>;
  private scrollOffset = 0;
  private dashData: AutoDashboardData;
  private milestoneData: MilestoneView | null = null;
  private loading = true;

  constructor(
    tui: { requestRender: () => void },
    theme: Theme,
    onClose: () => void,
  ) {
    this.tui = tui;
    this.theme = theme;
    this.onClose = onClose;
    this.dashData = getAutoDashboardData();

    this.loadData().then(() => {
      this.loading = false;
      this.invalidate();
      this.tui.requestRender();
    });

    // Start at 2s, switch to 30s after first successful Linear backend load.
    // File mode stays at 2s (disk reads are free). Linear mode at 30s
    // avoids burning the 5000 req/hr API rate limit.
    this.refreshTimer = setInterval(() => {
      this.dashData = getAutoDashboardData();
      this.loadData().then(() => {
        this.invalidate();
        this.tui.requestRender();
      });
    }, 2000);
  }

  private cachedBackend: import("./backend.js").KataBackend | null = null;

  private async loadData(): Promise<void> {
    const base = this.dashData.basePath || process.cwd();

    try {
      if (!this.cachedBackend) {
        this.cachedBackend = await createBackend(base);
      }
      const dashData = await this.cachedBackend.loadDashboardData();
      const state = dashData.state;

      if (!state.activeMilestone) {
        this.milestoneData = null;
        return;
      }

      const milestoneDone =
        state.progress?.milestones.done ??
        state.registry.filter((e) => e.status === "complete").length;
      const milestoneTotal =
        state.progress?.milestones.total ?? state.registry.length;

      const sliceDone = dashData.sliceProgress?.done ?? 0;
      const sliceTotal = dashData.sliceProgress?.total ?? 0;

      const sliceViews: SliceView[] = (dashData.sliceViews ?? []).map((sv) => ({
        id: sv.id,
        title: sv.title,
        done: sv.done,
        risk: sv.risk,
        active: sv.active,
        tasks: sv.tasks.map((t) => ({
          id: t.id,
          title: t.title,
          done: t.done,
          active: t.active,
        })),
        taskProgress: sv.taskProgress,
      }));

      const view: MilestoneView = {
        id: state.activeMilestone.id,
        title: state.activeMilestone.title,
        phase: state.phase,
        slices: sliceViews,
        progress: {
          milestones: { done: milestoneDone, total: milestoneTotal },
          slices: sliceTotal > 0 ? { done: sliceDone, total: sliceTotal } : undefined,
        },
      };

      this.milestoneData = view;
    } catch {
      // Don't crash the overlay — keep showing stale data
    }
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c")) || matchesKey(data, Key.ctrlAlt("g"))) {
      clearInterval(this.refreshTimer);
      this.onClose();
      return;
    }

    if (matchesKey(data, Key.down) || matchesKey(data, "j")) {
      this.scrollOffset++;
      this.invalidate();
      this.tui.requestRender();
      return;
    }

    if (matchesKey(data, Key.up) || matchesKey(data, "k")) {
      this.scrollOffset = Math.max(0, this.scrollOffset - 1);
      this.invalidate();
      this.tui.requestRender();
      return;
    }

    if (data === "g") {
      this.scrollOffset = 0;
      this.invalidate();
      this.tui.requestRender();
      return;
    }

    if (data === "G") {
      this.scrollOffset = 999;
      this.invalidate();
      this.tui.requestRender();
      return;
    }
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) {
      return this.cachedLines;
    }

    const content = this.buildContentLines(width);
    const viewportHeight = Math.max(5, process.stdout.rows ? process.stdout.rows - 8 : 24);
    const chromeHeight = 2;
    const visibleContentRows = Math.max(1, viewportHeight - chromeHeight);
    const maxScroll = Math.max(0, content.length - visibleContentRows);
    this.scrollOffset = Math.min(this.scrollOffset, maxScroll);
    const visibleContent = content.slice(this.scrollOffset, this.scrollOffset + visibleContentRows);

    const lines = this.wrapInBox(visibleContent, width);

    this.cachedWidth = width;
    this.cachedLines = lines;
    return lines;
  }

  private wrapInBox(inner: string[], width: number): string[] {
    const th = this.theme;
    const border = (s: string) => th.fg("borderAccent", s);
    const innerWidth = width - 4;
    const lines: string[] = [];

    lines.push(border("╭" + "─".repeat(width - 2) + "╮"));
    for (const line of inner) {
      const truncated = truncateToWidth(line, innerWidth);
      const padWidth = Math.max(0, innerWidth - visibleWidth(truncated));
      lines.push(border("│") + " " + truncated + " ".repeat(padWidth) + " " + border("│"));
    }
    lines.push(border("╰" + "─".repeat(width - 2) + "╯"));
    return lines;
  }

  private buildContentLines(width: number): string[] {
    const th = this.theme;
    const shellWidth = width - 4;
    const contentWidth = Math.min(shellWidth, 128);
    const sidePad = Math.max(0, Math.floor((shellWidth - contentWidth) / 2));
    const leftMargin = " ".repeat(sidePad);
    const lines: string[] = [];

    const row = (content = ""): string => {
      const truncated = truncateToWidth(content, contentWidth);
      return leftMargin + padRight(truncated, contentWidth);
    };
    const blank = () => row("");
    const hr = () => row(th.fg("dim", "─".repeat(contentWidth)));
    const centered = (content: string) => row(centerLine(content, contentWidth));

    const title = th.fg("accent", th.bold("Kata Dashboard"));
    const status = this.dashData.active
      ? `${Date.now() % 2000 < 1000 ? th.fg("success", "●") : th.fg("dim", "○")} ${th.fg("success", "AUTO")}`
      : this.dashData.paused
        ? th.fg("warning", "⏸ PAUSED")
        : th.fg("dim", "idle");
    const elapsed = th.fg("dim", formatDuration(this.dashData.elapsed));
    lines.push(row(joinColumns(`${title}  ${status}`, elapsed, contentWidth)));
    lines.push(blank());

    if (this.dashData.currentUnit) {
      const cu = this.dashData.currentUnit;
      const currentElapsed = th.fg("dim", formatDuration(Date.now() - cu.startedAt));
      lines.push(row(joinColumns(
        `${th.fg("text", "Now")}: ${th.fg("accent", unitLabel(cu.type))} ${th.fg("text", cu.id)}`,
        currentElapsed,
        contentWidth,
      )));
      lines.push(blank());
    } else if (this.dashData.paused) {
      lines.push(row(th.fg("dim", "/kata auto to resume")));
      lines.push(blank());
    } else {
      lines.push(row(th.fg("dim", "No unit running · /kata auto to start")));
      lines.push(blank());
    }

    if (this.loading) {
      lines.push(centered(th.fg("dim", "Loading dashboard…")));
      return lines;
    }

    if (this.milestoneData) {
      const mv = this.milestoneData;
      lines.push(row(th.fg("text", th.bold(`${mv.id}: ${mv.title}`))));
      lines.push(blank());

      const totalSlices = mv.progress.slices?.total ?? mv.slices.length;
      const doneSlices = mv.progress.slices?.done ?? mv.slices.filter(s => s.done).length;
      const totalMilestones = mv.progress.milestones.total;
      const doneMilestones = mv.progress.milestones.done;
      const activeSlice = mv.slices.find(s => s.active);

      lines.push(blank());

      if (activeSlice?.taskProgress) {
        lines.push(row(this.renderProgressRow("Tasks", activeSlice.taskProgress.done, activeSlice.taskProgress.total, "accent", contentWidth)));
      }
      lines.push(row(this.renderProgressRow("Slices", doneSlices, totalSlices, "success", contentWidth)));
      lines.push(row(this.renderProgressRow("Milestones", doneMilestones, totalMilestones, "warning", contentWidth)));

      lines.push(blank());

      for (const s of mv.slices) {
        const icon = s.done ? th.fg("success", "✓")
          : s.active ? th.fg("accent", "▸")
          : th.fg("dim", "○");
        const titleText = s.active ? th.fg("accent", `${s.id}: ${s.title}`)
          : s.done ? th.fg("muted", `${s.id}: ${s.title}`)
          : th.fg("dim", `${s.id}: ${s.title}`);
        const risk = th.fg("dim", s.risk);
        lines.push(row(joinColumns(`  ${icon} ${titleText}`, risk, contentWidth)));

        if (s.active && s.tasks.length > 0) {
          for (const t of s.tasks) {
            const tIcon = t.done ? th.fg("success", "✓")
              : t.active ? th.fg("warning", "▸")
              : th.fg("dim", "·");
            const tTitle = t.active ? th.fg("warning", `${t.id}: ${t.title}`)
              : t.done ? th.fg("muted", `${t.id}: ${t.title}`)
              : th.fg("dim", `${t.id}: ${t.title}`);
            lines.push(row(`      ${tIcon} ${truncateToWidth(tTitle, contentWidth - 6)}`));
          }
        }
      }
    } else {
      lines.push(centered(th.fg("dim", "No active milestone.")));
    }

    if (this.dashData.completedUnits.length > 0) {
      lines.push(blank());
      lines.push(hr());
      lines.push(row(th.fg("text", th.bold("Completed"))));
      lines.push(blank());

      const recent = [...this.dashData.completedUnits].reverse().slice(0, 10);
      for (const u of recent) {
        const left = `  ${th.fg("success", "✓")} ${th.fg("muted", unitLabel(u.type))} ${th.fg("muted", u.id)}`;
        const right = th.fg("dim", formatDuration(u.finishedAt - u.startedAt));
        lines.push(row(joinColumns(left, right, contentWidth)));
      }

      if (this.dashData.completedUnits.length > 10) {
        lines.push(row(th.fg("dim", `  ...and ${this.dashData.completedUnits.length - 10} more`)));
      }
    }

    const ledger = getLedger();
    if (ledger && ledger.units.length > 0) {
      const totals = getProjectTotals(ledger.units);

      lines.push(blank());
      lines.push(hr());
      lines.push(row(th.fg("text", th.bold("Cost & Usage"))));
      lines.push(blank());

      lines.push(row(fitColumns([
        `${th.fg("warning", formatCost(totals.cost))} total`,
        `${th.fg("text", formatTokenCount(totals.tokens.total))} tokens`,
        `${th.fg("text", String(totals.toolCalls))} tools`,
        `${th.fg("text", String(totals.units))} units`,
      ], contentWidth, `  ${th.fg("dim", "·")}  `)));

      lines.push(row(fitColumns([
        `${th.fg("dim", "in:")} ${th.fg("text", formatTokenCount(totals.tokens.input))}`,
        `${th.fg("dim", "out:")} ${th.fg("text", formatTokenCount(totals.tokens.output))}`,
        `${th.fg("dim", "cache-r:")} ${th.fg("text", formatTokenCount(totals.tokens.cacheRead))}`,
        `${th.fg("dim", "cache-w:")} ${th.fg("text", formatTokenCount(totals.tokens.cacheWrite))}`,
      ], contentWidth, "  ")));

      const phases = aggregateByPhase(ledger.units);
      if (phases.length > 0) {
        lines.push(blank());
        lines.push(row(th.fg("dim", "By Phase")));
        for (const p of phases) {
          const pct = totals.cost > 0 ? Math.round((p.cost / totals.cost) * 100) : 0;
          const left = `  ${th.fg("text", p.phase.padEnd(14))}${th.fg("warning", formatCost(p.cost).padStart(8))}`;
          const right = th.fg("dim", `${String(pct).padStart(3)}%  ${formatTokenCount(p.tokens.total)} tok  ${p.units} units`);
          lines.push(row(joinColumns(left, right, contentWidth)));
        }
      }

      const slices = aggregateBySlice(ledger.units);
      if (slices.length > 0) {
        lines.push(blank());
        lines.push(row(th.fg("dim", "By Slice")));
        for (const s of slices) {
          const pct = totals.cost > 0 ? Math.round((s.cost / totals.cost) * 100) : 0;
          const left = `  ${th.fg("text", s.sliceId.padEnd(14))}${th.fg("warning", formatCost(s.cost).padStart(8))}`;
          const right = th.fg("dim", `${String(pct).padStart(3)}%  ${formatTokenCount(s.tokens.total)} tok  ${formatDuration(s.duration)}`);
          lines.push(row(joinColumns(left, right, contentWidth)));
        }
      }

      // Cost projection — only when active milestone data is available
      if (this.milestoneData) {
        const mv = this.milestoneData;
        const msTotalSlices = mv.progress.slices?.total ?? mv.slices.length;
        const msDoneSlices = mv.progress.slices?.done ?? mv.slices.filter(s => s.done).length;
        const remainingCount = msTotalSlices - msDoneSlices;
        const overlayPrefs = loadEffectiveKataPreferences()?.preferences;
        const projLines = formatCostProjection(slices, remainingCount, overlayPrefs?.budget_ceiling);
        if (projLines.length > 0) {
          lines.push(blank());
          for (const line of projLines) {
            const colored = line.toLowerCase().includes('ceiling')
              ? th.fg("warning", line)
              : th.fg("dim", line);
            lines.push(row(colored));
          }
        }
      }

      const models = aggregateByModel(ledger.units);
      if (models.length > 1) {
        lines.push(blank());
        lines.push(row(th.fg("dim", "By Model")));
        for (const m of models) {
          const pct = totals.cost > 0 ? Math.round((m.cost / totals.cost) * 100) : 0;
          const modelName = truncateToWidth(m.model, 38);
          const left = `  ${th.fg("text", modelName.padEnd(38))}${th.fg("warning", formatCost(m.cost).padStart(8))}`;
          const right = th.fg("dim", `${String(pct).padStart(3)}%  ${m.units} units`);
          lines.push(row(joinColumns(left, right, contentWidth)));
        }
      }

      lines.push(blank());
      lines.push(row(`${th.fg("dim", "avg/unit:")} ${th.fg("text", formatCost(totals.cost / totals.units))}  ${th.fg("dim", "·")}  ${th.fg("text", formatTokenCount(Math.round(totals.tokens.total / totals.units)))} tokens`));
    }

    lines.push(blank());
    lines.push(hr());
    lines.push(centered(th.fg("dim", "↑↓ scroll · g/G top/end · esc close")));

    return lines;
  }

  private renderProgressRow(
    label: string,
    done: number,
    total: number,
    color: "success" | "accent" | "warning",
    width: number,
  ): string {
    const th = this.theme;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    const labelWidth = 12;
    const rightWidth = 14;
    const gap = 2;
    const labelText = truncateToWidth(label, labelWidth, "").padEnd(labelWidth);
    const ratioText = `${done}/${total}`;
    const rightText = `${String(pct).padStart(3)}%  ${ratioText.padStart(rightWidth - 5)}`;
    const barWidth = Math.max(12, width - labelWidth - rightWidth - gap * 2);
    const filled = total > 0 ? Math.round((done / total) * barWidth) : 0;
    const bar = th.fg(color, "█".repeat(filled)) + th.fg("dim", "░".repeat(Math.max(0, barWidth - filled)));
    return `${th.fg("dim", labelText)}${" ".repeat(gap)}${bar}${" ".repeat(gap)}${th.fg("dim", rightText)}`;
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }

  dispose(): void {
    clearInterval(this.refreshTimer);
  }
}

interface MilestoneView {
  id: string;
  title: string;
  slices: SliceView[];
  phase: string;
  progress: {
    milestones: {
      total: number;
      done: number;
    };
    slices?: {
      total: number;
      done: number;
    };
  };
}

interface SliceView {
  id: string;
  title: string;
  done: boolean;
  risk: string;
  active: boolean;
  tasks: TaskView[];
  taskProgress?: { done: number; total: number };
}

interface TaskView {
  id: string;
  title: string;
  done: boolean;
  active: boolean;
}
