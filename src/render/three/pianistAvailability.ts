import type { KeyStyle } from "../KeyboardLayer";
import { PIANIST_AVAILABLE } from "./pianistModel";

/** The public body is available in its native path; the optional private model keeps its modes. */
export function pianistAvailable(keyStyle: KeyStyle): boolean {
  return PIANIST_AVAILABLE || keyStyle === "3d";
}
