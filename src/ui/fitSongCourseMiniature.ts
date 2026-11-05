/** Fit the real engraved measure, including its prefix and studied note, into a static icon. */
export function fitSongCourseMiniature(wrapper: HTMLElement): void {
  const host = wrapper.querySelector<HTMLElement>(".staff");
  const svg = host?.querySelector<SVGSVGElement>("svg");
  if (!host || !svg || typeof svg.getBBox !== "function") return;
  const frameStyle = getComputedStyle(wrapper);
  const width =
    wrapper.clientWidth -
    (parseFloat(frameStyle.paddingLeft) || 0) -
    (parseFloat(frameStyle.paddingRight) || 0);
  const height =
    wrapper.clientHeight -
    (parseFloat(frameStyle.paddingTop) || 0) -
    (parseFloat(frameStyle.paddingBottom) || 0);
  if (!(width > 0 && height > 0) || !svg.querySelector(".vf-stavenote")) return;
  // Clear the previous prototype's prefix hiding when a development render is retained by HMR.
  for (const prefix of svg.querySelectorAll<SVGElement>(
    ".vf-clef, .vf-timesignature, .vf-keysignature"
  ))
    prefix.style.removeProperty("display");
  const ink = svg.getBBox();
  if (!(ink.width > 0 && ink.height > 0)) return;
  const padding = 8;
  svg.setAttribute(
    "viewBox",
    [ink.x - padding, ink.y - padding, ink.width + padding * 2, ink.height + padding * 2]
      .map(String)
      .join(" ")
  );
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  const page = host.querySelector<HTMLElement>(".staff-page");
  if (page) {
    page.style.paddingInline = "0px";
    page.style.width = `${String(width)}px`;
    page.style.height = `${String(height)}px`;
  }
  host.scrollLeft = 0;
  host.scrollTop = 0;
}
