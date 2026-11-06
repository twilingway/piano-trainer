import hotCrossBuns from "./scores/hot-cross-buns.musicxml?raw";
import auntRhody from "./scores/aunt-rhody.musicxml?raw";
import lightlyRow from "./scores/lightly-row.musicxml?raw";
import odeToJoy from "./scores/ode-to-joy.musicxml?raw";
import twinkle from "./scores/twinkle.musicxml?raw";
import joyOctave from "./scores/joy-octave.musicxml?raw";
import scoreManifest from "./scores/manifest.json";
import { findSourceCourseNode } from "./nodeIdentity";
import type {
  SongCourseNode,
  SongCourseNodeKind,
  SongCoursePhrase,
  SongCourseSource
} from "./model";

interface SourceDefinition {
  readonly id: string;
  readonly title: string;
  readonly xml: string;
  readonly phraseMeasures: number;
}
interface ScoreMetadata {
  readonly sha256: string;
  readonly learnerNoteIdsByMeasure: readonly (readonly string[])[];
}

function sourceFor(definition: SourceDefinition): SongCourseSource {
  const { id, title, xml, phraseMeasures } = definition;
  const provenance = (scoreManifest as Readonly<Record<string, ScoreMetadata | undefined>>)[id];
  if (!provenance) throw new Error("song-course-missing-source-hash");
  const measures = provenance.learnerNoteIdsByMeasure;
  const ids = (from: number, to: number) => measures.slice(from, to).flat();
  const phrases: SongCoursePhrase[] = [];
  for (let from = 0; from < measures.length; from += phraseMeasures) {
    const to = Math.min(from + phraseMeasures, measures.length);
    phrases.push({
      id: `${id}/phrase-${String(phrases.length + 1)}`,
      fromMeasure: from,
      toMeasure: to,
      sourceNoteIds: ids(from, to)
    });
  }
  const node = (
    suffix: string,
    kind: SongCourseNodeKind,
    nodeTitle: string,
    instruction: string,
    from: number,
    to: number
  ): SongCourseNode => {
    const sourceNoteIds = ids(from, to);
    return {
      id: `${id}/${suffix}`,
      songId: id,
      kind,
      title: nodeTitle,
      instruction,
      sourceNoteIds,
      phraseIds: phrases
        .filter((phrase) => phrase.sourceNoteIds.some((noteId) => sourceNoteIds.includes(noteId)))
        .map((phrase) => phrase.id)
    };
  };
  const intros: SongCourseNode[] = [];
  const legacyNodes: SongCourseNode[] = [];
  if (id === "hot-cross-buns") {
    intros.push(
      node(
        "notes-c",
        "notes",
        "Изучаем ноту До",
        "Нажимай До большим пальцем правой руки. Держи клавишу до конца дорожки.",
        4,
        5
      ),
      node(
        "notes-d",
        "notes",
        "Изучаем ноту Ре",
        "Нажимай Ре указательным пальцем правой руки. Держи клавишу до конца дорожки.",
        5,
        6
      ),
      {
        ...node(
          "notes-e-quarter-v1",
          "notes",
          "Изучаем ноту Ми",
          "Нажимай Ми средним пальцем правой руки. Держи клавишу до конца дорожки.",
          0,
          1
        ),
        sourceNoteIds: ["hot-cross-buns-m1-n1"],
        repeat: { originNoteId: "hot-cross-buns-m1-n1", count: 4, duration: "quarter" }
      },
      node(
        "notes-e",
        "notes",
        "Играем До, Ре и Ми",
        "Ми — средним пальцем, ре — указательным, до — большим. Держи каждую клавишу, пока дорожка не заполнится, затем отпусти.",
        0,
        2
      ),
      node(
        "quarter",
        "duration",
        "Изучаем четвертные ноты",
        "Каждая четверть длится одну долю. Держите клавишу до конца звука, затем отпускайте.",
        4,
        5
      ),
      node(
        "half",
        "duration",
        "Удерживаем ноту дольше",
        "Половинная нота пустая внутри и со штилем. Удерживайте каждую клавишу две доли.",
        0,
        1
      ),
      node(
        "whole",
        "duration",
        "Играем самые длинные ноты",
        "Целая нота пустая внутри и без штиля. Удерживайте до четыре доли.",
        1,
        2
      )
    );
    legacyNodes.push({
      ...node(
        "notes-e-intro",
        "notes",
        "Изучаем ноту Ми",
        "Ми играет средний палец правой руки. Держи клавишу, пока дорожка не заполнится, затем отпусти.",
        0,
        1
      ),
      sourceNoteIds: ["hot-cross-buns-m1-n1"],
      supersededBy: "hot-cross-buns/notes-e-quarter-v1"
    });
    legacyNodes.push({
      ...node(
        "notes-e-repeat-v1",
        "notes",
        "Изучаем ноту Ми",
        "Нажимай Ми средним пальцем правой руки. Держи клавишу до конца дорожки.",
        0,
        1
      ),
      sourceNoteIds: ["hot-cross-buns-m1-n1"],
      repeat: { originNoteId: "hot-cross-buns-m1-n1", count: 4, duration: "half" },
      supersededBy: "hot-cross-buns/notes-e-quarter-v1"
    });
  }
  if (id === "aunt-rhody")
    intros.push(
      node(
        "notes-f",
        "notes",
        "Изучаем ноту Фа",
        "Фа играет безымянный палец правой руки. Сыграйте знакомые ре и новую фа.",
        2,
        3
      )
    );
  if (id === "lightly-row")
    intros.push(
      node(
        "notes-g",
        "notes",
        "Изучаем ноту Соль",
        "Соль играет мизинец правой руки. Найдите соль и вернитесь к знакомой ми.",
        0,
        1
      )
    );
  if (id === "twinkle")
    intros.push(
      node(
        "notes-a",
        "notes",
        "Изучаем ноту Ля",
        "На повторной соль смените пятый палец на четвёртый, затем сыграйте ля пятым. Не растягивайте руку.",
        0,
        2
      )
    );
  if (id === "joy-octave")
    intros.push(
      node(
        "upper-c-b",
        "notes",
        "Изучаем Си и верхнюю До",
        "Начните с верхней до пятым пальцем и спускайтесь по соседним клавишам. Следуйте пальцам в нотах.",
        0,
        2
      ),
      node(
        "dotted",
        "duration",
        "Точка продлевает звук",
        "Точка добавляет половину длительности. Удерживайте ноту до конца её звучания.",
        0,
        2
      ),
      node(
        "eighth",
        "duration",
        "Изучаем восьмые ноты",
        "Восьмая со флажком длится половину доли. Сравните короткую ля с длинными соседними звуками.",
        0,
        1
      ),
      node(
        "thumb-turn",
        "notes",
        "Проходим октаву без растяжки",
        "После фа первым пальцем перенесите третий на ми, затем сыграйте ре и до. Кисть остаётся свободной.",
        1,
        4
      )
    );
  const guided = phrases.map((phrase, index) =>
    node(
      `guided-${String(index + 1)}`,
      "guided-phrase",
      "Играем с Твили",
      "Сначала послушай Твили, затем сыграй сам. Цвет и названия нот помогут.",
      phrase.fromMeasure,
      phrase.toMeasure
    )
  );
  const independent = phrases.map((phrase, index) =>
    node(
      `independent-${String(index + 1)}`,
      "independent-phrase",
      "Играем самостоятельно",
      "Сыграй знакомую мелодию без подсказок. Удерживай каждую ноту до конца.",
      phrase.fromMeasure,
      phrase.toMeasure
    )
  );
  const performance = node(
    "performance",
    "performance",
    id === "joy-octave" ? "Играем всю мелодию" : "Играем всю мелодию",
    "После четырёх ударов сыграй всю мелодию вместе с музыкой.",
    0,
    measures.length
  );
  const sourceHash = provenance.sha256;
  return {
    id,
    revision: "1",
    sourceHash,
    title,
    musicXml: xml,
    learnerPartIds: ["learner"],
    accompanimentPartIds: ["accompaniment"],
    partHands: [
      { partId: "learner", staff: "1", hand: "right" },
      { partId: "accompaniment", staff: "1", hand: "left" }
    ],
    phrases,
    nodes: [...intros, ...guided, ...independent, performance],
    legacyNodes
  };
}

