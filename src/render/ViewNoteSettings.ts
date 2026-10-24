import type { FallingNoteStyle } from "./fallingNoteStyle";
import { DEFAULT_PROJECTION_PARAMETERS, type ProjectionParameters } from "./stylizedProjection";

interface NoteSettingsTarget {
  setFallingNoteStyle(style: FallingNoteStyle): void;
  setNoteProjection(value: ProjectionParameters): void;
}

/** Retains preference changes made before the asynchronous view has mounted. */
export class ViewNoteSettings {
  private style: FallingNoteStyle = "filled";
  private projection: ProjectionParameters = DEFAULT_PROJECTION_PARAMETERS;

  constructor(private readonly target: () => NoteSettingsTarget | undefined) {}

  readonly setStyle = (style: FallingNoteStyle): void => {
    this.style = style;
    this.target()?.setFallingNoteStyle(style);
  };

  readonly setProjection = (value: ProjectionParameters): void => {
    this.projection = value;
    this.target()?.setNoteProjection(value);
  };

  apply(): void {
    this.target()?.setFallingNoteStyle(this.style);
    this.target()?.setNoteProjection(this.projection);
  }
}
