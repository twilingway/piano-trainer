export interface FlatEffectOptions {
  readonly burning: boolean;
  readonly presses: boolean;
  readonly musicalNotes: boolean;
}
export const ALL_FLAT_EFFECTS: FlatEffectOptions = {
  burning: true,
  presses: true,
  musicalNotes: true
};

/** Independent animation preferences shared by all keyboard views. */
export class FlatEffectSettings {
  private options: FlatEffectOptions = ALL_FLAT_EFFECTS;
  set(burning: boolean, presses: boolean, musicalNotes = true): void {
    this.options = { burning, presses, musicalNotes };
  }
  current(zoneVisible = true): FlatEffectOptions {
    return zoneVisible ? this.options : { burning: false, presses: false, musicalNotes: false };
  }
}
