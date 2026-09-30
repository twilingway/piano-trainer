import type { SplitDirection, TakeStaff } from "../app/useTakeReview";
import type { TakeReview } from "../recording/compare";
import type { Take } from "../recording/take";

function takeLabel(take: Take): string {
  const when = new Date(take.createdAt);
  const time = when.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  const date = when.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
  const mode = take.mode === "tempo" ? "в темпе" : "с ожиданием";
  return `${date} ${time} · ${mode} · ${String(Math.round(take.speed * 100))}%`;
}

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
  const { review, take } = props;
  return (
    <div className="review-bar">
      <strong>Разбор дубля</strong>
      <span className="good">чисто {review.summary.good}</span>
      <span className="inaccurate">неточно {review.summary.inaccurate}</span>
      <span className="missed">пропущено {review.summary.missed}</span>
      <span>лишние нажатия {review.summary.extras}</span>
      {take.mode === "tempo" && <span>ритм ±{Math.round(review.summary.meanAbsOffsetMs)} мс</span>}
      <span>ровность удара ±{Math.round(review.summary.velocitySpread)}</span>
      {props.takes.length > 1 && (
        <select
          aria-label="Дубль"
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
            Рядом
          </button>
          <button
            type="button"
            aria-pressed={props.splitDirection === "column"}
            onClick={() => {
              props.onSplit("column");
            }}
          >
            Друг под другом
          </button>
          <button type="button" onClick={props.onStopComparing}>
            Закрыть сравнение
          </button>
        </>
      ) : (
        <button type="button" onClick={props.onCompare}>
          Сравнить с оригиналом
        </button>
      )}
      <select
        aria-label="Ноты дубля"
        value={props.takeStaff}
        onChange={(event) => {
          props.onTakeStaff(event.target.value as TakeStaff);
        }}
      >
        <option value="off">Ноты дубля: скрыть</option>
        <option value="column">Ноты дубля: под оригиналом</option>
        <option value="row">Ноты дубля: рядом</option>
      </select>
      <button type="button" onClick={props.onDownload}>
        Скачать .mid
      </button>
      <button type="button" onClick={props.onHide}>
        Скрыть
      </button>
    </div>
  );
}
