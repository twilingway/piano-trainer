export interface ResourceMeasurement {
  readonly loaded: number;
  readonly total?: number;
  readonly complete?: boolean;
  readonly cached?: boolean;
  readonly network?: number;
  readonly identity?: string;
}

/** Content bytes and measured network traffic have separate units and never share a total. */
export function createResourceProgress(expectedSizes: Readonly<Record<string, number>> = {}) {
  const pending = new Map<string, ResourceMeasurement>();
  const completed = new Map<string, { url: string; measurement: ResourceMeasurement }>();
  const completedUrls = new Set<string>();
  return {
    update(url: string, next: ResourceMeasurement): void {
      if (!Number.isFinite(next.loaded) || next.loaded < 0) return;
      const previous = pending.get(url);
      if (!next.complete && !previous && completedUrls.has(url) && next.loaded > 0) return;
      const { total, ...measurement } = next;
      const measured = {
        ...measurement,
        loaded: Math.max(previous?.loaded ?? 0, next.loaded),
        ...(total !== undefined && Number.isFinite(total) && total >= next.loaded ? { total } : {})
      };
      if (next.complete) {
        const identity = next.identity ?? url;
        if (completed.has(identity)) return;
        completed.set(identity, { url, measurement: measured });
        completedUrls.add(url);
        pending.delete(url);
      } else {
        pending.set(url, measured);
      }
    },
    snapshot() {
      let loaded = 0;
      let cached = 0;
      let network = 0;
      let remaining = 0;
      let knownPending = false;
      for (const entry of [...completed.values()]
        .map((value) => value.measurement)
        .concat([...pending.values()])) {
        loaded += entry.loaded;
        if (entry.cached) cached += entry.loaded;
        network += entry.network ?? 0;
        if (!entry.complete && entry.total !== undefined) {
          remaining += Math.max(0, entry.total - entry.loaded);
          knownPending = true;
        }
      }
      let estimatedRemaining = 0;
      const estimatedSizes = new Map(Object.entries(expectedSizes));
      for (const [url, entry] of pending) {
        if (entry.total !== undefined) estimatedSizes.set(url, entry.total);
      }
      for (const [url, size] of estimatedSizes) {
        if (!completedUrls.has(url) || pending.has(url))
          estimatedRemaining += Math.max(0, size - (pending.get(url)?.loaded ?? 0));
      }
      return {
        loaded,
        cached,
        network,
        remaining,
        knownPending,
        estimatedRemaining,
        estimatedTotal: loaded + estimatedRemaining
      };
    }
  };
}
