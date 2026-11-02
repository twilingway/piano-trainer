import { useI18n } from "../app/useI18n";
import { musicCourseNoteLabel } from "./MusicCourseSettings";
import type { MusicCourseResultNotes } from "./musicCourseTypes";

/** Displays the recorded pitches and beat positions without deriving a second score. */
export function MusicCourseNotes({ expectedNotes, playedNotes }: MusicCourseResultNotes) {
  const { t, formatNumber } = useI18n();
  return (
    <div className="music-course-notes">
      {[
        { kind: "expected", labelKey: "Ноты эталона", values: expectedNotes },
        { kind: "played", labelKey: "Сыгранные ноты", values: playedNotes }
      ].map(({ kind, labelKey, values }) => (
        <section key={kind} data-notes={kind} aria-label={t(labelKey)}>
          <p>{t(labelKey)}</p>
          {values.length === 0 ? (
            <p>{t(kind === "played" ? "Сыгранных нот нет." : "В эталоне нет нот.")}</p>
          ) : (
            <ol>
              {values.map((note, index) => (
                <li key={index}>
                  {t("Нота {note}: начало {start}, удержание {duration} доли", {
                    note: musicCourseNoteLabel(note.pitch, t),
                    start: formatNumber(note.startBeat, { maximumFractionDigits: 3 }),
                    duration: formatNumber(note.durationBeats, { maximumFractionDigits: 3 })
                  })}
                </li>
              ))}
            </ol>
          )}
        </section>
      ))}
    </div>
  );
}
