import { MusicCourseNotes } from "./MusicCourseNotes";
import { useI18n } from "../app/useI18n";
import type { MusicCourseResultView } from "./musicCourseTypes";

const SUMMARY_PRIORITY = [
  "Точные высоты",
  "Относительные высоты",
  "Ошибки высоты",
  "Ошибки ритма",
  "Ошибки определения",
  "Ошибки левой руки",
  "Ошибки правой руки",
  "Пропущенные ноты",
  "Лишние ноты",
  "Порядок нот",
  "Завершено этапов",
  "Выполнено заданий"
] as const;

export function MusicCourseResultSummary({ result }: { readonly result: MusicCourseResultView }) {
  const { t, formatNumber } = useI18n();
  const total = result.metrics.find((entry) => entry.labelKey === "Ответов на задания")?.value;
  const correct = result.metrics.find((entry) => entry.labelKey === "Верных ответов")?.value;
  const metrics = result.metrics
    .filter((entry) => entry.value !== null || entry.valueKey)
    .toSorted((left, right) => {
      const priority = (key: string) => {
        const index = SUMMARY_PRIORITY.findIndex((candidate) => candidate === key);
        return index < 0 ? SUMMARY_PRIORITY.length : index;
      };
      return priority(left.labelKey) - priority(right.labelKey);
    })
    .slice(0, 2);
  return (
    <div className="lesson-result__summary">
      {typeof total === "number" && typeof correct === "number" ? (
        <p>
          {t("Верно: {correct}/{total}", {
            correct: formatNumber(correct),
            total: formatNumber(total)
          })}
        </p>
      ) : metrics.length ? (
        <p>
          {metrics.map((metric, index) => (
            <span key={metric.labelKey}>
              {index > 0 ? " · " : null}
              {t(metric.labelKey)}:{" "}
              {metric.valueKey
                ? t(metric.valueKey)
                : typeof metric.value === "number"
                  ? formatNumber(metric.value, { maximumFractionDigits: 2 })
                  : metric.value}
            </span>
          ))}
        </p>
      ) : (
        <p>{t(result.summaryKey ?? "Результат музыкального задания")}</p>
      )}
      <p>
        {t(result.helped ? "Проход с музыкальной подсказкой" : "Самостоятельный музыкальный ответ")}
      </p>
    </div>
  );
}

export function MusicCourseResultDetails({ result }: { readonly result: MusicCourseResultView }) {
  const { t, formatNumber } = useI18n();
  return (
    <div className="music-course-result">
      <h3>{t(result.summaryKey ?? "Результат музыкального задания")}</h3>
      <MusicCourseResultSummary result={result} />
      <p>{t(result.newMaterial ? " · Новый материал" : " · Повтор знакомого материала")}</p>
      <dl>
        {result.metrics.map((metric) => (
          <div key={metric.labelKey}>
            <dt>{t(metric.labelKey)}</dt>
            <dd>
              {metric.valueKey
                ? t(metric.valueKey)
                : metric.value === null
                  ? t("Музыкальный показатель не измерялся")
                  : typeof metric.value === "number"
                    ? formatNumber(metric.value, { maximumFractionDigits: 2 })
                    : metric.value}
            </dd>
          </div>
        ))}
      </dl>
      {result.notes ? <MusicCourseNotes {...result.notes} /> : null}
      {result.detailKeys?.map((key) => (
        <p key={key}>{t(key)}</p>
      ))}
    </div>
  );
}
