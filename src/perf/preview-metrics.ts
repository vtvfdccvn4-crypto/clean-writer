type MetricBucket = {
  count: number;
  totalMs: number;
  lastMs: number;
};

type MetricListener = (snapshot: PreviewMetricsSnapshot) => void;

export interface PreviewMetricsSnapshot {
  buckets: Record<string, MetricBucket>;
  lastResetAt: number;
}

class PreviewMetricsTracker {
  private buckets = new Map<string, MetricBucket>();
  private lastResetAt = performance.now();
  private listeners = new Set<MetricListener>();

  record(name: string, durationMs = 0) {
    const bucket = this.buckets.get(name) ?? { count: 0, totalMs: 0, lastMs: 0 };
    bucket.count += 1;
    bucket.totalMs += durationMs;
    bucket.lastMs = durationMs;
    this.buckets.set(name, bucket);
    this.notify();
  }

  recordProjectSnapshotLoad(durationMs: number) {
    this.record('projectSnapshotLoad', durationMs);
  }

  recordProjectTreeRefresh(durationMs: number) {
    this.record('projectTreeRefresh', durationMs);
  }

  recordSettingsSnapshotLoad(durationMs: number) {
    this.record('settingsSnapshotLoad', durationMs);
  }

  recordPreviewCompile(kind: string, durationMs: number) {
    this.record(`previewCompile:${kind}`, durationMs);
  }

  recordPreviewRender(kind: string, durationMs: number) {
    this.record(`previewRender:${kind}`, durationMs);
  }

  recordFastLaneUpdate() {
    this.record('previewFastLaneUpdate');
  }

  recordPdfPrintCssFallback(reason: 'stylesheet-missing' | 'cssom-unreadable' | 'stylesheets-unavailable') {
    this.record(`pdfPrintCssFallback:${reason}`);
  }

  recordPdfExportCache(hit: boolean) {
    this.record(`pdfExport:cache:${hit ? 'hit' : 'miss'}`);
  }

  recordPdfExportPhase(phase: 'snapshot' | 'pagination' | 'css' | 'resources' | 'orchestration-total' | 'browser-total', durationMs: number) {
    this.record(`pdfExport:${phase}`, durationMs);
  }

  snapshot(): PreviewMetricsSnapshot {
    return {
      buckets: Object.fromEntries(
        [...this.buckets.entries()].sort(([left], [right]) => left.localeCompare(right))
      ),
      lastResetAt: this.lastResetAt
    };
  }

  subscribe(listener: MetricListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  reset() {
    this.buckets.clear();
    this.lastResetAt = performance.now();
    this.notify();
  }

  formatCompactSummary(): string {
    const snapshot = this.snapshot();
    const parts: string[] = [];
    const snapshotLoad = snapshot.buckets.projectSnapshotLoad;
    const treeRefresh = snapshot.buckets.projectTreeRefresh;
    const settingsLoad = snapshot.buckets.settingsSnapshotLoad;
    const previewCompileCount = sumBucketCounts(snapshot, 'previewCompile:');
    const previewRenderCount = sumBucketCounts(snapshot, 'previewRender:');

    if (snapshotLoad) parts.push(`snapshot ${formatMs(snapshotLoad.lastMs)}`);
    if (treeRefresh) parts.push(`tree ${formatMs(treeRefresh.lastMs)}`);
    if (settingsLoad) parts.push(`settings ${formatMs(settingsLoad.lastMs)}`);
    if (previewCompileCount > 0) parts.push(`compile×${previewCompileCount}`);
    if (previewRenderCount > 0) parts.push(`render×${previewRenderCount}`);

    return parts.length > 0 ? parts.join(' | ') : 'idle';
  }

  formatChipSummary(): string {
    const snapshot = this.snapshot();
    const snapshotLoad = snapshot.buckets.projectSnapshotLoad;
    const previewRenderCount = sumBucketCounts(snapshot, 'previewRender:');

    return `snapshot ${formatMs(snapshotLoad?.lastMs ?? 0)} | renders ${previewRenderCount}`;
  }

  private notify() {
    const snapshot = this.snapshot();
    this.listeners.forEach(listener => {
      try {
        listener(snapshot);
      } catch {
        // Diagnostics must never break app flow.
      }
    });
  }
}

export const previewMetrics = new PreviewMetricsTracker();

declare global {
  interface Window {
    clearWriterPerf?: PreviewMetricsTracker;
  }
}

if (typeof window !== 'undefined') {
  window.clearWriterPerf = previewMetrics;
}

function formatMs(value: number): string {
  return `${value.toFixed(value >= 10 ? 0 : 1)}ms`;
}

function sumBucketCounts(snapshot: PreviewMetricsSnapshot, prefix: string): number {
  return Object.entries(snapshot.buckets)
    .filter(([name]) => name.startsWith(prefix))
    .reduce((total, [, bucket]) => total + bucket.count, 0);
}
