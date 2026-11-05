import { useCallback, useEffect, useMemo, useRef } from "react";
import { Staff } from "../staff/Staff";
import type { SongCourseNode, SongCourseSource } from "../songCourse/model";
import { songCourseMiniatureXml } from "./songCourseMiniatureXml";
import { fitSongCourseMiniature } from "./fitSongCourseMiniature";
import { songCourseMiniatureColor } from "./songCourseMiniatureColor";

export function SongCourseMiniature({
  source,
  node
}: {
  readonly source: SongCourseSource;
  readonly node: SongCourseNode;
}) {
  const xml = useMemo(() => songCourseMiniatureXml(source, node), [source, node]);
  const color = useMemo(() => songCourseMiniatureColor(xml), [xml]);
  const frame = useRef<HTMLDivElement>(null);
  const fit = useCallback(() => {
    if (frame.current) fitSongCourseMiniature(frame.current);
  }, []);
  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const resize = new ResizeObserver(fit);
    const drawing = new MutationObserver(fit);
    resize.observe(element);
    drawing.observe(element, { childList: true, subtree: true });
    return () => {
      resize.disconnect();
      drawing.disconnect();
    };
  }, [fit]);
  return (
    <div className="song-course-miniature" aria-hidden="true" ref={frame}>
      <Staff
        musicXml={xml}
        onLoadSettled={fit}
        beat={0}
        zoom={1}
        noteColor={color}
        playedNoteColor={color}
        scoreColor="#99b9c7"
        singleLine
        follow={false}
        fingers={false}
        fingerColors="mono"
        breaksFromScore={false}
        illustration
        material="clay"
        pitchColors
      />
    </div>
  );
}
