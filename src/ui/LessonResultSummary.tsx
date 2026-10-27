import { useI18n } from "../app/useI18n";
import { readingPurpose, summarizeReadingResults } from "../reading/progress";
import { summarizeBassReadingResults } from "../reading/bassProgress";
import { summarizeTwoHandResults } from "../reading/twoHandProgress";
import { summarizeHeldBassResults } from "../reading/heldBassProgress";
import type { ReadingMetrics } from "../reading/progressTypes";
import type { ReadingResult } from "../reading/types";
import type { BassReadingResult } from "../reading/bassTypes";
import type { TwoHandResult } from "../reading/twoHandTypes";
import type { HeldBassResult } from "../reading/heldBassTypes";
import type { IndependentRhythmResult } from "../independentRhythm/types";

function ReadingSummaryText({ metrics }: { readonly metrics: ReadingMetrics }) {
  const { t, formatNumber } = useI18n();
  return (
    <>
      <p>
        {t("С первой попытки: {correct}/{total} · Ошибок: {errors}", {
          correct: formatNumber(metrics.firstAttemptCorrectCount),
          total: formatNumber(metrics.observationCount),
          errors: formatNumber(metrics.errorCount)
        })}
      </p>
      <p>
        {t("Решено без подсказки: {correct}/{total}", {
          correct: formatNumber(metrics.unassistedSolvedCount),
          total: formatNumber(metrics.observationCount)
        })}
      </p>
    </>
  );
}

export function ReadingLessonSummary({ result }: { readonly result: ReadingResult }) {
  return (
    <ReadingSummaryText
      metrics={summarizeReadingResults([result], "all", readingPurpose(result)).totals}
    />
  );
}

export function BassReadingLessonSummary({ result }: { readonly result: BassReadingResult }) {
  return <ReadingSummaryText metrics={summarizeBassReadingResults([result], "all").totals} />;
}

export function TwoHandLessonSummary({ result }: { readonly result: TwoHandResult }) {
  const { t, formatNumber } = useI18n();
  const data = summarizeTwoHandResults([result], "all");
  return (
    <>
      <p>
        {t("С первого раза без помощи: {correct}/{total} · С помощью: {helped}", {
          correct: formatNumber(data.independentCount),
          total: formatNumber(data.pairCount),
          helped: formatNumber(data.helpedCount)
        })}
      </p>
      <p>
        {data.spreadMs === null
          ? t("Ошибок в серии: {number}", { number: formatNumber(data.errorCount) })
          : t("Ошибок: {errors} · Медиана разрыва: {milliseconds} мс", {
              errors: formatNumber(data.errorCount),
              milliseconds: formatNumber(Math.round(data.spreadMs))
            })}
      </p>
    </>
  );
}

export function HeldBassLessonSummary({ result }: { readonly result: HeldBassResult }) {
  const { t, formatNumber } = useI18n();
  const data = summarizeHeldBassResults([result], "all");
  return (
    <>
      <p>
        {t("С первого раза без помощи: {correct}/{total} · С помощью: {helped}", {
          correct: formatNumber(data.independentCount),
          total: formatNumber(data.fragmentCount),
          helped: formatNumber(data.helpedCount)
        })}
      </p>
      <p>
        {data.heldDurationMs === null
          ? t("Ошибок в серии: {number}", { number: formatNumber(data.errorCount) })
          : t("Ошибок: {errors} · Медиана удержания баса: {milliseconds} мс", {
              errors: formatNumber(data.errorCount),
              milliseconds: formatNumber(Math.round(data.heldDurationMs))
            })}
      </p>
    </>
  );
}

export function IndependentRhythmLessonSummary({
  result
}: {
  readonly result: IndependentRhythmResult;
}) {
  const { t, formatNumber } = useI18n();
  const data = result.series.summary;
  return (
    <>
      <p>
        {t("Попадания: Л {leftHits}/{leftTotal}, П {rightHits}/{rightTotal}", {
          leftHits: formatNumber(data.left.hits),
          leftTotal: formatNumber(data.left.expected),
          rightHits: formatNumber(data.right.hits),
          rightTotal: formatNumber(data.right.expected)
        })}
      </p>
      <p>
        {data.spreadMs === null
          ? t("Лишних атак: {number}", { number: formatNumber(data.extras) })
          : t("Лишних атак: {extras} · Медиана разрыва: {milliseconds} мс", {
              extras: formatNumber(data.extras),
              milliseconds: formatNumber(Math.round(data.spreadMs))
            })}
      </p>
    </>
  );
}
