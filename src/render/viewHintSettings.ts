import type { FallingNoteNames } from "./bakeLabels";
import type { KeyboardLayer } from "./KeyboardLayer";
import type { NotesLayer } from "./NotesLayer";

/** Cache choices made before asynchronous mount without owning either renderer layer. */
export class ViewHintSettings {
  private names: FallingNoteNames | undefined;
  private keyboardFingers = true;
  private fallingFingers = true;

  constructor(
    private readonly layers: () => {
      readonly keyboard: KeyboardLayer | undefined;
      readonly notes: NotesLayer | undefined;
    }
  ) {}

  readonly setNoteNames = (names: FallingNoteNames | undefined): void => {
    this.names = names;
    this.layers().notes?.setNoteNames(names);
  };

  readonly setFingerLabels = (keyboard: boolean, falling: boolean): void => {
    this.keyboardFingers = keyboard;
    this.fallingFingers = falling;
    const layers = this.layers();
    layers.keyboard?.setFingersVisible(keyboard);
    layers.notes?.setFingersVisible(falling);
  };

  applyNotes(notes: NotesLayer): void {
    notes.setNoteNames(this.names);
    notes.setFingersVisible(this.fallingFingers);
  }

  applyKeyboard(keyboard: KeyboardLayer): void {
    keyboard.setFingersVisible(this.keyboardFingers);
  }
}
