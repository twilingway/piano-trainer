import type { KeyboardEvent, ReactNode } from "react";
import { LessonDetails } from "./LessonDetails";
import { useI18n } from "../app/useI18n";
import type { RhythmBpm, RhythmInputSource } from "../rhythm/types";

export const RHYTHM_SOURCE_LABELS: Readonly<Record<RhythmInputSource, string>> = {
  keyboard: "Пробел или кнопка с клавиатуры",
  pointer: "Кнопка мышью или касанием",
  midi: "MIDI-пианино"
};

export function RhythmCourseCard({ onStart }: { onStart: () => void }) {
  const { t } = useI18n();
  return (
    <section className="reading-course-card rhythm-course-card">
      <h3>{t("Ритм")}</h3>
      <p>{t("Читайте четыре такта и отбивайте ритм: четверти, половинные и паузы.")}</p>
      <p className="reading-muted">{t("Высота нот не проверяется. Можно начать без пианино.")}</p>
      <button type="button" className="game-button" onClick={onStart}>
        {t("Читать и отбивать ритм")}
      </button>
    </section>
  );
}

export type RhythmPanelStatus =
  "idle" | "preparing" | "count-in" | "running" | "completed" | "empty" | "cancelled" | "error";

export interface RhythmPanelProps {
  bpm: RhythmBpm;
  source: RhythmInputSource;
  status: RhythmPanelStatus;
  ready: boolean;
  midiAvailable: boolean;
  compensated: boolean;
  effectiveOffsetMs: number;
  countInBeat?: number | undefined;
  error?: "audio" | "staff" | "midi" | null | undefined;
  progress?: ReactNode;
  onBpm: (bpm: RhythmBpm) => void;
  onSource: (source: RhythmInputSource) => void;
  onStart: () => void;
  onRepeat: () => void;
  onNewSeries: () => void;
  onExit: () => void;
  onCalibrate: () => void;
  onRetryStaff: () => void;
  onTapDown: (source: "keyboard" | "pointer", atMs: number, identity: string) => void;
  onTapUp: (source: "keyboard" | "pointer", identity: string) => void;
}

