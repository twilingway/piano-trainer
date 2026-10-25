import { createPhrasePreview } from "../audio/phrasePreview";
import type { PhrasePreview } from "../audio/phrasePreview";
import type { MusicControllerState } from "./musicCourseControllerView";
import { musicReferenceMaterial } from "./musicCourseExercise";

/** Owns only finite reference playback; all song positions still come from PracticeSession. */
export class MusicControllerAudio {
  private preview: PhrasePreview | null = null;
  private sequence = 0;
  activate(owner: string): void {
    this.preview ??= createPhrasePreview(owner);
  }
  dispose(): void {
    this.preview?.dispose();
    this.preview = null;
  }
  cancel(): void {
    this.preview?.cancel();
  }
  listen(state: MusicControllerState, current: () => boolean, publish: () => void): void {
    const run = state.run;
    const activity = state.activity;
    const identity = state.identity;
    if (!run || !activity || !identity || !this.preview || !run.listeningSummary().canListen)
      return;
    const playbackId = `${identity.runId}:audio:${String(++this.sequence)}`;
    const send = (kind: "request" | "first-sound" | "complete" | "interrupt") => {
      if (current())
        run.receiveListening({
          kind,
          presentationId: identity.presentationId,
          playbackId,
          atMs: performance.now()
        });
    };
    if (run.listeningSummary().started > 0 && activity.purpose === "training")
      run.addHelp({ kind: "replay", atMs: performance.now() });
    send("request");
    state.status = "listening";
    state.feedback = undefined;
    publish();
    void this.preview
      .play({
        ...identity,
        playbackId,
        material: musicReferenceMaterial(activity),
        onStarted: () => {
          if (current()) {
            run.presented(performance.now(), "audio");
            send("first-sound");
            publish();
          }
        },
        onCompleted: () => {
          if (current()) {
            send("complete");
            state.status = run.snapshot().started ? "paused" : "ready";
            publish();
          }
        },
        onCancelled: () => {
          if (current()) {
            send("interrupt");
            state.status = run.snapshot().started ? "paused" : "ready";
            publish();
          }
        },
        onError: () => {
          if (current()) {
            send("interrupt");
            state.status = run.snapshot().started ? "paused" : "ready";
            state.feedback =
              "Звук недоступен. Повторите включение или выберите зрительную тренировку.";
            publish();
          }
        }
      })
      .catch(() => {
        if (!current()) return;
        send("interrupt");
        state.status = "ready";
        state.feedback = "Звук недоступен. Повторите включение или выберите зрительную тренировку.";
        publish();
      });
  }
}
