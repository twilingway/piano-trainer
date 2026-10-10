import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useI18n } from "../app/useI18n";
import { DEFAULT_STAFF_PREFS, type StaffPrefs } from "../app/staffPreferences";
import { FINGER_COLOR } from "../render/fingerColors";
import { detectChords, type ChordKind } from "../song/harmony";
import { quartersAt, type Song } from "../song/song";
import type { CourseStageId } from "./CourseCards";
import { buildPianoTabs, layoutPianoTabs, positionInTabs } from "./pianoTabsLayout";
import { useTabsCursor } from "./useTabsCursor";

export { buildPianoTabs } from "./pianoTabsLayout";

const LETTERS = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
const RUSSIAN = ["до", "до♯", "ре", "ре♯", "ми", "фа", "фа♯", "соль", "соль♯", "ля", "ля♯", "си"];
const CHORD_SUFFIX: Record<ChordKind, string> = {
  major: "",
  minor: "m",
  diminished: "dim",
  augmented: "+",
  dominant: "7",
  "minor-seventh": "m7",
  "major-seventh": "maj7"
};

interface Props {
  readonly song: Song;
  readonly baseSong?: Song;
  readonly time: number;
  readonly liveBeat?: () => number;
  readonly stage: CourseStageId;
  readonly prefs?: StaffPrefs;
}

