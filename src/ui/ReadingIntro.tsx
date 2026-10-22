import { useEffect, useId, useMemo, useRef, useState } from "react";

import { useI18n } from "../app/useI18n";
import { READING_INTRO_NOTES, READING_INTRO_XML } from "../reading/introduction";
import { musicXmlWithNoteNames } from "../song/musicxml";
import { Staff } from "../staff/Staff";
import { GameDialog } from "./GameDialog";
import { ReadingIntroHand } from "./ReadingIntroHand";

const WHITE_STEPS = [0, 2, 4, 5, 7, 9, 11] as const;
const BLACK_BOUNDARIES = [1, 2, 4, 5, 6] as const;
const OVERVIEW_KEYS = Array.from({ length: 29 }, (_, index) => {
  const octave = 2 + Math.floor(index / 7);
  return { pitch: (octave + 1) * 12 + (WHITE_STEPS[index % 7] ?? 0), octave, index };
});
const OVERVIEW_BLACK_KEYS = Array.from({ length: 4 }, (_, octave) =>
  BLACK_BOUNDARIES.map((boundary) => octave * 7 + boundary)
).flat();
const presented = () => undefined;

/** A static illustration: choosing a note moves the score cursor, never song time. */
export function ReadingIntro({
  onClose,
  onStart
}: {
  readonly onClose: () => void;
  readonly onStart: () => void;
}) {
  const { t, locale } = useI18n();
  const [selectedPitch, setSelectedPitch] = useState(60);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [errorId, setErrorId] = useState<string | null>(null);
  const instanceId = useId();
  const presentationId = `${instanceId}:${locale}:${String(loadAttempt)}`;
  const activeId = useRef<string | null>(null);
  useEffect(() => {
    activeId.current = presentationId;
    return () => {
      activeId.current = null;
    };
  }, [presentationId]);
  // Selection must not generate another XML string or reload OSMD.
  const musicXml = useMemo(() => musicXmlWithNoteNames(READING_INTRO_XML, locale), [locale]);
  const selected =
    READING_INTRO_NOTES.find((note) => note.pitch === selectedPitch) ?? READING_INTRO_NOTES[0];
  const failed = errorId === presentationId;

  return (
    <GameDialog
      open
      title={t("Знакомство с пятью нотами")}
      className="reading-intro"
      onClose={onClose}
    >
      <section className="reading-intro-section">
        <h3>{t("1. Найдите до на пианино")}</h3>
        <p>
          {t(
            "До — белая клавиша слева от двух чёрных. Такие группы повторяются по всей клавиатуре."
          )}
        </p>
        <div
          className="reading-intro-overview"
          role="img"
          aria-label={t("Обзор клавиатуры от C2 до C6; C4 выделена")}
        >
          <div className="reading-intro-white-row">
            {OVERVIEW_KEYS.map(({ pitch, octave, index }) => (
              <span
                key={pitch}
                className={`reading-intro-overview-key${pitch === 60 ? " is-selected" : ""}`}
              >
                {index % 7 === 0 && <strong>{t("C{number}", { number: octave })}</strong>}
              </span>
            ))}
          </div>
          {OVERVIEW_BLACK_KEYS.map((boundary) => (
            <span
              key={boundary}
              className="reading-intro-black-key"
              style={{ left: `${String((boundary / 29) * 100)}%` }}
            />
          ))}
        </div>
        <p className="reading-intro-explanation">
          {t(
            "В этом приложении C4 — до первой октавы. C обозначает до, а 4 — октаву, не номер пальца."
          )}
        </p>
      </section>

      <section className="reading-intro-section">
        <h3>{t("2. Свяжите ноту с клавишей")}</h3>
        <p>{t("Выберите название или белую клавишу. На стане выделится та же нота.")}</p>
        <div
          className="reading-intro-note-buttons"
          role="group"
          aria-label={t("Выбор ноты для знакомства")}
        >
          {READING_INTRO_NOTES.map((note) => (
            <button
              type="button"
              key={note.pitch}
              className="game-button"
              aria-pressed={selectedPitch === note.pitch}
              onClick={() => {
                setSelectedPitch(note.pitch);
              }}
            >
              <strong>{t(note.name)}</strong>
              <span>{note.notation}</span>
            </button>
          ))}
        </div>
        <div
          className="reading-intro-staff"
          role="group"
          aria-label={t("Пять нот на скрипичном стане")}
        >
          <Staff
            key={presentationId}
            musicXml={musicXml}
            beat={selected.beat}
            zoom={1}
            noteColor="#f2f5ff"
            scoreColor="#f2f5ff"
            singleLine={false}
            follow={false}
            fingers={false}
            fingerColors="mono"
            breaksFromScore={false}
            shareGeometry={false}
            presentation={{
              id: presentationId,
              onPresented: presented,
              onError: (id) => {
                if (activeId.current === id) setErrorId(id);
              }
            }}
          />
          {failed && (
            <div className="reading-intro-staff-error" role="alert">
              <p>{t("Не удалось показать ноты. Попробуйте загрузить стан снова.")}</p>
              <button
                type="button"
                className="game-button"
                onClick={() => {
                  setLoadAttempt((value) => value + 1);
                }}
              >
                {t("Повторить загрузку стана")}
              </button>
            </div>
          )}
        </div>
        <div
          className="reading-intro-keyboard"
          role="group"
          aria-label={t("Увеличенная октава C4–B4")}
        >
          <div className="reading-intro-white-row">
            {READING_INTRO_NOTES.map((note) => (
              <button
                key={note.pitch}
                type="button"
                className={`reading-intro-piano-key${selectedPitch === note.pitch ? " is-selected" : ""}`}
                aria-label={t("Клавиша {note}, {notation}", {
                  note: t(note.name),
                  notation: note.notation
                })}
                aria-pressed={selectedPitch === note.pitch}
                onClick={() => {
                  setSelectedPitch(note.pitch);
                }}
              >
                <span>{t(note.name)}</span>
                <small>{note.notation}</small>
              </button>
            ))}
            {["ля", "си"].map((name) => (
              <span key={name} className="reading-intro-piano-key reading-intro-piano-key--context">
                <span>{t(name)}</span>
              </span>
            ))}
          </div>
          {BLACK_BOUNDARIES.map((boundary) => (
            <span
              key={boundary}
              className="reading-intro-black-key"
              style={{ left: `${String((boundary / 7) * 100)}%` }}
            />
          ))}
        </div>
        <div className="reading-intro-hand-section">
          <h3>{t("Пять пальцев правой руки")}</h3>
          <p>
            {t(
              "Большой палец — на до, указательный — на ре, средний — на ми, безымянный — на фа, мизинец — на соль. Выберите подпись пальца, чтобы увидеть его ноту."
            )}
          </p>
          <ReadingIntroHand selectedPitch={selectedPitch} onSelect={setSelectedPitch} />
        </div>
        <div className="reading-intro-detail" aria-live="polite" aria-atomic="true">
          <strong>
            {t("Выбрана нота: {note} ({notation})", {
              note: t(selected.name),
              notation: selected.notation
            })}
          </strong>
          <p>{t(selected.position)}</p>
          <p>
            {t("Правая рука: {finger} — палец {number}.", {
              finger: t(selected.fingerName),
              number: selected.finger
            })}
          </p>
        </div>
      </section>

      <section className="reading-intro-section">
        <h3>{t("3. Попробуйте читать ноты")}</h3>
        <p>
          {t(
            "Названий нот семь: до, ре, ми, фа, соль, ля, си. Начнём с пяти — по одной на каждый палец, без перемещения руки."
          )}
        </p>
        <p>
          {t(
            "Сначала смотрите на ноту на стане. Нажмите соответствующую клавишу. Ошибка не переводит к следующей ноте."
          )}
        </p>
        <p>{t("Нет пианино? В упражнении нажимайте экранные клавиши мышью или касанием.")}</p>
        <p className="reading-muted">
          {t(
            "Рекомендуемые пальцы помогают поставить руку. MIDI не определяет, каким пальцем вы играете."
          )}
        </p>
        <button type="button" className="game-button reading-intro-start" onClick={onStart}>
          {t("Начать читать ноты")}
        </button>
      </section>
    </GameDialog>
  );
}
