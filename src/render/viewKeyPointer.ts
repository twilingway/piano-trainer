import type { FederatedPointerEvent } from "pixi.js";
import { KeyboardLayer } from "./KeyboardLayer";
import type { ComputerKeyboardLayer, KeysLayer } from "./ComputerKeyboardLayer";
import type { KeyPointer } from "./pointerKeys";

/** Pixi pools its event; preserve the browser's physical timestamp. */
export function pointerMetadata(event: KeyPointer): KeyPointer {
  const native =
    "nativeEvent" in event ? (event.nativeEvent as PointerEvent | undefined) : undefined;
  return {
    pointerId: event.pointerId,
    pointerType: event.pointerType,
    timeStamp: native?.timeStamp ?? event.timeStamp
  };
}

export function playViewKeyPointer(
  event: FederatedPointerEvent,
  point: { readonly x: number; readonly y: number; readonly pitch?: number } | undefined,
  keyboard: KeyboardLayer | undefined,
  computer: ComputerKeyboardLayer | undefined
): void {
  const layer = computer ?? keyboard;
  const pitch =
    point && ((!computer ? point.pitch : undefined) ?? layer?.pitchAt(point.x, point.y));
  if (computer) {
    if (pitch !== undefined) computer.pressWithMouse(pitch);
  } else if (pitch !== undefined) keyboard?.pressPointer(pitch, pointerMetadata(event));
  else keyboard?.releasePointer(pointerMetadata(event));
}

export function releaseViewKeyPointer(
  event: KeyPointer | undefined,
  cancelled: boolean | undefined,
  layer: KeysLayer | undefined,
  keyboard: KeyboardLayer | undefined,
  cancel: ((resetAll?: boolean) => void) | undefined
): void {
  if (cancelled) cancel?.(event === undefined);
  if (event && layer === keyboard) keyboard?.releasePointer(pointerMetadata(event));
  else layer?.releaseMouse();
}

export function viewKeyRelease(view: {
  readonly keysLayer: KeysLayer | undefined;
  readonly onInputCancel: ((resetAll?: boolean) => void) | undefined;
}): (event?: KeyPointer, cancelled?: boolean) => void {
  return (event, cancelled) => {
    const layer = view.keysLayer;
    const keyboard = layer instanceof KeyboardLayer ? layer : undefined;
    releaseViewKeyPointer(event, cancelled, layer, keyboard, view.onInputCancel);
  };
}