export function RhythmPanel(props: RhythmPanelProps) {
  const { t } = useI18n();
  const active = props.status === "count-in" || props.status === "running";
  const midiMissing = props.source === "midi" && !props.midiAvailable;
  const tapAvailable = active && props.source !== "midi";
  const tapKey = (event: KeyboardEvent<HTMLButtonElement>, down: boolean) => {
    if (event.key !== " " && event.key !== "Enter") return;
    event.preventDefault();
    event.stopPropagation();
    const identity = `key:${event.code || (event.key === " " ? "Space" : "Enter")}`;
    if (!down) props.onTapUp("keyboard", identity);
    else if (tapAvailable && props.source === "keyboard" && !event.repeat) {
      props.onTapDown("keyboard", event.timeStamp, identity);
    }
  };
  const statusLabel = {
    idle: "Выберите темп и способ ввода, затем начните ритм.",
    preparing: "Готовим стан и метроном…",
    "count-in": "Слушайте отсчёт. Первая нота — после четырёх долей.",
    running: "Отбивайте начала нот. На паузах не нажимайте.",
    completed: "Серия ритма завершена.",
    empty: "Серия не засчитана: не было ни одного удара. Повторите с отсчёта.",
    cancelled: "Серия прервана без результата. Начните снова с отсчёта.",
    error: "Ритм не начался. Проверьте готовность и повторите."
  }[props.status];
  return (
    <section className="reading-practice rhythm-practice" aria-label={t("Ритм")}>
      <div className="reading-actions rhythm-actions">
        <strong>{t("Читать и отбивать ритм")}</strong>
        <button type="button" className="game-button" onClick={props.onExit}>
          {t("Выйти из ритма")}
        </button>
      </div>
      <p className="rhythm-status" aria-live="polite">
        {t(statusLabel)}
        {props.status === "count-in" && props.countInBeat !== undefined && (
          <> {t("Доля отсчёта: {beat} из 4", { beat: props.countInBeat })}</>
        )}
      </p>
      {midiMissing && (
        <p role="alert">{t("Подключите и выберите MIDI-устройство или смените способ ввода.")}</p>
      )}
      {props.error === "audio" && (
        <p role="alert">{t("Не удалось включить метроном. Включите звук и начните ритм снова.")}</p>
      )}
      {props.error === "staff" && (
        <p role="alert">
          {t("Не удалось показать ноты. Попробуйте загрузить стан снова.")}{" "}
          <button type="button" onClick={props.onRetryStaff}>
            {t("Повторить загрузку стана")}
          </button>
        </p>
      )}
      <div className="reading-actions rhythm-tap-actions">
        <button
          type="button"
          className="game-button"
          disabled={!props.ready || active || props.status === "preparing" || midiMissing}
          onClick={props.onStart}
        >
          {t("Начать ритм")}
        </button>
        <button
          type="button"
          className="game-button rhythm-tap"
          data-rhythm-tap
          aria-disabled={!tapAvailable}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            if (!tapAvailable || props.source !== "pointer") return;
            event.currentTarget.setPointerCapture(event.pointerId);
            props.onTapDown("pointer", event.timeStamp, `pointer:${String(event.pointerId)}`);
          }}
          onPointerUp={(event) => {
            props.onTapUp("pointer", `pointer:${String(event.pointerId)}`);
          }}
          onPointerCancel={(event) => {
            props.onTapUp("pointer", `pointer:${String(event.pointerId)}`);
          }}
          onKeyDown={(event) => {
            tapKey(event, true);
          }}
          onKeyUp={(event) => {
            tapKey(event, false);
          }}
          onBlur={() => {
            props.onTapUp("keyboard", "key:Space");
            props.onTapUp("keyboard", "key:Enter");
          }}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          {t("Ударить")}
        </button>
      </div>
      <p className="reading-muted">
        {t("Темп: {bpm} BPM · Ввод: {source}", {
          bpm: props.bpm,
          source: t(RHYTHM_SOURCE_LABELS[props.source])
        })}
      </p>
      <div className="reading-actions rhythm-actions">
        <button type="button" className="game-button" onClick={props.onNewSeries}>
          {t("Новая серия")}
        </button>
        <button type="button" className="game-button" onClick={props.onRepeat}>
          {t("Повторить этот ритм")}
        </button>
      </div>
      <LessonDetails kind="settings" id="rhythm:practice:settings">
        <div className="rhythm-controls">
          <label>
            {t("Темп ритма, BPM")}
            <select
              value={props.bpm}
              onChange={(event) => {
                props.onBpm(Number(event.target.value) as RhythmBpm);
              }}
            >
              {([60, 80, 100] as const).map((bpm) => (
                <option key={bpm} value={bpm}>
                  {bpm}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("Способ ввода ритма")}
            <select
              value={props.source}
              onChange={(event) => {
                props.onSource(event.target.value as RhythmInputSource);
              }}
            >
              {(["keyboard", "pointer", "midi"] as const).map((source) => (
                <option key={source} value={source}>
                  {t(RHYTHM_SOURCE_LABELS[source])}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="reading-actions">
          <span className="reading-muted">
            {props.compensated
              ? t("Компенсация ввода: {offset} мс.", { offset: props.effectiveOffsetMs })
              : props.effectiveOffsetMs === 0
                ? t("Нет профиля калибровки: компенсация ввода 0 мс.")
                : t("Нет профиля калибровки: ручная компенсация {offset} мс.", {
                    offset: props.effectiveOffsetMs
                  })}
          </span>
          <button type="button" className="game-button" onClick={props.onCalibrate}>
            {t("Калибровка ритма")}
          </button>
        </div>
      </LessonDetails>
      <LessonDetails kind="guide" id="rhythm:practice:guide">
        <p className="reading-muted">
          {t("4 такта · 10 ударов · окно ±150 мс. Половинную не нужно удерживать.")}
        </p>
        <p className="reading-muted">
          {t(
            "Изменение настроек или уход со страницы прерывает серию. Незавершённая серия не сохраняется."
          )}
        </p>
      </LessonDetails>
      {props.progress}
    </section>
  );
}
