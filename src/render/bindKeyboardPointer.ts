import type { Container, FederatedPointerEvent } from "./flatThree";
import type { KeyPointer } from "./pointerKeys";

/** Only pointers started on this canvas may play; each owns its independent gesture. */
export function bindKeyboardPointer(
  stage: Container,
  canvas: HTMLCanvasElement,
  play: (event: FederatedPointerEvent) => void,
  release: (event?: KeyPointer, cancelled?: boolean) => void
): () => void {
  const pointers = new Set<number>();
  let disposed = false;
  const stop = (event: KeyPointer, cancelled = false) => {
    if (!pointers.delete(event.pointerId)) return;
    release(event, cancelled);
  };
  const isCanvas = (event: FederatedPointerEvent) =>
    document.elementFromPoint(event.clientX, event.clientY) === canvas;
  const down = (event: FederatedPointerEvent) => {
    if (!isCanvas(event) || (event.buttons & 1) === 0) return;
    pointers.add(event.pointerId);
    play(event);
  };
  const move = (event: FederatedPointerEvent) => {
    if (!pointers.has(event.pointerId)) return;
    if (!isCanvas(event) || (event.buttons & 1) === 0) {
      stop(event, true);
      return;
    }
    play(event);
  };
  const up = (event: FederatedPointerEvent) => {
    stop(event);
  };
  const cancel = (event: PointerEvent) => {
    stop(event, true);
  };
  const clear = () => {
    if (pointers.size === 0) return;
    pointers.clear();
    release(undefined, true);
  };
  const leave = () => {
    if (document.hidden || !document.hasFocus()) clear();
  };
  stage.on("pointerdown", down);
  stage.on("pointermove", move);
  stage.on("pointerup", up);
  stage.on("pointerupoutside", up);
  window.addEventListener("pointercancel", cancel, true);
  canvas.addEventListener("lostpointercapture", cancel);
  window.addEventListener("blur", leave);
  document.addEventListener("visibilitychange", leave);
  return () => {
    if (disposed) return;
    disposed = true;
    stage.off("pointerdown", down);
    stage.off("pointermove", move);
    stage.off("pointerup", up);
    stage.off("pointerupoutside", up);
    window.removeEventListener("pointercancel", cancel, true);
    canvas.removeEventListener("lostpointercapture", cancel);
    window.removeEventListener("blur", leave);
    document.removeEventListener("visibilitychange", leave);
    clear();
  };
}
