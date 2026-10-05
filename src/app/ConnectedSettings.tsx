import type { ComponentProps } from "react";
import type { TrainerSnapshot } from "../practice/Trainer";
import { ResultDialog } from "../ui/ResultDialog";
import { TimingSettings } from "../ui/TimingSettings";
import { PlaySettings } from "../ui/settings/PlaySettings";
import { PlayerSettings } from "../ui/settings/PlayerSettings";
import { useTrainerSelector, type TrainerSnapshotSource } from "./trainerSnapshots";

interface SourceProps {
  readonly source: TrainerSnapshotSource;
}
const selectStats = (snapshot: TrainerSnapshot | null) => snapshot?.stats;
const selectDiagnostic = (snapshot: TrainerSnapshot | null) => snapshot?.diagnostic;
type SettingsProps = Omit<ComponentProps<typeof PlayerSettings>, "play"> & {
  readonly play: Omit<ComponentProps<typeof PlayerSettings>["play"], "stats">;
};

export function ConnectedPlayerSettings({ source, ...props }: SourceProps & SettingsProps) {
  return (
    <PlayerSettings
      {...props}
      play={{ ...props.play, stats: undefined }}
      playContent={<ConnectedPlaySettings source={source} {...props.play} />}
    />
  );
}
function ConnectedPlaySettings({
  source,
  ...props
}: SourceProps & Omit<ComponentProps<typeof PlaySettings>, "stats">) {
  const stats = useTrainerSelector(source, selectStats);
  return <PlaySettings {...props} stats={stats} />;
}

export function ConnectedResultDialog({
  source,
  ...props
}: SourceProps & Omit<ComponentProps<typeof ResultDialog>, "stats">) {
  return props.open ? <LiveResultDialog source={source} {...props} /> : null;
}
function LiveResultDialog({
  source,
  ...props
}: SourceProps & Omit<ComponentProps<typeof ResultDialog>, "stats">) {
  const stats = useTrainerSelector(source, selectStats);
  return <ResultDialog {...props} stats={stats} />;
}

export function ConnectedTimingSettings({
  source,
  ...props
}: SourceProps & Omit<ComponentProps<typeof TimingSettings>, "diagnostic">) {
  const diagnostic = useTrainerSelector(source, selectDiagnostic);
  return <TimingSettings {...props} {...(diagnostic ? { diagnostic } : {})} />;
}
