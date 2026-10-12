import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useI18n } from "../app/useI18n";
import { musicXmlWithNoteNames } from "../song/musicxml";
import { Staff } from "../staff/Staff";
import { GameDialog } from "./GameDialog";

const NOTES = [
  {
    pitch: 48,
    name: "до",
    notation: "C3",
    finger: 5,
    fingerName: "Мизинец",
    position: "Басовое до — между второй и третьей линиями снизу."
  },
  {
    pitch: 50,
    name: "ре",
    notation: "D3",
    finger: 4,
    fingerName: "Безымянный палец",
    position: "Басовое ре — на третьей линии снизу."
  },
  {
    pitch: 52,
    name: "ми",
    notation: "E3",
    finger: 3,
    fingerName: "Средний палец",
    position: "Басовое ми — между третьей и четвёртой линиями снизу."
  },
  {
    pitch: 53,
    name: "фа",
    notation: "F3",
    finger: 2,
    fingerName: "Указательный палец",
    position: "Басовое фа — на четвёртой линии снизу."
  },
  {
    pitch: 55,
    name: "соль",
    notation: "G3",
    finger: 1,
    fingerName: "Большой палец",
    position: "Басовая соль — между четвёртой и пятой линиями снизу."
  }
] as const;
const STEPS = ["C", "D", "E", "F", "G"] as const;
// A fixed illustration; selection changes its cursor, never practice time or XML.
const INTRO_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><part-list><score-part id="P1"><part-name/></score-part></part-list>
<part id="P1"><measure number="1"><attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><staves>1</staves><clef><sign>F</sign><line>4</line></clef></attributes>
${STEPS.map((step, index) => `<note id="bass-intro-${step}3"><pitch><step>${step}</step><octave>3</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>${index === 3 ? '</measure><measure number="2" implicit="yes">' : ""}`).join("")}</measure></part></score-partwise>`;
const BLACK_BOUNDARIES = [1, 2, 4, 5, 6] as const;
const presented = () => undefined;

export interface BassReadingKeyBinding {
  readonly pitch: number;
  readonly label: string;
}

export function BassReadingIntro({
  onClose,
  onStart,
  keyBindings
}: {
  readonly onClose: () => void;
  readonly onStart: () => void;
  readonly keyBindings: readonly BassReadingKeyBinding[];
}) {
  const { t, locale } = useI18n();
  const [selectedPitch, setSelectedPitch] = useState<number>(48);
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
  const musicXml = useMemo(() => musicXmlWithNoteNames(INTRO_XML, locale), [locale]);
  const selectedIndex = Math.max(
    0,
    NOTES.findIndex((note) => note.pitch === selectedPitch)
  );
  const selected = NOTES[selectedIndex] ?? NOTES[0];

  return (
    <GameDialog
      open
      title={t("Знакомство с левой рукой")}
      className="reading-intro"
      onClose={onClose}
    >
      <section className="reading-intro-section">
        <h3>{t("Найдите до малой октавы — C3")}</h3>
        <p>
          {t(
            "До — белая клавиша слева от двух чёрных. Такие группы повторяются по всей клавиатуре."
          )}
        </p>
        <p>{t("C3 — до малой октавы, на октаву ниже C4. Число 3 означает октаву, а не палец.")}</p>
        <h3>{t("Свяжите басовую ноту с клавишей")}</h3>
        <p>{t("Выберите название или белую клавишу. На стане выделится та же нота.")}</p>
        <div
          className="reading-intro-note-buttons"
          role="group"
          aria-label={t("Выбор басовой ноты для знакомства")}
        >
          {NOTES.map((note) => (
            <button
              type="button"
              className="game-button"
              key={note.pitch}
              aria-pressed={note.pitch === selectedPitch}
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
          aria-label={t("Пять нот на басовом стане")}
        >
          <Staff
            key={presentationId}
            musicXml={musicXml}
            beat={selectedIndex}
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
          {errorId === presentationId && (
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
          aria-label={t("Увеличенная октава C3–B3")}
        >
          <div className="reading-intro-white-row">
            {NOTES.map((note) => (
              <button
                key={note.pitch}
                type="button"
                className={`reading-intro-piano-key${note.pitch === selectedPitch ? " is-selected" : ""}`}
                aria-label={t("Клавиша {note}, {notation}", {
                  note: t(note.name),
                  notation: note.notation
                })}
                aria-pressed={note.pitch === selectedPitch}
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
        <h3>{t("Пять пальцев левой руки")}</h3>
        <p>
          {t(
            "Мизинец — на до, безымянный — на ре, средний — на ми, указательный — на фа, большой — на соль. Пальцы идут от 5 к 1."
          )}
        </p>
        <div
          className="reading-intro-note-buttons"
          role="group"
          aria-label={t("Выбор пальца левой руки для знакомства")}
        >
          {NOTES.map((note) => (
            <button
              type="button"
              className="game-button"
              key={note.pitch}
              aria-pressed={note.pitch === selectedPitch}
              onClick={() => {
                setSelectedPitch(note.pitch);
              }}
            >
              {t(note.fingerName)} · {note.finger}
            </button>
          ))}
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
            {t("Левая рука: {finger} — палец {number}.", {
              finger: t(selected.fingerName),
              number: selected.finger
            })}
          </p>
        </div>
        <p className="reading-muted">
          {t(
            "Приложение проверяет высоту ноты, но не определяет, какой рукой и пальцем вы играете."
          )}
        </p>
      </section>
      <section className="reading-intro-section">
        <h3>{t("Ввод с компьютерной клавиатуры")}</h3>
        <p>{t("Базовые назначения для C3–G3 без сдвига октавы и модификаторов:")}</p>
        <ul>
          {NOTES.map((note) => {
            const labels = keyBindings
              .filter((binding) => binding.pitch === note.pitch)
              .map((binding) => binding.label);
            return (
              <li key={note.pitch}>
                {note.notation}:{" "}
                {labels.length > 0 ? labels.join(", ") : t("Нет назначения для этой басовой ноты")}
              </li>
            );
          })}
        </ul>
        <p>
          {t(
            "Здесь показаны сохранённые базовые назначения. Сдвиг октавы и Shift/Alt могут изменить сыгранную высоту."
          )}
        </p>
        <p>
          {t(
            "Раскладка находится в «Настройки» → «Ввод с ПК». Shift повышает ноту на полутон, Alt понижает. Курс не меняет ваши назначения."
          )}
        </p>
        <p>{t("Нет пианино? В упражнении нажимайте экранные клавиши мышью или касанием.")}</p>
        <p>
          {t(
            "Сначала смотрите на ноту на стане. Нажмите соответствующую клавишу. Ошибка не переводит к следующей ноте."
          )}
        </p>
        <button type="button" className="game-button reading-intro-start" onClick={onStart}>
          {t("Начать басовое чтение")}
        </button>
      </section>
    </GameDialog>
  );
}
