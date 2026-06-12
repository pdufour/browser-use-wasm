/**
 * Lightweight phase timings for main thread + workers (performance.now).
 */

export interface PerfMark {
  label: string;
  ms: number;
  detail?: string;
}

export interface PerfDelta {
  label: string;
  deltaMs: number;
  totalMs: number;
  detail?: string;
}

export interface PerfSnapshot {
  title?: string;
  marks?: PerfMark[];
  totalMs?: number;
  slowest?: PerfDelta[];
}

export interface PerfTracker {
  mark(label: string, detail?: string): void;
  getMarks(): PerfMark[];
  totalMs(): number;
  deltas(): PerfDelta[];
  slowest(topN?: number): PerfDelta[];
  formatBlock(extra?: PerfMark[]): string;
  toJSON(): PerfSnapshot;
}

export function perfDeltas(marks: PerfMark[]): PerfDelta[] {
  let prev = 0;
  return marks.map((m) => {
    const totalMs = typeof m.ms === 'number' ? m.ms : prev;
    const deltaMs = totalMs - prev;
    prev = totalMs;
    return { label: m.label, deltaMs, totalMs, detail: m.detail };
  });
}

export function slowestPhases(
  snapshot: PerfSnapshot | null | undefined,
  topN = 5
): PerfDelta[] {
  const deltas = perfDeltas(snapshot?.marks ?? []);
  return [...deltas].sort((a, b) => b.deltaMs - a.deltaMs).slice(0, topN);
}

export function createPerfTracker(title = ''): PerfTracker {
  const t0 = performance.now();
  const marks: PerfMark[] = [];

  return {
    mark(label: string, detail?: string) {
      marks.push({
        label,
        ms: performance.now() - t0,
        detail,
      });
    },
    getMarks(): PerfMark[] {
      return marks.slice();
    },
    totalMs() {
      return performance.now() - t0;
    },
    deltas(): PerfDelta[] {
      return perfDeltas(marks);
    },
    slowest(topN = 5) {
      return slowestPhases({ marks }, topN);
    },
    formatBlock(extra: PerfMark[] = []) {
      const all = [...marks, ...extra];
      if (!all.length) return '';
      const deltas = perfDeltas(all);
      const lines = deltas.map((d) => {
        const detail = d.detail ? ` — ${d.detail}` : '';
        return `  ${d.label}: +${d.deltaMs.toFixed(0)} ms (Σ ${d.totalMs.toFixed(0)} ms)${detail}`;
      });
      const total = all.length ? all[all.length - 1].ms : 0;
      const header = title ? `${title} — total ${total.toFixed(0)} ms\n` : '';
      const slow = slowestPhases({ marks: all }, 3);
      const slowLines = slow.length
        ? `\n  slowest:\n${slow
            .map((s) => `    • ${s.label}: ${s.deltaMs.toFixed(0)} ms${s.detail ? ` (${s.detail})` : ''}`)
            .join('\n')}`
        : '';
      return `${header}${lines.join('\n')}${slowLines}`;
    },
    toJSON(): PerfSnapshot {
      return {
        title,
        marks: marks.slice(),
        totalMs: performance.now() - t0,
        slowest: slowestPhases({ marks }, 5),
      };
    },
  };
}

export function formatPerfJSON(snapshot: PerfSnapshot | null | undefined): string {
  if (!snapshot?.marks?.length) return '';
  const deltas = perfDeltas(snapshot.marks);
  const lines = deltas.map((d) => {
    const detail = d.detail ? ` — ${d.detail}` : '';
    return `  ${d.label}: +${d.deltaMs.toFixed(0)} ms (Σ ${d.totalMs.toFixed(0)} ms)${detail}`;
  });
  const total =
    snapshot.marks[snapshot.marks.length - 1]?.ms ?? snapshot.totalMs ?? 0;
  const title = snapshot.title ?? 'Timings';
  const slow = snapshot.slowest ?? slowestPhases(snapshot, 3);
  const slowLines = slow.length
    ? `\n  slowest:\n${slow
        .map((s) => `    • ${s.label}: ${s.deltaMs.toFixed(0)} ms${s.detail ? ` (${s.detail})` : ''}`)
        .join('\n')}`
    : '';
  return `${title} — total ${Number(total).toFixed(0)} ms\n${lines.join('\n')}${slowLines}`;
}

export function mergePerfBlocks(
  a: PerfSnapshot | null | undefined,
  b: PerfSnapshot | null | undefined
): string {
  return [formatPerfJSON(a), formatPerfJSON(b)].filter(Boolean).join('\n\n');
}

/**
 * Full report + global slowest-across-sections summary.
 */
export function formatPerfReport(snapshots: PerfSnapshot[]): string {
  const blocks = snapshots.map((s) => formatPerfJSON(s)).filter(Boolean);
  if (!blocks.length) return '';

  const allDeltas = snapshots.flatMap((s) =>
    perfDeltas(s.marks ?? []).map((d) => ({
      ...d,
      section: s.title ?? 'unknown',
    }))
  );
  const globalSlow = [...allDeltas]
    .sort((a, b) => b.deltaMs - a.deltaMs)
    .slice(0, 5)
    .map(
      (s) =>
        `  • [${s.section}] ${s.label}: ${s.deltaMs.toFixed(0)} ms${s.detail ? ` — ${s.detail}` : ''}`
    );

  return `${blocks.join('\n\n')}\n\n=== Top bottlenecks (all phases) ===\n${globalSlow.join('\n')}`;
}

export function logPerfReport(label: string, snapshots: PerfSnapshot[]): void {
  const report = formatPerfReport(snapshots);
  if (!report) return;
  console.info(`[perf] ${label}\n${report}`);
}

/**
 * Duration in ms from a perf mark detail string (e.g. "1218 ms — vision encode").
 */
export function perfMarkMs(
  snapshot: PerfSnapshot | null | undefined,
  label: string
): number | null {
  const mark = snapshot?.marks?.find((m) => m.label === label);
  if (!mark?.detail) return null;
  const m = String(mark.detail).match(/^([\d.]+)\s*ms/);
  return m ? Math.round(Number(m[1])) : null;
}

/**
 * One structured console line for E2E regex / humans (no URL flags).
 */
export function logPerfEvent(phase: string, fields: Record<string, unknown>): void {
  const payload: Record<string, unknown> = { phase };
  for (const [key, value] of Object.entries(fields)) {
    if (value == null) continue;
    payload[key] =
      typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : value;
  }
  console.info(`[perf] ${JSON.stringify(payload)}`);
}
