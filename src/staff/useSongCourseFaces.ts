import { useLayoutEffect, useRef, type RefObject } from "react";
import type { SongCourseFeedbackSource } from "./songCourseFeedback";
import type { NoteIndex } from "./staffNoteIndex";
import { SongCourseFaceOverlay } from "./songCourseFaceOverlay";
export function useSongCourseFaces(
  source: SongCourseFeedbackSource | undefined,
  host: RefObject<HTMLElement | null>,
  index: RefObject<NoteIndex>,
  presentationId: string | undefined
) {
  const ref = useRef<SongCourseFaceOverlay | null>(null);
  useLayoutEffect(() => {
    if (!source || !host.current || !presentationId) return;
    const owner = new SongCourseFaceOverlay(
      host.current,
      () => index.current,
      source,
      presentationId
    );
    ref.current = owner;
    const stop = source.subscribe(owner.refresh);
    owner.refresh();
    return () => {
      stop();
      ref.current = null;
    };
  }, [source, host, index, presentationId]);
  return ref;
}
