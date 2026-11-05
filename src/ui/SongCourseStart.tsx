import { useI18n } from "../app/useI18n";
import { GameDialog } from "./GameDialog";

interface Props {
  readonly open: boolean;
  readonly label: string;
  readonly countdown: number | undefined;
  readonly onStart: () => void;
  readonly onExit: () => void;
}

/** A floating dialog never takes space from the engraved score or blocks the lesson menu. */
export function SongCourseStart({ open, label, countdown, onStart, onExit }: Props) {
  const { t } = useI18n();
  return (
    <GameDialog
      open={open}
      modal={false}
      title={t(label)}
      className="song-course-start"
      onClose={onExit}
    >
      {open && (
        <>
          {countdown === undefined ? (
            <button
              type="button"
              className="game-button song-course-lesson__play"
              aria-label={t(label)}
              title={t(label)}
              onClick={onStart}
            >
              <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true">
                <path fill="currentColor" d="M7 4 22 12 7 20Z" />
              </svg>
            </button>
          ) : (
            <div
              className="game-button song-course-lesson__play"
              role="status"
              aria-live="polite"
              aria-label={t("До начала: {count}", { count: countdown })}
            >
              {countdown}
            </div>
          )}
        </>
      )}
    </GameDialog>
  );
}
