import { useLayoutEffect, type RefObject } from "react";

/** Follow the engraved viewport after layout, without moving or constraining the score. */
export function useLessonActionAnchor(contentRef: RefObject<HTMLDivElement | null>): void {
  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const body = content.querySelector<HTMLElement>(".lesson-workspace__body");
    const response = content.querySelector<HTMLElement>(".lesson-workspace__response");
    if (!body || !response) return;
    const wide = window.matchMedia("(width > 640px)");
    const observed = new Set<Element>();
    const clear = () => {
      delete content.dataset.lessonActionAnchor;
      content.style.removeProperty("--lesson-actions-left");
      content.style.removeProperty("--lesson-actions-top");
    };
    const position = () => {
      const score = content.querySelector<SVGSVGElement>(".lesson-workspace__score .staff svg");
      const answer = content.querySelector(".lesson-workspace__answer");
      if (!wide.matches || !score || answer?.hasChildNodes()) {
        clear();
        return;
      }
      const frame = content.getBoundingClientRect();
      const viewport = body.getBoundingClientRect();
      const ink = score.getBoundingClientRect();
      const rail = response.getBoundingClientRect();
      const left = Math.max(ink.left, viewport.left);
      const right = Math.min(ink.right, viewport.right);
      const top = Math.max(ink.top, viewport.top);
      const bottom = Math.min(ink.bottom, viewport.bottom);
      if (!(
        frame.width > 0 &&
        frame.height > 0 &&
        rail.width > 0 &&
        right > left &&
        bottom > top
      )) {
        clear();
        return;
      }
      const gap = Number.parseFloat(getComputedStyle(content).columnGap) || 12;
      const x = Math.max(
        0,
        Math.min(frame.width - rail.width, left - frame.left - rail.width - gap)
      );
      const y = Math.max(
        0,
        Math.min(frame.height - rail.height, (top + bottom) / 2 - frame.top - rail.height / 2)
      );
      content.dataset.lessonActionAnchor = "true";
      content.style.setProperty("--lesson-actions-left", `${String(Math.round(x))}px`);
      content.style.setProperty("--lesson-actions-top", `${String(Math.round(y))}px`);
    };
    const resize = new ResizeObserver(position);
    const placement = new MutationObserver(position);
    const observe = () => {
      const current = new Set<Element>([
        content,
        body,
        response,
        ...content.querySelectorAll(".lesson-workspace__score .staff svg")
      ]);
      for (const item of observed) {
        if (current.has(item)) continue;
        resize.unobserve(item);
        observed.delete(item);
      }
      for (const item of current) {
        if (observed.has(item)) continue;
        resize.observe(item);
        observed.add(item);
      }
      // Only the placement wrappers are watched for late transforms or margins.
      // Cursor and glyph styles change during playback and must not schedule layout reads.
      placement.disconnect();
      const wrappers = new Set<Element>();
      for (const svg of content.querySelectorAll(".lesson-workspace__score .staff svg")) {
        if (svg.parentElement) wrappers.add(svg.parentElement);
        const page = svg.closest(".staff-page");
        if (page) wrappers.add(page);
      }
      for (const wrapper of wrappers)
        placement.observe(wrapper, { attributes: true, attributeFilter: ["style"] });
      position();
    };
    const mutations = new MutationObserver(observe);
    // Engraving replaces SVG children; cursor/style changes do not schedule this pass.
    mutations.observe(content, { childList: true, subtree: true });
    observe();
    content.addEventListener("scroll", position, { capture: true, passive: true });
    window.addEventListener("resize", position);
    wide.addEventListener("change", position);
    return () => {
      mutations.disconnect();
      placement.disconnect();
      resize.disconnect();
      content.removeEventListener("scroll", position, true);
      window.removeEventListener("resize", position);
      wide.removeEventListener("change", position);
      clear();
    };
  }, [contentRef]);
}
