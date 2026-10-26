interface WindowViewSnapshot {
  readonly scrollTop: number;
  readonly details: ReadonlyMap<string, boolean>;
}

/** Ephemeral presentation only: each living window owns its instance, never input values. */
export class WindowViewMemory {
  private readonly views = new Map<string, WindowViewSnapshot>();

  detailOpen(key: string, id: string): boolean {
    return this.views.get(key)?.details.get(id) === true;
  }

  captureDetails(key: string, container: HTMLElement): void {
    const previous = this.views.get(key);
    // Lazy sections may temporarily unmount remembered descendants.
    const details = new Map(previous?.details ?? []);
    for (const element of container.querySelectorAll<HTMLDetailsElement>(
      "details[data-window-detail]"
    )) {
      const id = element.dataset.windowDetail;
      if (id) details.set(id, element.open);
    }
    this.views.set(key, { scrollTop: previous?.scrollTop ?? 0, details });
  }

  capture(key: string, container: HTMLElement): void {
    this.captureDetails(key, container);
    this.views.set(key, {
      scrollTop: Number.isFinite(container.scrollTop) ? Math.max(0, container.scrollTop) : 0,
      details: this.views.get(key)?.details ?? new Map()
    });
  }

  restoreDetails(key: string, container: HTMLElement): void {
    const saved = this.views.get(key);
    if (!saved) return;
    for (const element of container.querySelectorAll<HTMLDetailsElement>(
      "details[data-window-detail]"
    )) {
      const id = element.dataset.windowDetail;
      if (id && saved.details.has(id)) element.open = saved.details.get(id) === true;
    }
  }

  restore(key: string, container: HTMLElement): void {
    const saved = this.views.get(key);
    if (!saved) return;
    this.restoreDetails(key, container);
    // Opening details changes layout. Read the available height only after applying them.
    const maximum = Math.max(0, container.scrollHeight - container.clientHeight);
    container.scrollTop = Math.min(saved.scrollTop, maximum);
  }
}
