import type { KeyStyle } from "../KeyboardLayer";
import type { HandStyle } from "../handRenderCatalog";
import { PIANIST_AVAILABLE } from "./pianistModel";

/** The public body is available in its native path; the optional private model keeps its modes. */
export function pianistAvailable(keyStyle: KeyStyle, handStyle: HandStyle): boolean {
  return PIANIST_AVAILABLE || (keyStyle === "3d" && handStyle === "rendered");
}
