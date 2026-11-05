import { useLayoutEffect, useState, type RefObject } from "react";
import {
  songCourseStartPlacement,
  type CourseStartPlacement,
  type SceneRect
} from "./songCourseStartGeometry";

/** Includes drawn fingers, names and the pinned clef, rather than the SVG's blank page margins. */
export function courseDrawingBounds(score: HTMLElement): SceneRect | null {
  const clip = score.getBoundingClientRect();
  const boxes: SceneRect[] = [];
  for (const svg of score.querySelectorAll("svg")) {
    if (!svg.getBoundingClientRect().width || typeof svg.getBBox !== "function") continue;
    try {
      const box = svg.getBBox(),
        matrix = svg.getScreenCTM();
      if (!matrix || box.width <= 0 || box.height <= 0) continue;
      const points = [
        [box.x, box.y],
        [box.x + box.width, box.y + box.height]
      ].map(([x = 0, y = 0]) => ({
        x: matrix.a * x + matrix.c * y + matrix.e,
        y: matrix.b * x + matrix.d * y + matrix.f
      }));
      const first = points[0],
        last = points[1];
      if (first && last)
        boxes.push({
          left: Math.max(clip.left, first.x),
          right: Math.min(clip.right, last.x),
          top: Math.max(clip.top, first.y),
          bottom: Math.min(clip.bottom, last.y)
        });
    } catch {
      /* Engraving replacement can briefly detach an SVG; wait for its next mutation. */
    }
  }
  if (!boxes.length) return null;
  return {
    left: Math.min(...boxes.map((b) => b.left)),
    right: Math.max(...boxes.map((b) => b.right)),
    top: Math.min(...boxes.map((b) => b.top)),
    bottom: Math.max(...boxes.map((b) => b.bottom))
  };
}

/** Resize, score replacement, scrolling and browser zoom only: no animation or musical clock. */
export function useSongCourseStartPosition(
  open: boolean,
  ref: RefObject<HTMLElement | null>
): CourseStartPlacement | null {
  const [placement, setPlacement] = useState<CourseStartPlacement | null>(null);
  useLayoutEffect(() => {
    const lesson = ref.current?.closest(".song-course-lesson");
    const score = lesson?.querySelector<HTMLElement>(".song-course-lesson__score");
    const workspace = lesson?.closest(".workspace-main");
    const keyboard = workspace?.querySelector<HTMLElement>(".lanes");
    if (!open || !score || !keyboard) return;
    const measure = () => {
      const drawing = courseDrawingBounds(score);
      const visual = window.visualViewport;
      const view = {
        left: visual?.offsetLeft ?? 0,
        top: visual?.offsetTop ?? 0,
        right: (visual?.offsetLeft ?? 0) + (visual?.width ?? window.innerWidth),
        bottom: (visual?.offsetTop ?? 0) + (visual?.height ?? window.innerHeight)
      };
      const next = drawing
        ? songCourseStartPlacement(
            view,
            drawing,
            keyboard.getBoundingClientRect(),
            view.bottom - view.top < 500 ? 88 : 112
          )
        : null;
      setPlacement((old) =>
        old?.left === next?.left &&
        old?.top === next?.top &&
        old?.size === next?.size &&
        old?.overKeyboard === next?.overKeyboard
          ? old
          : next
      );
    };
    const resize = new ResizeObserver(measure);
    resize.observe(score);
    resize.observe(keyboard);
    const mutation = new MutationObserver(measure);
    mutation.observe(score, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["viewBox", "width", "height"]
    });
    window.addEventListener("resize", measure);
    document.addEventListener("scroll", measure, true);
    window.visualViewport?.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("scroll", measure);
    measure();
    return () => {
      resize.disconnect();
      mutation.disconnect();
      window.removeEventListener("resize", measure);
      document.removeEventListener("scroll", measure, true);
      window.visualViewport?.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("scroll", measure);
    };
  }, [open, ref]);
  return placement;
}
