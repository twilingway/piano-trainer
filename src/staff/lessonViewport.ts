/** Keep the active musical entry above the lesson's fixed action row at the chosen scale. */
export function revealLessonEntry(
  host: HTMLElement,
  entries: ReadonlyMap<SVGElement, number>,
  beat: number,
  exactHeads?: ReadonlyMap<string, readonly SVGElement[]>
): void {
  const body = host.closest<HTMLElement>(".lesson-workspace__body");
  if (!body || body.clientHeight <= 0) return;
  const quantize = (position: number) => Math.round(position * 1000) / 1000;
  const targets = new Map([...entries].map(([head, position]) => [head, quantize(position)]));
  for (const [key, heads] of exactHeads ?? []) {
    const position = Number(key.split(":")[0]);
    for (const head of heads) targets.set(head, position);
  }
  let active = -Infinity;
  for (const position of targets.values()) {
    if (position <= quantize(beat)) active = Math.max(active, position);
  }
  if (!Number.isFinite(active)) active = Math.min(...targets.values());
  let top = Infinity;
  let bottom = -Infinity;
  for (const [element, position] of targets) {
    if (position !== active) continue;
    const box = element.getBoundingClientRect();
    if (!(box.width > 0 && box.height > 0)) continue;
    top = Math.min(top, box.top);
    bottom = Math.max(bottom, box.bottom);
  }
  if (!Number.isFinite(top)) return;
  const viewport = body.getBoundingClientRect();
  const padding = Math.min(8, body.clientHeight / 8);
  let delta = 0;
  if (bottom > viewport.bottom - padding) delta = bottom - viewport.bottom + padding;
  if (top - delta < viewport.top + padding) delta = top - viewport.top - padding;
  body.scrollTop = Math.max(0, body.scrollTop + delta);
}
