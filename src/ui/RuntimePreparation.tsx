import type { CSSProperties } from "react";
import { useI18n } from "../app/useI18n";
import type { PianoSampleProgress, SampleGroupProgress } from "../audio/pianoSamples";
import { GameDialog } from "./GameDialog";

export interface RuntimePreparationProps {
  readonly party: "idle" | "preparing" | "waiting-frame" | "error";
  readonly audioForeground: boolean;
  readonly sound: "off" | "loading" | "ready" | "error";
  readonly progress: PianoSampleProgress;
  readonly onCancel: () => void;
  readonly onRetry: () => void;
}

/** A small HTML piano stays available while the real scene or audio is being prepared. */
function PianoLoadingMark() {
  return (
    <div className="preparation-piano" aria-hidden="true">
      {Array.from({ length: 7 }, (_, index) => (
        <span
          key={index}
          className="preparation-piano__white"
          style={{ "--key-delay": `${String(index * 110)}ms` } as CSSProperties}
        >
          {[0, 1, 3, 4, 5].includes(index) && <i className="preparation-piano__black" />}
        </span>
      ))}
    </div>
  );
}

function SampleBytes({
  group,
  compact = false
}: {
  group: SampleGroupProgress;
  compact?: boolean;
}) {
  const { t, formatNumber } = useI18n();
  const mb = (bytes: number) =>
    formatNumber(bytes / 1_000_000, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const total = Math.max(group.loadedBytes, group.totalBytes);
  if (compact)
    return (
      <span className="preparation-bytes preparation-bytes--compact">
        {t("{loaded}/{total} МБ · ещё {remaining}", {
          loaded: mb(group.loadedBytes),
          total: mb(total),
          remaining: mb(Math.max(0, total - group.loadedBytes))
        })}
      </span>
    );
  return (
    <div className="preparation-bytes">
      <progress
        aria-label={t("Загрузка сэмплов звука")}
        max={Math.max(1, total)}
        value={group.loadedBytes}
      />
      <span>
        {t("Получено {loaded} из {total} МБ", {
          loaded: mb(group.loadedBytes),
          total: mb(total)
        })}
      </span>
      <span>
        {t("Ещё {remaining} МБ", { remaining: mb(Math.max(0, total - group.loadedBytes)) })}
      </span>
    </div>
  );
}

/** The automatic warm-up never takes focus or intercepts the click which started it. */
export function RuntimePreparation(props: RuntimePreparationProps) {
  const { t } = useI18n();
  const critical = props.progress.critical;
  const background = props.progress.background;
  const panel = props.party !== "idle" || props.audioForeground;
  const group = critical.status === "ready" ? background : critical;
  const audioError = panel
    ? props.audioForeground && (props.sound === "error" || critical.status === "error")
    : props.sound === "error" || critical.status === "error" || group.status === "error";
  const error = props.party === "error" || audioError;
  const title = t("Подготовка пианино");
  const stage =
    props.party === "error"
      ? t("Не удалось подготовить партию")
      : audioError
        ? critical.status === "ready" && !panel && props.sound !== "error"
          ? t("Не удалось загрузить дополнительный звук")
          : t("Не удалось включить звук")
        : props.party === "preparing"
          ? t("Готовим партию")
          : props.party === "waiting-frame"
            ? t("Готовим изображение")
            : group.status === "decoding"
              ? t("Обрабатываем звук")
              : panel && critical.status === "ready"
                ? t("Включаем звук")
                : critical.status === "ready"
                  ? t("Догружаем звук")
                  : t("Загружаем звук");
  const warmStatus =
    !panel && (group.status === "loading" || group.status === "decoding" || audioError);
  const retryLabel =
    props.party === "error" ? t("Повторить подготовку партии") : t("Повторить загрузку звука");
  return (
    <>
      {/* Keep the native dialog mounted so close() restores focus before its content disappears. */}
      <GameDialog
        open={panel}
        title={title}
        className="runtime-preparation"
        onClose={props.onCancel}
      >
        {panel && (
          <>
            <div className="runtime-preparation__content" data-error={error || undefined}>
              <PianoLoadingMark />
              <h2 role="status">{stage}</h2>
              {props.party === "idle" && <SampleBytes group={critical} />}
              {!error && props.party !== "idle" && (
                <div className="preparation-activity" aria-hidden="true" />
              )}
            </div>
            <div className="runtime-preparation__actions">
              {error && (
                <button
                  type="button"
                  className="game-button game-button--play"
                  onClick={props.onRetry}
                >
                  {retryLabel}
                </button>
              )}
              <button
                type="button"
                className="game-button"
                ref={(button) => {
                  if (button) button.autofocus = true;
                }}
                onClick={props.onCancel}
              >
                {error ? t("Закрыть") : t("Отмена")}
              </button>
            </div>
          </>
        )}
      </GameDialog>
      {warmStatus && (
        <aside className="runtime-sound-status" aria-label={title} data-error={error || undefined}>
          <PianoLoadingMark />
          <div>
            <span role="status">{stage}</span>
            <SampleBytes group={group} compact />
          </div>
          {error && (
            <button type="button" className="game-button" onClick={props.onRetry}>
              {retryLabel}
            </button>
          )}
        </aside>
      )}
    </>
  );
}
