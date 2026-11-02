import { useLayoutEffect, useRef } from "react";

const margins = (style: CSSStyleDeclaration) =>
  (Number.parseFloat(style.marginTop) || 0) + (Number.parseFloat(style.marginBottom) || 0);

/** Consume the renderer's reservation; notation never guesses the physical keyboard's size. */
export function usePianoStaffRoom(enabled: boolean, staffOnly: boolean, staffShown: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const workspace = ref.current;
    if (!enabled || !workspace) return;
    const measure = () => {
      const lanes = workspace.querySelector<HTMLElement>(":scope > .lanes");
      const staves = workspace.querySelector<HTMLElement>(":scope > .staves");
      const required = Number.parseFloat(
        lanes?.style.getPropertyValue("--piano-required-height") ?? ""
      );
      let occupied = 0;
      for (const child of workspace.children) {
        if (!(child instanceof HTMLElement) || child === lanes || child === staves) continue;
        const style = getComputedStyle(child);
        if (style.position === "absolute" || style.position === "fixed" || style.display === "none")
          continue;
        occupied += child.getBoundingClientRect().height + margins(style);
      }
      const available = Math.max(
        0,
        workspace.getBoundingClientRect().height -
          (Number.isFinite(required) ? Math.max(0, required) : 0) -
          occupied -
          (staves ? margins(getComputedStyle(staves)) : 0)
      );
      workspace.style.setProperty("--piano-staff-room", `${String(available)}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(workspace);
    for (const child of workspace.children)
      if (child instanceof HTMLElement && !child.matches(".staves,.lanes")) observer.observe(child);
    workspace.addEventListener("piano-layout-footprint", measure);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      workspace.removeEventListener("piano-layout-footprint", measure);
      window.removeEventListener("resize", measure);
      workspace.style.removeProperty("--piano-staff-room");
    };
  }, [enabled, staffOnly, staffShown]);
  return ref;
}
