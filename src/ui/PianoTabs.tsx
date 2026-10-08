import { useEffect, useMemo, useRef } from "react";

import { useI18n } from "../app/useI18n";
import { quartersAt } from "../song/song";
import type { Song, SongNote } from "../song/song";
import type { CourseStageId } from "./CourseCards";

interface TabEvent {
  readonly id: string;
  readonly hand: "left" | "right";
  readonly start: number;
  readonly end: number;
  readonly firstColumn: number;
  readonly lastColumn: number;
  readonly notes: readonly SongNote[];
}

interface TabModel {
  readonly boundaries: readonly number[];
  readonly measures: ReadonlySet<number>;
  readonly events: readonly TabEvent[];
}

/** Onsets, releases and measure edges share one grid for both hands. */
export function buildPianoTabs(song: Song): TabModel {
  const boundaries = new Set<number>([0]);
  const measures = new Set(song.measures.map((measure) => measure.start));
  const groups = new Map<string, SongNote[]>();
  for (const note of song.notes) {
    boundaries.add(note.startBeat);
    boundaries.add(quartersAt(song, note.start + note.duration));
    const key = `${note.hand}:${String(note.startBeat)}`;
    const group = groups.get(key);
    if (group) group.push(note);
    else groups.set(key, [note]);
  }
  for (const measure of song.measures) {
    boundaries.add(measure.start);
    boundaries.add(measure.start + measure.length);
  }
  boundaries.add(quartersAt(song, song.duration));
  const ordered = [...boundaries].sort((a, b) => a - b);
  const indices = new Map(ordered.map((beat, index) => [beat, index + 1]));
  const events: TabEvent[] = [];
  for (const [id, notes] of groups) {
    const first = notes[0];
    if (!first) continue;
    const end = Math.max(...notes.map((note) => note.start + note.duration));
    events.push({
      id,
      hand: first.hand,
      start: first.start,
      end,
      firstColumn: indices.get(first.startBeat) ?? 1,
      lastColumn: indices.get(quartersAt(song, end)) ?? ordered.length,
      notes: notes.sort((a, b) => b.pitch - a.pitch)
    });
  }
  return { boundaries: ordered, measures, events };
}

const NOTE_LETTERS = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];

interface Props {
  readonly song: Song;
  readonly time: number;
  readonly stage: CourseStageId;
}

/** Time is supplied by PracticeSession; this view never advances it. */
export function PianoTabs({ song, time, stage }: Props) {
  const { t } = useI18n();
  // The clock changes every frame; music grouping only changes with the song.
  const model = useMemo(() => buildPianoTabs(song), [song]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<HTMLDivElement>(null);
  const beat = quartersAt(song, Math.max(0, time));
  const current = model.boundaries.findIndex((value, index) => {
    const end = model.boundaries[index + 1];
    return end !== undefined && value <= beat && beat < end;
  });
  useEffect(() => {
    const container = scrollRef.current;
    const marker = markerRef.current;
    if (!container || !marker || current < 0) return;
    const left = marker.offsetLeft;
    const right = left + marker.offsetWidth;
    if (left < container.scrollLeft || right > container.scrollLeft + container.clientWidth) {
      container.scrollLeft = Math.max(0, left - container.clientWidth * 0.35);
    }
  }, [current, song]);
  if (song.notes.length === 0) return <div className="piano-tabs">{t("Пока нет нот")}</div>;
  const intervals = model.boundaries.slice(0, -1);
  const widths = intervals.map((start, index) =>
    Math.max(0.05, (model.boundaries[index + 1] ?? start) - start)
  );
  return (
    <section className="piano-tabs" aria-label={t("Пианинные табы")}>
      <div className="piano-tabs__labels">
        <span data-muted={stage === "left"}>{t("Правая рука")}</span>
        <span data-muted={stage === "right"}>{t("Левая рука")}</span>
      </div>
      <div className="piano-tabs__scroll" ref={scrollRef}>
        <div
          className="piano-tabs__grid"
          style={{
            gridTemplateColumns: widths
              .map((width) => `minmax(36px, ${String(width)}fr)`)
              .join(" "),
            minWidth: `${String(
              Math.max(
                280,
                widths.reduce((sum, width) => sum + Math.max(36, width * 68), 0)
              )
            )}px`
          }}
        >
          {intervals.map((start, index) => (
            <div
              key={start}
              className="piano-tabs__column"
              data-beat={start}
              data-measure={model.measures.has(start)}
              data-current={index === current}
              ref={index === current ? markerRef : undefined}
              style={{ gridColumn: index + 1, gridRow: "1 / 3" }}
              aria-hidden="true"
            />
          ))}
          {model.events.map((event) => (
            <div
              key={event.id}
              className="piano-tabs__event"
              data-hand={event.hand}
              data-muted={stage !== "both" && stage !== event.hand}
              style={{
                gridColumn: `${String(event.firstColumn)} / ${String(event.lastColumn)}`,
                gridRow: event.hand === "right" ? 1 : 2
              }}
            >
              <div className="piano-tabs__chord">
                {event.notes.map((note) => {
                  const letter = NOTE_LETTERS[((note.pitch % 12) + 12) % 12] ?? "C";
                  const finger = note.finger ?? note.scoreFinger;
                  return (
                    <span
                      key={note.id}
                      className="piano-tabs__note"
                      data-current={note.start <= time && time < note.start + note.duration}
                      aria-label={
                        finger === undefined
                          ? t("Таб {note}", { note: letter })
                          : t("Таб {note}, палец {finger}", { note: letter, finger })
                      }
                    >
                      <span className="piano-tabs__finger" aria-hidden="true">
                        {finger ?? "\u00a0"}
                      </span>
                      <strong aria-hidden="true">{letter}</strong>
                    </span>
                  );
                })}
              </div>
              <span className="piano-tabs__sustain" aria-hidden="true" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
