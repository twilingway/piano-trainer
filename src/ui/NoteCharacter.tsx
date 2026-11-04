import { CLAY_NOTES, clayStepForPitch, type ClayNoteStep } from "../song/clayNotes";
import { useI18n } from "../app/useI18n";
const art = import.meta.glob<string>("./lesson-art/notes/*.webp", {
  eager: true,
  query: "?url",
  import: "default"
});
export function NoteCharacter({
  step,
  direction = "up",
  named = false
}: {
  readonly step: ClayNoteStep;
  readonly direction?: "up" | "down";
  readonly named?: boolean;
}) {
  const { t } = useI18n();
  const note = CLAY_NOTES[step];
  return (
    <span className="note-character" style={{ color: note.color }}>
      <img
        src={art[`./lesson-art/notes/${note.asset}-${direction}.webp`]}
        alt=""
        aria-hidden="true"
        draggable={false}
      />
      {named && <strong>{t(note.name)}</strong>}
    </span>
  );
}
export function SelectedNoteCharacter({
  pitch,
  bass = false
}: {
  readonly pitch: number;
  readonly bass?: boolean;
}) {
  const step = clayStepForPitch(pitch);
  return step ? (
    <NoteCharacter step={step} direction={bass && pitch >= 50 ? "down" : "up"} named />
  ) : null;
}
export function NoteCharacterFamily() {
  const { t } = useI18n();
  return (
    <details className="note-character-family">
      <summary>{t("Знакомьтесь: семь нот")}</summary>
      <p>
        {t("У каждой ноты свой цвет. Ножка может смотреть вверх или вниз — имя ноты не меняется.")}
      </p>
      <div className="note-character-family__notes">
        {(Object.keys(CLAY_NOTES) as ClayNoteStep[]).map((step, index) => (
          <NoteCharacter key={step} step={step} direction={index >= 4 ? "down" : "up"} named />
        ))}
      </div>
    </details>
  );
}
