import { useEffect, useState, useSyncExternalStore } from "react";
import { SongCourseCharacters } from "../ui/SongCourseCharacters";
import { useRuntimeSelector } from "./PlayerRuntimeProvider";

function characterViewport() {
  const tall = window.matchMedia("(min-height: 640px)");
  const portrait = window.matchMedia("(max-width: 1024px) and (orientation: portrait)");
  const desktop = window.matchMedia("(min-width: 1025px)");
  return {
    read: () =>
      tall.matches && (portrait.matches || desktop.matches)
        ? portrait.matches
          ? "portrait"
          : "desktop"
        : "hidden",
    subscribe: (listener: () => void) => {
      for (const media of [tall, portrait, desktop]) media.addEventListener("change", listener);
      return () => {
        for (const media of [tall, portrait, desktop])
          media.removeEventListener("change", listener);
      };
    }
  };
}

/** Only the decoration subscribes to visual changes; the player shell never follows animation frames. */
export function ConnectedSongCourseCharacters() {
  const controller = useRuntimeSelector((runtime) => runtime.songCourse.controller);
  const source = controller.characters;
  const snapshot = useSyncExternalStore(source.subscribe, source.read, source.read);
  const [viewport] = useState(characterViewport);
  const layout = useSyncExternalStore(viewport.subscribe, viewport.read, viewport.read);
  useEffect(() => {
    const update = () => {
      source.setVisible(document.visibilityState !== "hidden");
    };
    update();
    document.addEventListener("visibilitychange", update);
    return () => {
      document.removeEventListener("visibilitychange", update);
      source.setVisible(false);
    };
  }, [source]);
  return (
    <SongCourseCharacters
      companion={snapshot.companion}
      expression={snapshot.expression}
      reactionKey={`${snapshot.presentationId ?? ""}/${snapshot.runId ?? ""}/${snapshot.targetSourceNoteId ?? ""}/${snapshot.expression}`}
      teacherPose={snapshot.teacherPose}
      presentationId={snapshot.presentationId ?? ""}
      onArtError={() => {
        if (snapshot.presentationId) controller.artError(snapshot.presentationId);
      }}
      teacherVisible={layout === "portrait"}
      visible={snapshot.visible && layout !== "hidden"}
    />
  );
}
