import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { onPianoSoundInterrupted } from "../audio/pianoSound";
import { createSongCourseFanfare } from "../audio/songCourseFanfare";
import { courseDisplayRange } from "../songCourse/material";
import { songCourseStaffXml } from "./songCourseStaffXml";
import { useI18n } from "./useI18n";
import { SongCourseSceneArt } from "./songCourseSceneArt";
import { SongCourseController } from "./songCourseController";
import { readingActions } from "./readingSlice";
import { songActions } from "./songSlice";
import { useAppStore } from "./storeHooks";
import type { BeginnerCourse } from "./useBeginnerCourse";

/** Persistent selection and subscriptions only; the controller lends the existing Trainer clock. */
export function useSongCourse(beginner: BeginnerCourse) {
  const { locale } = useI18n();
  const store = useAppStore();
  const [fanfare] = useState(createSongCourseFanfare);
  const [controller] = useState(
    () =>
      new SongCourseController({
        onSelection: () => {
          store.dispatch(readingActions.exit());
          store.dispatch(songActions.beginSongSelection());
        },
        onResult: (result) => {
          fanfare.play(result);
        }
      })
  );
  const view = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot
  );
  useEffect(
    () =>
      onPianoSoundInterrupted(() => {
        controller.soundInterrupted();
      }),
    [controller]
  );
  const [legacyReady, setLegacyReady] = useState(false);
  useEffect(() => {
    void controller.loadProgress();
    let live = true;
    void store.readingPersistenceReady.then(() => {
      if (live) setLegacyReady(true);
    });
    let songRevision = store.getState().song.revision;
    let readingRevision = store.getState().reading.selectionRevision;
    const stop = store.subscribe(() => {
      const next = store.getState();
      const readingChanged = readingRevision !== next.reading.selectionRevision;
      const songChanged = songRevision !== next.song.revision;
      songRevision = next.song.revision;
      readingRevision = next.reading.selectionRevision;
      if ((songChanged || readingChanged) && !controller.isChoosing)
        controller.externalSelection(readingChanged || next.song.lesson !== null);
    });
    return () => {
      live = false;
      stop();
      controller.dispose();
      fanfare.dispose();
    };
  }, [controller, store, fanfare]);
  useEffect(() => {
    if (view.loaded && legacyReady && beginner.loaded)
      controller.restoreInitial(beginner.active || store.getState().reading.activeCourse !== null);
  }, [controller, store, view.loaded, legacyReady, beginner.loaded, beginner.active]);
  const sceneId = controller.sceneId;
  const art = useMemo(
    () => new SongCourseSceneArt(view.material, sceneId),
    [view.material, sceneId]
  );
  useEffect(() => {
    art.activate();
    void art.prepare();
    return () => {
      art.dispose();
    };
  }, [art]);
  const presentation = useMemo(
    () => ({
      id: sceneId,
      songCourseFeedback: controller.faceFeedback,
      readHold: controller.characters.readHold,
      onPresented: (id: string) => {
        if (id !== art.presentationId) return;
        const urls = [
          ...document.querySelectorAll<SVGImageElement>(".song-course-lesson__score svg image")
        ]
          .map((image) => image.getAttribute("href") ?? image.getAttribute("xlink:href"))
          .filter((url): url is string => !!url);
        void art.presented(
          urls,
          () => {
            controller.present(id);
          },
          () => {
            controller.artError(id);
          }
        );
      },
      onError: (id: string) => {
        controller.staffError(id);
      }
    }),
    [controller, sceneId, art]
  );
  const staffXml = useMemo(
    () => (view.material ? songCourseStaffXml(view.material, locale) : null),
    [view.material, locale]
  );
  const displayRange = useMemo(() => {
    if (!view.material) return undefined;
    const { low, high } = courseDisplayRange(view.material);
    return [low, high] as const;
  }, [view.material]);
  return {
    displayRange,
    controller,
    view,
    active: controller.active,
    scene: controller.scene,
    options: controller.options,
    policy: controller.policy,
    progressState: view.progressState,
    loaded: view.loaded,
    storageError: view.storageError,
    hasNext: controller.hasNext,
    canReview: controller.canReview,
    presentation,
    staffXml
  };
}
export type SongCourseHook = ReturnType<typeof useSongCourse>;
