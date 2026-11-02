import type { Container } from "./scene";
import { type FederatedPointerEvent } from "./scene";
import type { Rectangle } from "./math";
export function bindPointerEvents(
  canvas: HTMLCanvasElement,
  stage: Container,
  screen: Rectangle
): () => void {
  const oldTouchAction = canvas.style.touchAction;
  canvas.style.touchAction = "none";
  const captured = new Map<number, Container>();
  const dispatch = (node: Container, name: string, event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect(),
      x = ((event.clientX - rect.left) * screen.width) / Math.max(1, rect.width),
      y = ((event.clientY - rect.top) * screen.height) / Math.max(1, rect.height);
    const propagation = { stopped: false };
    const value: FederatedPointerEvent = {
      target: node,
      pointerType: event.pointerType,
      timeStamp: event.timeStamp,
      x,
      y,
      global: { x, y },
      clientX: event.clientX,
      clientY: event.clientY,
      pointerId: event.pointerId,
      buttons: event.buttons,
      nativeEvent: event,
      stopPropagation: () => {
        propagation.stopped = true;
      },
      preventDefault: () => {
        event.preventDefault();
      }
    };
    for (let current: Container | null = node; current; current = current.parent) {
      current.emit(name, value);
      if (propagation.stopped) break;
    }
  };
  const hit = (node: Container, x: number, y: number): Container | undefined => {
    if (!node.visible || !node.renderable || node.destroyed || node.eventMode === "none") return;
    const children = node.sortableChildren
      ? [...node.children].sort((a, b) => a.zIndex - b.zIndex)
      : node.children;
    for (let i = children.length - 1; i >= 0; i--) {
      const child = children[i];
      if (!child) continue;
      const found = hit(child, x, y);
      if (found) return found;
    }
    if (node.eventMode !== "static" && !node.listeners.size) return;
    const local = node.toLocal({ x, y }),
      bounds = node.hitArea ?? node.getLocalBounds();
    return bounds.contains(local.x, local.y) ? node : undefined;
  };
  const target = (e: PointerEvent) => {
    const b = canvas.getBoundingClientRect();
    return hit(
      stage,
      ((e.clientX - b.left) * screen.width) / Math.max(1, b.width),
      ((e.clientY - b.top) * screen.height) / Math.max(1, b.height)
    );
  };
  const down = (e: PointerEvent) => {
    const node = target(e);
    if (!node) return;
    e.preventDefault();
    captured.set(e.pointerId, node);
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* Detached canvas cannot capture. */
    }
    dispatch(node, "pointerdown", e);
  };
  const move = (e: PointerEvent) => {
    const node = captured.get(e.pointerId) ?? target(e);
    if (node) dispatch(node, "pointermove", e);
    canvas.style.cursor = node?.cursor ?? "";
  };
  const up = (e: PointerEvent) => {
    const node = captured.get(e.pointerId);
    if (!node) return;
    captured.delete(e.pointerId);
    dispatch(node, target(e) === node ? "pointerup" : "pointerupoutside", e);
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
  };
  const cancel = (e: PointerEvent) => {
    const node = captured.get(e.pointerId);
    if (!node) return;
    captured.delete(e.pointerId);
    dispatch(node, "pointerupoutside", e);
    dispatch(node, "pointercancel", e);
  };
  const blur = () => {
    for (const [pointerId, node] of captured) {
      const e = new PointerEvent("pointercancel", { pointerId });
      dispatch(node, "pointerupoutside", e);
      dispatch(node, "pointercancel", e);
    }
    captured.clear();
  };
  canvas.addEventListener("pointerdown", down);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", cancel);
  canvas.addEventListener("lostpointercapture", cancel);
  window.addEventListener("blur", blur);
  return () => {
    blur();
    canvas.style.touchAction = oldTouchAction;
    canvas.removeEventListener("pointerdown", down);
    canvas.removeEventListener("pointermove", move);
    canvas.removeEventListener("pointerup", up);
    canvas.removeEventListener("pointercancel", cancel);
    canvas.removeEventListener("lostpointercapture", cancel);
    window.removeEventListener("blur", blur);
  };
}
