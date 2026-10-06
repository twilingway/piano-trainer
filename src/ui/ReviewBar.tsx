import { useI18n } from "../app/useI18n";
import type { SplitDirection, TakeStaff } from "../app/useTakeReview";
import type { TakeReview } from "../recording/compare";
import type { Take } from "../recording/take";

interface Props {
  readonly review: TakeReview;
  /** The take under review. */
  readonly take: Take;
  /** Every take of the song, to pick another one. */
  readonly takes: readonly Take[];
  readonly comparing: boolean;
  readonly splitDirection: SplitDirection;
  readonly takeStaff: TakeStaff;
  readonly onSelectTake: (id: string) => void;
  readonly onSplit: (direction: SplitDirection) => void;
  readonly onCompare: () => void;
  readonly onStopComparing: () => void;
  readonly onTakeStaff: (staff: TakeStaff) => void;
  readonly onDownload: () => void;
  readonly onHide: () => void;
}

/** The review of a take: its counts, the other takes, the comparison and the take's own notes. */
export function ReviewBar(props: Props) {
  const { t, formatNumber, formatDate } = useI18n();
  const takeLabel = (item: Take) => {
    const when = new Date(item.createdAt);
    const time = formatDate(when, { hour: "2-digit", minute: "2-digit" });
    const date = formatDate(when, { day: "2-digit", month: "2-digit" });
    const mode = t(item.mode === "tempo" ? "в темпе" : "с ожиданием");
    return `${date} ${time} · ${mode} · ${formatNumber(Math.round(item.speed * 100))}%`;
  };
  const { review, take } = props;
  return (
    <div className="review-bar">
      <strong>{t("Разбор дубля")}</strong>
      <span className="good">
        {t("чисто")} {formatNumber(review.summary.good)}
      </span>
      <span className="inaccurate">
        {t("неточно")} {formatNumber(review.summary.inaccurate)}
      </span>
      <span className="missed">
        {t("пропущено")} {formatNumber(review.summary.missed)}
      </span>
      <span>
        {t("лишние нажатия")} {formatNumber(review.summary.extras)}
      </span>
      {take.mode === "tempo" && (
        <span>
          {t("ритм ±")}
          {formatNumber(Math.round(review.summary.meanAbsOffsetMs))} {t("мс")}
        </span>
      )}
      <span>
        {t("разброс силы удара ±")}
        {formatNumber(Math.round(review.summary.velocitySpread))}
      </span>
      {props.takes.length > 1 && (
        <select
          aria-label={t("Дубль")}
          value={take.id}
          onChange={(event) => {
            props.onSelectTake(event.target.value);
          }}
        >
          {props.takes.map((item) => (
            <option key={item.id} value={item.id}>
              {takeLabel(item)}
            </option>
          ))}
        </select>
      )}
      {props.comparing ? (
        <>
          <button
            type="button"
            aria-pressed={props.splitDirection === "row"}
            onClick={() => {
              props.onSplit("row");
            }}
          >
            {t("Рядом")}
          </button>
          <button
            type="button"
            aria-pressed={props.splitDirection === "column"}
            onClick={() => {
              props.onSplit("column");
            }}
          >
            {t("Друг под другом")}
          </button>
          <button type="button" onClick={props.onStopComparing}>
            {t("Закрыть сравнение")}
          </button>
        </>
      ) : (
        <button type="button" onClick={props.onCompare}>
          {t("Сравнить с оригиналом")}
        </button>
      )}
      <select
        aria-label={t("Ноты дубля")}
        value={props.takeStaff}
        onChange={(event) => {
          props.onTakeStaff(event.target.value as TakeStaff);
        }}
      >
        <option value="off">{t("Ноты дубля: скрыть")}</option>
        <option value="column">{t("Ноты дубля: под оригиналом")}</option>
        <option value="row">{t("Ноты дубля: рядом")}</option>
      </select>
      <button type="button" onClick={props.onDownload}>
        {t("Скачать .mid")}
      </button>
      <button type="button" onClick={props.onHide}>
        {t("Скрыть")}
      </button>
    </div>
  );
}
