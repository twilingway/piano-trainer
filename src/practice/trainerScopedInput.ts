import type { KeyEvent } from "../input/midiInput";
import type { PracticeEvent, PracticeSession } from "./session";
import type { CourseKeyContext, KeyTimes } from "./trainerCourse";

interface ScopedRoute {
  /** The app's interceptor sees the event first. */
  readonly intercepts: boolean;
  readonly onInput: (session: PracticeSession, playing: boolean, times: KeyTimes) => void;
  readonly step: (
    session: PracticeSession,
    playing: boolean,
    atMs: number
  ) => readonly PracticeEvent[];
}

/** Courses in waiting mode keep their verified-commit path separate from tempo observers. */
export function processScopedKey(
  event: KeyEvent,
  context: CourseKeyContext,
  route: ScopedRoute
): void {
  if (route.intercepts && context.intercept(event)) return;
  if (!context.admits(event)) return;
  const times = context.times(event);
  if (!times) return;
  if (event.type === "down") context.pressed.add(event.pitch);
  else context.pressed.delete(event.pitch);
  const session = context.session;
  if (session) {
    const playing = context.playing();
    if (playing) context.apply(session.tick(times.received));
    route.onInput(session, playing, times);
    context.apply(route.step(session, playing, times.received));
  }
  context.publish();
}
