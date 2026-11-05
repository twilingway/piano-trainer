import type { TrainerMusicPolicy } from "../practice/musicPolicy";
import type { SongCourseCharacters } from "./songCourseCharacters";
import type { SongCourseInput } from "./songCourseInput";

export function createSongCourseCharacterPolicy(
  input: SongCourseInput,
  onFrame: TrainerMusicPolicy["onFrame"],
  cancel: TrainerMusicPolicy["cancel"],
  guidance: TrainerMusicPolicy["guidance"],
  characters: SongCourseCharacters
): TrainerMusicPolicy {
  return withSongCourseCharacters(
    {
      inputCompensationMs: () => 500,
      onStart: (session, atMs, held) => input.start(session, atMs, held),
      onFrame,
      onInput: (event, session, playing, times) => input.key(event, session, playing, times),
      seedHeld: (held) => {
        input.seed(held);
      },
      cancel,
      guidance
    },
    characters
  );
}

/** Preserve the original policy's return values and grading; observe its accepted events only. */
export function withSongCourseCharacters(
  policy: TrainerMusicPolicy,
  characters: SongCourseCharacters
): TrainerMusicPolicy {
  return {
    ...policy,
    onStart(session, atMs, held) {
      const started = policy.onStart(session, atMs, held);
      if (started) characters.bind(session);
      else characters.cancel();
      return started;
    },
    onFrame(session, playing, atMs) {
      const events = policy.onFrame(session, playing, atMs);
      characters.frame(session, playing);
      return events;
    },
    onInput(event, session, playing, times) {
      const events = policy.onInput(event, session, playing, times);
      characters.key(event, session, playing, times, events);
      return events;
    },
    seedHeld(events, atMs) {
      policy.seedHeld(events, atMs);
      characters.cancel();
    },
    cancel(atMs, resetAll, reason) {
      policy.cancel(atMs, resetAll, reason);
      characters.cancel();
    }
  };
}
