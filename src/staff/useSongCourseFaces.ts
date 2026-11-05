import { useLayoutEffect, useRef, type RefObject } from "react";
import { useI18n } from "../app/useI18n";
import type { SongCourseHoldSnapshot } from "../songCourse/holdCue";
import type { SongCourseFeedbackSource } from "./songCourseFeedback";
import type { NoteIndex } from "./staffNoteIndex";
import { SongCourseFaceOverlay } from "./songCourseFaceOverlay";
import { SongCourseHoldOverlay } from "./songCourseHoldOverlay";
export function useSongCourseFaces(
  source: SongCourseFeedbackSource | undefined,
  host: RefObject<HTMLElement | null>,
  index: RefObject<NoteIndex>,
  presentationId: string | undefined,
  readHold?: () => SongCourseHoldSnapshot | null
) {
  const { t } = useI18n();
  const holdLabel = t("Держи");
  const releaseLabel = t("Отпусти");
  const trackLabel = t("Дорожка длительности ноты");
  const ref = useRef<{ readonly refresh: () => void; readonly frame: () => void } | null>(null);
  useLayoutEffect(() => {
    if (!host.current || !presentationId || (!source && !readHold)) return;
    const faces = source
      ? new SongCourseFaceOverlay(host.current, () => index.current, source, presentationId)
      : null;
    const hold = readHold
      ? new SongCourseHoldOverlay(host.current, () => index.current, readHold, presentationId, {
          hold: holdLabel,
          release: releaseLabel,
          track: trackLabel
        })
      : null;
    const refresh = () => {
      faces?.refresh();
      hold?.frame();
    };
    ref.current = {
      refresh,
      frame: () => {
        hold?.frame();
      }
    };
    const stop = source?.subscribe(refresh);
    refresh();
    return () => {
      stop?.();
      hold?.dispose();
      ref.current = null;
    };
  }, [source, host, index, presentationId, readHold, holdLabel, releaseLabel, trackLabel]);
  return ref;
}
