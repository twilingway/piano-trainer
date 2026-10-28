import type { FallingNoteStyle } from "./fallingNoteStyle";

interface NoteSettingsTarget {
  setFallingNoteStyle(style: FallingNoteStyle): void;
}

/** Retains preference changes made before the asynchronous view has mounted. */
export class ViewNoteSettings {
  private style: FallingNoteStyle = "filled";

  constructor(private readonly target: () => NoteSettingsTarget | undefined) {}

  readonly setStyle = (style: FallingNoteStyle): void => {
    this.style = style;
    this.target()?.setFallingNoteStyle(style);
  };

  apply(): void {
    this.target()?.setFallingNoteStyle(this.style);
  }
}