/** This reader only displays the session clock and the song's own events. */
export function PianoTabs({
  song,
  baseSong = song,
  time,
  liveBeat,
  stage,
  prefs = DEFAULT_STAFF_PREFS
}: Props) {
  const { t } = useI18n();
  const model = useMemo(() => buildPianoTabs(song), [song]);
  const chords = useMemo(
    () => (prefs.chords ? detectChords(baseSong) : []),
    [baseSong, prefs.chords]
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [viewportWidth, setViewportWidth] = useState(640);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const host = scrollRef.current;
    if (!host) return;
    const measure = () => {
      setViewportWidth(host.clientWidth || 640);
      const configured = Number.parseFloat(getComputedStyle(host).getPropertyValue("--tabs-scale"));
      setScale(Number.isFinite(configured) && configured > 0 ? configured : 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  const zoom = prefs.zoom * scale;
  const labelWidth = viewportWidth < 720 ? 70 : 100;
  // Labels are centred on the attack; gutters keep edge labels clear of sticky hand names.
  const noteGutter = (prefs.noteNames === "ru" ? 48 : 18) * zoom;
  const rows = useMemo(
    () =>
      layoutPianoTabs(model, {
        zoom,
        singleLine: prefs.singleLine,
        measuresPerLine: prefs.measuresPerLine,
        noteNames: prefs.noteNames,
        viewportWidth: Math.max(36, viewportWidth - labelWidth - noteGutter * 2)
      }),
    [
      model,
      zoom,
      prefs.singleLine,
      prefs.measuresPerLine,
      prefs.noteNames,
      viewportWidth,
      labelWidth,
      noteGutter
    ]
  );
  const naturalWidth = Math.max(0, ...rows.map((row) => row.width)) + labelWidth + noteGutter * 2;
  const padding = Math.max(0, (viewportWidth - naturalWidth) / 2);
  const centerCursor = prefs.singleLine && prefs.follow;
  const musicalOverflow = naturalWidth > viewportWidth;
  const edgeSpace = centerCursor || naturalWidth > viewportWidth ? viewportWidth / 2 : padding;
  const beat = quartersAt(song, time);
  useTabsCursor(
    scrollRef,
    rows,
    beat,
    liveBeat,
    prefs.follow,
    centerCursor || naturalWidth > viewportWidth
  );
  if (song.notes.length === 0) return <div className="piano-tabs">{t("Пока нет нот")}</div>;
  const style = {
    "--tabs-zoom": zoom,
    "--tabs-notes": prefs.noteColor,
    "--tabs-score": prefs.scoreColor
  } as CSSProperties;
  return (
    <section className="piano-tabs" style={style} aria-label={t("Пианинные табы")}>
      <div
        className="piano-tabs__scroll"
        data-musical-overflow={musicalOverflow}
        data-scrollbars={prefs.singleLine && (prefs.follow || !musicalOverflow) ? "hidden" : "thin"}
        ref={scrollRef}
        tabIndex={0}
        onPointerDown={(event) => {
          if (event.button !== 0 || event.pointerType === "touch") return;
          dragRef.current = {
            x: event.clientX,
            y: event.clientY,
            left: event.currentTarget.scrollLeft,
            top: event.currentTarget.scrollTop
          };
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag || (event.buttons & 1) === 0) return;
          event.currentTarget.scrollLeft = drag.left - (event.clientX - drag.x);
          event.currentTarget.scrollTop = drag.top - (event.clientY - drag.y);
        }}
        onPointerUp={() => {
          dragRef.current = null;
        }}
        onPointerCancel={() => {
          dragRef.current = null;
        }}
      >
        <div
          className="piano-tabs__content"
          style={{ width: naturalWidth + edgeSpace * 2, paddingInline: edgeSpace }}
        >
          {rows.map((row, rowIndex) => {
            const rightCount = Math.max(
              1,
              ...row.events.filter((e) => e.event.hand === "right").map((e) => e.event.notes.length)
            );
            const leftCount = Math.max(
              1,
              ...row.events.filter((e) => e.event.hand === "left").map((e) => e.event.notes.length)
            );
            const toneHeight = (prefs.fingers ? 46 : 32) * zoom;
            const chordHeight = prefs.chords ? 24 * zoom : 0;
            const rightHeight = rightCount * toneHeight + 8 * zoom;
            const height = rightHeight + leftCount * toneHeight + 8 * zoom;
            const xAt = (value: number) => positionInTabs([row], value)?.x ?? 0;
            return (
              <div
                className="piano-tabs__system"
                data-tab-row={rowIndex}
                key={row.startBeat}
                style={{
                  marginLeft: Math.max(
                    0,
                    (naturalWidth - row.width - labelWidth - noteGutter * 2) / 2
                  )
                }}
              >
                <div
                  className="piano-tabs__labels"
                  style={{
                    width: labelWidth,
                    paddingTop: chordHeight,
                    gridTemplateRows: `${String(rightHeight)}px ${String(height - rightHeight)}px`
                  }}
                >
                  <span data-muted={stage === "left"}>{t("Правая рука")}</span>
                  <span data-muted={stage === "right"}>{t("Левая рука")}</span>
                </div>
                <div
                  className="piano-tabs__grid"
                  style={{
                    width: row.width,
                    height: height + chordHeight,
                    marginInline: noteGutter
                  }}
                >
                  {row.boundaries.slice(0, -1).map((start, index) => (
                    <div
                      key={start}
                      className="piano-tabs__column"
                      data-beat={start}
                      data-end={row.boundaries[index + 1]}
                      data-measure={model.measures.has(start)}
                      data-current={start <= beat && beat < (row.boundaries[index + 1] ?? start)}
                      style={{
                        left: row.offsets[index],
                        width: (row.offsets[index + 1] ?? 0) - (row.offsets[index] ?? 0),
                        top: chordHeight
                      }}
                      aria-hidden="true"
                    />
                  ))}
                  {chords
                    .filter((c) => c.beat >= row.startBeat && c.beat < row.endBeat)
                    .map((c) => (
                      <span
                        className="piano-tabs__harmony"
                        key={c.beat}
                        style={{ left: xAt(c.beat) }}
                      >
                        {LETTERS[c.root]}
                        {CHORD_SUFFIX[c.kind]}
                      </span>
                    ))}
                  {row.events.map(({ event, left, attack }) => (
                    <div
                      key={event.id}
                      className="piano-tabs__event"
                      data-hand={event.hand}
                      data-muted={stage !== "both" && stage !== event.hand}
                      style={{
                        left,
                        top: chordHeight + (event.hand === "right" ? 0 : rightHeight)
                      }}
                    >
                      <div className="piano-tabs__chord">
                        {event.notes.map((note) => {
                          const endBeat = quartersAt(song, note.start + note.duration);
                          if (endBeat <= row.startBeat) return null;
                          const name =
                            (prefs.noteNames === "ru" ? RUSSIAN : LETTERS)[
                              ((note.pitch % 12) + 12) % 12
                            ] ?? "C";
                          const finger = prefs.fingers
                            ? (note.finger ?? note.scoreFinger)
                            : undefined;
                          const noteEnd = xAt(Math.min(row.endBeat, endBeat));
                          return (
                            <div
                              className="piano-tabs__tone"
                              key={note.id}
                              style={{ width: Math.max(0, noteEnd - left), height: toneHeight }}
                            >
                              {attack && (
                                <span
                                  className="piano-tabs__note"
                                  data-start={note.startBeat}
                                  data-end={endBeat}
                                  data-current={
                                    note.start <= time && time < note.start + note.duration
                                  }
                                  aria-label={
                                    finger === undefined
                                      ? t("Таб {note}", { note: name })
                                      : t("Таб {note}, палец {finger}", { note: name, finger })
                                  }
                                >
                                  {prefs.fingers && (
                                    <span
                                      className="piano-tabs__finger"
                                      aria-hidden="true"
                                      style={{
                                        color:
                                          finger && prefs.fingerColors === "fingers"
                                            ? `#${FINGER_COLOR[finger].toString(16).padStart(6, "0")}`
                                            : prefs.scoreColor
                                      }}
                                    >
                                      {finger ?? "\u00a0"}
                                    </span>
                                  )}
                                  <strong aria-hidden="true">{name}</strong>
                                </span>
                              )}
                              <span
                                className="piano-tabs__sustain"
                                style={{
                                  left: attack ? (prefs.noteNames === "ru" ? 42 : 16) * zoom : 0
                                }}
                                aria-hidden="true"
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  <div className="piano-tabs__cursor" aria-hidden="true" />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
