import type { Container, FederatedPointerEvent } from "pixi.js";

/** Pixi receives document-wide moves; only a gesture started on this canvas may play keys. */
export function bindKeyboardPointer(
  stage: Container,
  canvas: HTMLCanvasElement,
  play: (event: FederatedPointerEvent) => void,
  release: () => void
): () => void {
  let pointerId: number | undefined;
  const stop = () => {
    pointerId = undefined;
    release();
  };
  const isCanvas = (event: FederatedPointerEvent) =>
    document.elementFromPoint(event.clientX, event.clientY) === canvas;
  const down = (event: FederatedPointerEvent) => {
    if (!isCanvas(event) || (event.buttons & 1) === 0) return;
    pointerId = event.pointerId;
    play(event);
  };
  const move = (event: FederatedPointerEvent) => {
    if (event.pointerId !== pointerId) return;
    if (!isCanvas(event) || (event.buttons & 1) === 0) {
      stop();
      return;
    }
    play(event);
  };
  const up = (event: FederatedPointerEvent) => {
    if (event.pointerId === pointerId) stop();
  };
  const cancel = (event: PointerEvent) => {
    if (event.pointerId === pointerId) stop();
  };
  // Alt+Tab or a hidden tab never sends the pointer up: a held key would sound on.
  const leave = () => {
    if (pointerId !== undefined && (document.hidden || !document.hasFocus())) stop();
  };
  stage.on("pointerdown", down);
  stage.on("pointermove", move);
  stage.on("pointerup", up);
  stage.on("pointerupoutside", up);
  window.addEventListener("pointercancel", cancel, true);
  window.addEventListener("blur", leave);
  document.addEventListener("visibilitychange", leave);
  return () => {
    stage.off("pointerdown", down);
    stage.off("pointermove", move);
    stage.off("pointerup", up);
    stage.off("pointerupoutside", up);
    window.removeEventListener("pointercancel", cancel, true);
    window.removeEventListener("blur", leave);
    document.removeEventListener("visibilitychange", leave);
    stop();
  };
}
