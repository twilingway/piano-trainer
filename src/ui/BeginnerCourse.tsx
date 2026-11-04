import { useEffect, useId, useMemo, useRef, useState } from "react";
import { beginnerStage, type BeginnerSelection } from "../beginner/catalog";
import type { ReadingNoteResult } from "../reading/types";
import { generateBeginnerExercise } from "../beginner/generator";
import { readingPromptXml } from "../reading/prompt";
import { useI18n } from "../app/useI18n";
import { SelectedNoteCharacter } from "./NoteCharacter";
import { GameDialog } from "./GameDialog";
import { Staff } from "../staff/Staff";
import { LessonSlot } from "./LessonSlots";
import assistant from "./lesson-art/assistant.webp";

export function BeginnerIntro({
  selection,
  onStart,
  onClose
}: {
  readonly selection: BeginnerSelection;
  readonly onStart: () => void;
  readonly onClose: () => void;
}) {
  const { t } = useI18n();
  const instanceId = useId();
  const [retry, setRetry] = useState(0);
  const [errorId, setErrorId] = useState<string | null>(null);
  const [presentedId, setPresentedId] = useState<string | null>(null);
  const id = `${instanceId}:${selection.stageId}:${String(selection.seed)}:${String(retry)}`;
  const activeId = useRef<string | null>(null);
  useEffect(() => {
    activeId.current = id;
    return () => {
      activeId.current = null;
    };
  }, [id]);
  const failed = errorId === id;
  const stage = beginnerStage(selection.stageId);
  const pitch = stage.pitches.at(-1) ?? 60;
  const xml = useMemo(
    () => readingPromptXml(generateBeginnerExercise(selection).musicXml, "notes", 0).musicXml,
    [selection]
  );
  const base = stage.hand === "right" ? 60 : 48;
  return (
    <GameDialog open title={t(stage.title)} onClose={onClose} className="beginner-intro">
      <div className="beginner-intro__coach">
        <img src={assistant} alt="" />
        <p>
          {t(
            stage.hand === "right"
              ? "Начинаем правой рукой: до первой октавы — C4."
              : "Теперь левая рука: до малой октавы — C3."
          )}
        </p>
      </div>
      <p>{t("До — белая клавиша слева от двух чёрных. Новая клавиша выделена на схеме.")}</p>
      <div
        className="beginner-key-map"
        role="img"
        aria-label={t("Расположение новой ноты на клавиатуре")}
      >
        {[0, 2, 4, 5, 7, 9, 11, 12].map((offset, i) => (
          <span
            key={offset}
            className={`beginner-key-map__white${base + offset === pitch ? " is-current" : ""}${stage.pitches.includes(base + offset) ? " is-known" : ""}`}
          >
            {base + offset === pitch && <span>●</span>}
            {[0, 1, 3, 4, 5].includes(i) && <i />}
          </span>
        ))}
      </div>
      <div className="beginner-intro__note">
        <SelectedNoteCharacter pitch={pitch} bass={stage.hand === "left"} />
        <Staff
          musicXml={xml}
          beat={0}
          zoom={1}
          noteColor="#dff5ff"
          scoreColor="#aacbd8"
          singleLine
          follow={false}
          fingers={false}
          fingerColors="mono"
          breaksFromScore={false}
          course
          illustration
          pitchColors
          presentation={{
            id,
            onPresented: (shownId) => {
              if (activeId.current === shownId) setPresentedId(shownId);
            },
            onError: (shownId) => {
              if (activeId.current === shownId) setErrorId(shownId);
            }
          }}
        />
      </div>
      {stage.count > 5 && (
        <p>
          {t(
            "Нот больше пяти: переносите руку свободно. Номер пальца в подсказке рассчитан для этой фразы, растягивать ладонь не нужно."
          )}
        </p>
      )}
      <p>
        {t("Сначала сыграем с цветом и именем, затем попробуем самостоятельно. Спешить не нужно.")}
      </p>
      {failed && (
        <p role="alert">
          {t("Не удалось показать ноты.")}{" "}
          <button
            className="game-button"
            onClick={() => {
              setRetry((value) => value + 1);
            }}
          >
            {t("Повторить показ нот")}
          </button>
        </p>
      )}
      <button className="game-button" onClick={onStart} disabled={failed || presentedId !== id}>
        {t("Сыграть с помощником")}
      </button>
    </GameDialog>
  );
}

export function BeginnerPracticePanel({
  selection,
  answers,
  pitch,
  helped,
  ready,
  completed,
  renderError,
  storageError,
  onRetry,
  onRetrySave,
  onHint,
  onRepeat,
  onExit,
  onIndependent,
  onNext
}: {
  readonly selection: BeginnerSelection;
  readonly answers: readonly ReadingNoteResult[];
  readonly pitch: number | undefined;
  readonly helped: boolean;
  readonly ready: boolean;
  readonly completed: boolean;
  readonly renderError: boolean;
  readonly storageError: boolean;
  readonly onRetry: () => void;
  readonly onRetrySave: () => void;
  readonly onHint: () => void;
  readonly onRepeat: () => void;
  readonly onExit: () => void;
  readonly onIndependent: () => void;
  readonly onNext: () => void;
}) {
  const { t } = useI18n();
  const stage = beginnerStage(selection.stageId);
  const independent = selection.phase === "independent";
  return (
    <>
      <LessonSlot name="exit">
        <button className="game-button" onClick={onExit}>
          {t("Выйти из маленького шага")}
        </button>
      </LessonSlot>
      <LessonSlot name="counter">
        <span>
          {t("Ответов: {done} из {total}", { done: answers.length, total: stage.targetCount })}
        </span>
      </LessonSlot>
      <LessonSlot name="hint">
        {!independent && !completed && (
          <div className="beginner-help">
            {helped && pitch !== undefined && (
              <SelectedNoteCharacter pitch={pitch} bass={stage.hand === "left"} />
            )}
            <button className="game-button" onClick={onHint} disabled={!ready}>
              {t("Показать клавишу и палец")}
            </button>
          </div>
        )}
      </LessonSlot>
      <LessonSlot name="feedback">
        <div className="beginner-feedback">
          <p>
            {t(
              independent
                ? "Самостоятельно: без имени и цвета. Ошиблись — попробуйте ещё раз."
                : "С помощником: цвет и имя — подсказки. Играйте по порядку, без спешки."
            )}
          </p>
          {storageError && (
            <p role="alert">
              {t("Не удалось сохранить маленькие шаги.")}{" "}
              <button className="game-button" onClick={onRetrySave}>
                {t("Повторить сохранение шагов")}
              </button>
            </p>
          )}
          {renderError && (
            <p role="alert">
              {t("Не удалось показать ноты.")}{" "}
              <button className="game-button" onClick={onRetry}>
                {t("Повторить показ нот")}
              </button>
            </p>
          )}
          {completed && (
            <p role="status">
              {t(
                independent
                  ? "Самостоятельная серия завершена. Можно перейти к следующей ноте."
                  : "Серия с помощником завершена. Теперь попробуйте сами."
              )}
            </p>
          )}
        </div>
      </LessonSlot>
      <LessonSlot name="resultAction">
        {completed && (
          <div className="beginner-actions">
            <button className="game-button" onClick={independent ? onNext : onIndependent}>
              {t(independent ? "Следующая маленькая стадия" : "Попробовать без подсказок")}
            </button>
            <button className="game-button" onClick={onRepeat}>
              {t("Повторить маленькую серию")}
            </button>
          </div>
        )}
      </LessonSlot>
    </>
  );
}
