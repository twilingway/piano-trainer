import type { KeyStyle } from "./KeyboardLayer";

export interface FlatEffectOptions {
  readonly burning: boolean;
  readonly presses: boolean;
}
export const ALL_FLAT_EFFECTS: FlatEffectOptions = { burning: true, presses: true };

/** Flat preferences never change the accepted full 3D effects. */
export class FlatEffectSettings {
  private options: FlatEffectOptions = ALL_FLAT_EFFECTS;
  set(burning: boolean, presses: boolean): void {
    this.options = { burning, presses };
  }
  forStyle(style: KeyStyle): FlatEffectOptions {
    return style === "classic" || style === "arcade" ? this.options : ALL_FLAT_EFFECTS;
  }
}
