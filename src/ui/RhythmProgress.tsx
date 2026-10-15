import { useI18n } from "../app/useI18n";
import { summarizeRhythmHistory } from "../rhythm/progress";
import type { RhythmResult, RhythmSummary } from "../rhythm/types";
import { RHYTHM_SOURCE_LABELS } from "./RhythmCourse";

function Deviation({ value }: { value: number | null }) {
  const { t } = useI18n();
  return value === null ? (
    <span aria-label={t("Нет данных об отклонении ритма")}>{t("нет данных")}</span>
  ) : (
    <>{Math.round(value)}</>
  );
}

export function RhythmMetrics({ summary }: { summary: RhythmSummary }) {
  const { t } = useI18n();
  const counts = [
    ["Ожидаемые удары", summary.expected],
    ["Попадания ритма", summary.hits],
    ["Попадания вовремя", summary.onTime],
    ["Ранние попадания", summary.early],
    ["Поздние попадания", summary.late],
    ["Пропуски ритма", summary.misses],
    ["Лишние удары", summary.extras],
    ["Из них в паузах", summary.restExtras]
  ] as const;
  return (
    <>
      <p>
        {t("Попадания: {hits} из {expected} ({percent}%).", {
          hits: summary.hits,
          expected: summary.expected,
          percent: Math.round(summary.hitRate * 100)
        })}
      </p>
      <dl className="rhythm-metrics">
        {counts.map(([label, value]) => (
          <div key={label}>
            <dt>{t(label)}</dt>
            <dd>{value}</dd>
          </div>
        ))}
        <div>
          <dt>{t("Медиана отклонения, мс")}</dt>
          <dd>
            <Deviation value={summary.signedMedianMs} />
          </dd>
        </div>
        <div>
          <dt>{t("Медиана абсолютного отклонения, мс")}</dt>
          <dd>
            <Deviation value={summary.absoluteMedianMs} />
          </dd>
        </div>
      </dl>
    </>
  );
}

function RhythmMetadata({ result }: { result: RhythmResult }) {
  const { t } = useI18n();
  return (
    <>
      <p>
        {t("Темп: {bpm} BPM · {source}", {
          bpm: result.bpm,
          source: t(RHYTHM_SOURCE_LABELS[result.source])
        })}
      </p>
      <p className="reading-muted">
        {t("Правила ритма: {version}", { version: result.rulesVersion })}
        {" · "}
        {t(
          result.offsets.status === "calibrated"
            ? "С профилем калибровки"
            : "Без профиля калибровки"
        )}
      </p>
      <p className="reading-muted">
        {t("Компенсации, мс: ввод {input}, вручную {manual}, звук {audio}, вид {visual}.", {
          input: result.offsets.inputOffsetMs,
          manual: result.offsets.manualInputOffsetMs,
          audio: result.offsets.audioOutputOffsetMs,
          visual: result.offsets.visualOffsetMs
        })}
      </p>
    </>
  );
}

export function RhythmProgress({
  history,
  result
}: {
  history: readonly RhythmResult[];
  result: RhythmResult | null;
}) {
  const { t } = useI18n();
  const groups = summarizeRhythmHistory(history);
  return (
    <section className="reading-progress rhythm-progress">
      {result && (
        <section aria-label={t("Результат ритма")}>
          <h4>{t("Результат ритма")}</h4>
          <RhythmMetadata result={result} />
          <RhythmMetrics summary={result.summary} />
        </section>
      )}
      <details>
        <summary>{t("Мой прогресс ритма")}</summary>
        <p>
          {t(
            "Хранятся последние 20 завершённых серий ритма. Темпы, способы ввода и компенсации считаются отдельно."
          )}
        </p>
        {groups.length === 0 && <p>{t("Нет завершённых серий ритма.")}</p>}
        {groups.map((group) => {
          const first = group.results[0];
          if (!first) return null;
          return (
            <section className="rhythm-progress-group" key={group.key}>
              <RhythmMetadata result={first} />
              <p>{t("Завершённых серий: {number}", { number: group.results.length })}</p>
              <RhythmMetrics summary={group.summary} />
            </section>
          );
        })}
      </details>
      <details>
        <summary>{t("История ритма: {number}", { number: history.length })}</summary>
        {history
          .slice()
          .reverse()
          .map((item) => (
            <section className="rhythm-progress-group" key={item.runId}>
              <p>
                <time dateTime={new Date(item.completedAt).toISOString()}>
                  {new Date(item.completedAt).toLocaleString()}
                </time>
              </p>
              <RhythmMetadata result={item} />
              <RhythmMetrics summary={item.summary} />
            </section>
          ))}
      </details>
    </section>
  );
}
