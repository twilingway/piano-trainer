import type { ComponentProps } from "react";
import type { Song } from "../song/song";
import { GameBoard } from "../ui/GameBoard";
import { PlayerTopBar, CompactSongPosition, SongScoreboard } from "../ui/PlayerTopBar";
import { SongProgress } from "../ui/SongProgress";
import { Workspace } from "../ui/Workspace";
import { WordTicker, WordTypingBoard } from "../ui/WordTypingBoard";
import { useSongProgress } from "./useSongProgress";
import { useTrainerSelector, type TrainerSnapshotSource } from "./trainerSnapshots";
import type { TrainerSnapshot } from "../practice/Trainer";
import { ConnectedLanguageBadge } from "./ConnectedLanguageBadge";

interface SourceProps {
  readonly source: TrainerSnapshotSource;
}
const selectTime = (snapshot: TrainerSnapshot | null) => snapshot?.time ?? 0;
const selectBeat = (snapshot: TrainerSnapshot | null) => snapshot?.beat ?? 0;
const selectGame = (snapshot: TrainerSnapshot | null) => snapshot?.stats.game;
const selectNoteResult = (snapshot: TrainerSnapshot | null) => snapshot?.stats.noteResult;
const selectWord = (snapshot: TrainerSnapshot | null) => ({
  time: snapshot?.time ?? -2,
  statuses: snapshot?.noteStatuses
});
const sameWord = (left: ReturnType<typeof selectWord>, right: ReturnType<typeof selectWord>) =>
  left.time === right.time && left.statuses === right.statuses;

export function ConnectedPlayerTopBar({
  source,
  song,
  ...props
}: SourceProps & { readonly song: Song } & Omit<ComponentProps<typeof PlayerTopBar>, "board">) {
  return (
    <PlayerTopBar
      {...props}
      language={<ConnectedLanguageBadge />}
      scoreboard={
        <ConnectedSongPosition source={source} song={song} speed={props.speed} midi={props.midi} />
      }
      compactPosition={
        <ConnectedSongPosition
          source={source}
          song={song}
          speed={props.speed}
          midi={props.midi}
          compact
        />
      }
    />
  );
}
function ConnectedSongPosition({
  source,
  song,
  speed,
  midi,
  compact = false
}: SourceProps & {
  readonly song: Song;
  readonly speed: number;
  readonly midi: string | undefined;
  readonly compact?: boolean;
}) {
  const time = useTrainerSelector(source, selectTime);
  const { board } = useSongProgress(song, time, speed);
  return compact ? (
    <CompactSongPosition board={board} speed={speed} />
  ) : (
    <SongScoreboard board={board} midi={midi} />
  );
}

export function ConnectedSongProgress({
  source,
  song,
  speed,
  onSeek
}: SourceProps & {
  readonly song: Song;
  readonly speed: number;
  readonly onSeek: (beat: number) => void;
}) {
  const time = useTrainerSelector(source, selectTime);
  const { progress, ticks, totalQuarters } = useSongProgress(song, time, speed);
  return (
    <SongProgress
      progress={progress}
      ticks={ticks}
      onSeek={(share) => {
        onSeek(share * totalQuarters);
      }}
    />
  );
}

export function ConnectedWorkspace({
  source,
  ...props
}: SourceProps & Omit<ComponentProps<typeof Workspace>, "beat">) {
  const beat = useTrainerSelector(source, selectBeat);
  return <Workspace {...props} beat={beat} />;
}

export function ConnectedGameBoard({
  source,
  ...props
}: SourceProps & Omit<ComponentProps<typeof GameBoard>, "game" | "noteResult">) {
  const game = useTrainerSelector(source, selectGame);
  const noteResult = useTrainerSelector(source, selectNoteResult);
  return <GameBoard {...props} game={game} noteResult={noteResult} />;
}

export function ConnectedWordBoard({
  source,
  ...props
}: SourceProps & Omit<ComponentProps<typeof WordTypingBoard>, "time" | "statuses">) {
  const { time, statuses } = useTrainerSelector(source, selectWord, sameWord);
  return <WordTypingBoard {...props} time={time} statuses={statuses} />;
}

export function ConnectedWordTicker({
  source,
  ...props
}: SourceProps & Omit<ComponentProps<typeof WordTicker>, "time" | "statuses">) {
  const { time, statuses } = useTrainerSelector(source, selectWord, sameWord);
  return <WordTicker {...props} time={time} statuses={statuses} />;
}
