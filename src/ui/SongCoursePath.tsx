import { useContext, useLayoutEffect, useRef, useState } from "react";
import { validSongCourseResult } from "../songCourse/progress";
import { songCourseEvidenceMatchesNode } from "../songCourse/evidenceProof";
import { WindowDisclosureContext } from "./windowDisclosureContext";
import { useI18n } from "../app/useI18n";
import type {
  SongCourseNode,
  SongCourseResult,
  SongCourseSelection,
  SongCourseSource
} from "../songCourse/model";
import assistant from "./lesson-art/assistant.webp";
import { SongCourseMiniature } from "./SongCourseMiniature";

export interface SongCoursePathProps {
  readonly sources: readonly SongCourseSource[];
  readonly selection: SongCourseSelection | null;
  readonly results: readonly SongCourseResult[];
  readonly onChoose: (songId: string, nodeId: string) => void;
  readonly pending?: boolean;
  readonly error?: string | null;
  readonly onLegacy?: () => void;
}

function bestResult(
  source: SongCourseSource,
  node: SongCourseNode,
  results: readonly SongCourseResult[]
) {
  return results
    .filter(
      (r) =>
        r.valid &&
        r.completed &&
        r.rubricVariant === "normal" &&
        r.songId === source.id &&
        r.sourceRevision === source.revision &&
        r.sourceHash === source.sourceHash &&
        r.nodeId === node.id &&
        validSongCourseResult(r) &&
        songCourseEvidenceMatchesNode(r, source, node)
    )
    .sort((a, b) => b.stars - a.stars || b.createdAt - a.createdAt)[0];
}

export function SongCoursePath(props: SongCoursePathProps) {
  const { t } = useI18n();
  const entries = props.sources.flatMap((source) =>
    source.nodes.map((node) => ({ source, node, result: bestResult(source, node, props.results) }))
  );
  const completed = entries.filter((entry) => entry.result).length;
  const selectedEntries = entries.filter(
    (entry) =>
      entry.source.id === props.selection?.songId &&
      entry.source.revision === props.selection.sourceRevision &&
      entry.source.sourceHash === props.selection.sourceHash
  );
  const next =
    selectedEntries.find((entry) => !entry.result) ??
    entries.find((entry) => !entry.result) ??
    entries.find((entry) => entry.node.kind === "performance");
  return (
    <section className="song-course-path" aria-label={t("Путь по учебным мелодиям")}>
      <header className="song-course-path__heading">
        <span>{t("УЧИМСЯ ИГРАЯ")}</span>
        <h2>{t("По нотам — к целой песне")}</h2>
        <p>{t("Короткие этапы и концерт в конце каждой мелодии.")}</p>
      </header>
      {next && (
        <div className="song-course-path__welcome">
          <div>
            <span className="song-course-path__eyebrow">{t("СЛЕДУЮЩИЙ ЭТАП ПЕСНИ")}</span>
            <h3>{t(next.source.title)}</h3>
            <p>{t(next.node.title)}</p>
            <button
              type="button"
              className="game-button song-course-primary"
              disabled={props.pending}
              onClick={() => {
                props.onChoose(next.source.id, next.node.id);
              }}
            >
              {t("Продолжить мелодию")} <span aria-hidden="true">→</span>
            </button>
          </div>
          <img src={assistant} alt="" draggable={false} />
        </div>
      )}
      {props.error && (
        <p role="alert" className="song-course-error">
          {t(props.error)}
        </p>
      )}
      <div className="song-course-path__completion">
        <span>
          {t("Этапов завершено: {done} из {total}", { done: completed, total: entries.length })}
        </span>
        <progress
          value={completed}
          max={Math.max(1, entries.length)}
          aria-label={t("Завершённые этапы песен")}
        />
      </div>
      {props.sources.map((source, index) => (
        <SongCourseGroup
          key={source.id}
          source={source}
          selection={props.selection}
          results={props.results}
          pending={props.pending === true}
          defaultOpen={!props.selection && index === 0}
          onChoose={props.onChoose}
        />
      ))}
      {props.onLegacy && (
        <button
          type="button"
          className="game-button song-course-path__legacy"
          onClick={props.onLegacy}
        >
          {t("Открыть отдельные упражнения")}
        </button>
      )}
    </section>
  );
}

function SongCourseGroup(props: {
  readonly source: SongCourseSource;
  readonly selection: SongCourseSelection | null;
  readonly results: readonly SongCourseResult[];
  readonly pending: boolean;
  readonly defaultOpen: boolean;
  readonly onChoose: (songId: string, nodeId: string) => void;
}) {
  const { t } = useI18n();
  const { source } = props;
  const memory = useContext(WindowDisclosureContext);
  const selected =
    props.selection?.songId === source.id &&
    props.selection.sourceRevision === source.revision &&
    props.selection.sourceHash === source.sourceHash;
  const [open, setOpen] = useState(selected || props.defaultOpen);
  const element = useRef<HTMLDetailsElement>(null);
  useLayoutEffect(() => {
    if (!element.current) return;
    memory?.restoreDetails("body", element.current.parentElement ?? element.current);
    setOpen(element.current.open);
  }, [memory]);
  const done = source.nodes.filter((node) => bestResult(source, node, props.results)).length;
  return (
    <details
      className="song-course-path__group"
      ref={element}
      data-window-detail={`song-course:${source.id}`}
      open={open}
      onToggle={(event) => {
        memory?.captureDetails("body", event.currentTarget.parentElement ?? event.currentTarget);
        setOpen(event.currentTarget.open);
      }}
    >
      <summary className="song-course-path__group-toggle">
        <span>{t(source.title)}</span>
        <small>
          {t("Этапов завершено: {done} из {total}", { done, total: source.nodes.length })}
        </small>
        <span aria-hidden="true">{open ? "−" : "+"}</span>
      </summary>
      {open && (
        <ol className="song-course-path__trail">
          {source.nodes.map((node, index) => {
            const result = bestResult(source, node, props.results);
            const current = selected && props.selection.nodeId === node.id;
            return (
              <li key={node.id}>
                <button
                  type="button"
                  className="song-course-path__node"
                  disabled={props.pending}
                  data-state={current ? "current" : result ? "complete" : "upcoming"}
                  aria-current={current ? "step" : undefined}
                  onClick={() => {
                    props.onChoose(source.id, node.id);
                  }}
                >
                  <SongCourseMiniature source={source} node={node} />
                  <span className="song-course-path__node-copy">
                    <small>{t("Этап песни {number}", { number: index + 1 })}</small>
                    <strong>{t(node.title)}</strong>
                    <span>{t(node.instruction)}</span>
                    {result && (
                      <span
                        className="song-course-path__stars"
                        aria-label={t("Звёзд за этап: {count} из 3", { count: result.stars })}
                      >
                        {"★".repeat(result.stars)}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </details>
  );
}
