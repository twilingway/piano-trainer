import { useMemo } from "react";
import { Staff } from "../staff/Staff";
import type { SongCourseNode, SongCourseSource } from "../songCourse/model";
import { songCourseMiniatureXml } from "./songCourseMiniatureXml";

export function SongCourseMiniature({
  source,
  node
}: {
  readonly source: SongCourseSource;
  readonly node: SongCourseNode;
}) {
  const xml = useMemo(() => songCourseMiniatureXml(source, node), [source, node]);
  return (
    <div className="song-course-miniature" aria-hidden="true">
      <Staff
        musicXml={xml}
        beat={0}
        zoom={1}
        noteColor="#70bcef"
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
