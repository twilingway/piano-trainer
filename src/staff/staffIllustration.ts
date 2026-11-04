import type { LineBox } from "./staffViewport";
/** Fit a static introductory illustration to its own frame, including clef and note-name ink. */
export function fitStaffIllustration(host: HTMLElement): LineBox[] {
  const svg = host.querySelector("svg");
  const width = host.clientWidth,
    height = host.clientHeight;
  if (!svg || typeof svg.getBBox !== "function" || !(width > 0 && height > 0)) return [];
  const ink = svg.getBBox();
  if (!(ink.width > 0 && ink.height > 0)) return [];
  const padding = 8;
  svg.setAttribute(
    "viewBox",
    `${String(ink.x - padding)} ${String(ink.y - padding)} ${String(ink.width + padding * 2)} ${String(ink.height + padding * 2)}`
  );
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  if (svg.parentElement) {
    svg.parentElement.style.width = `${String(width)}px`;
    svg.parentElement.style.height = `${String(height)}px`;
  }
  host.scrollLeft = 0;
  host.scrollTop = 0;
  return [{ top: padding, bottom: height - padding }];
}