/** Russian metadata are source keys; the UI translates them at its presentation boundary. */
export const SONG_COURSE_SOURCES: readonly SongCourseSource[] = [
  { id: "hot-cross-buns", title: "Горячие булочки", xml: hotCrossBuns, phraseMeasures: 2 },
  { id: "aunt-rhody", title: "Тётушка Роди", xml: auntRhody, phraseMeasures: 2 },
  { id: "lightly-row", title: "Лодочка", xml: lightlyRow, phraseMeasures: 4 },
  { id: "ode-to-joy", title: "Ода к радости — учебная тема", xml: odeToJoy, phraseMeasures: 4 },
  { id: "twinkle", title: "Звёздочка", xml: twinkle, phraseMeasures: 4 },
  { id: "joy-octave", title: "Радость миру — начальный мотив", xml: joyOctave, phraseMeasures: 2 }
].map(sourceFor);

export function findSongCourseSource(songId: string): SongCourseSource | undefined {
  return SONG_COURSE_SOURCES.find((source) => source.id === songId);
}

export function findSongCourseNode(songId: string, nodeId: string): SongCourseNode | undefined {
  const source = findSongCourseSource(songId);
  return source ? findSourceCourseNode(source, nodeId) : undefined;
}

export const SONG_COURSE_SOURCE_KEYS: readonly string[] = Array.from(
  new Set(
    SONG_COURSE_SOURCES.flatMap((source) => [
      source.title,
      ...source.nodes.flatMap((node) => [node.title, node.instruction])
    ]).concat([
      "Повторяем трудную фразу",
      "Сыграйте трудное место ещё раз, сохраняя ритм и длину звуков."
    ])
  )
);
