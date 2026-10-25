interface WindowViewSnapshot {
  readonly scrollTop: number;
  readonly details: ReadonlyMap<string, boolean>;
}

/** Ephemeral presentation only: each living window owns its instance, never input values. */
export class WindowViewMemory {
  private readonly views = new Map<string, WindowViewSnapshot>();

  capture(key: string, container: HTMLElement): void {
    const details = new Map<string, boolean>();
    for (const element of container.querySelectorAll<HTMLDetailsElement>(
      "details[data-window-detail]"
    )) {
      const id = element.dataset.windowDetail;
      if (id) details.set(id, element.open);
    }
    this.views.set(key, {
      scrollTop: Number.isFinite(container.scrollTop) ? Math.max(0, container.scrollTop) : 0,
      details
    });
  }

  restore(key: string, container: HTMLElement): void {
    const saved = this.views.get(key);
    if (!saved) return;
    for (const element of container.querySelectorAll<HTMLDetailsElement>(
      "details[data-window-detail]"
    )) {
      const id = element.dataset.windowDetail;
      if (id && saved.details.has(id)) element.open = saved.details.get(id) === true;
    }
    // Opening details changes layout. Read the available height only after applying them.
    const maximum = Math.max(0, container.scrollHeight - container.clientHeight);
    container.scrollTop = Math.min(saved.scrollTop, maximum);
  }
}
