import type { KeysScene } from "../PerspectiveKeyboardLayer";
import type { HandsLayer } from "../HandsLayer";
import type { ThreeStage } from "./ThreeStage";
import type { HandsSource } from "./liveHands";
import { Keyboard88PerformerLoader } from "./keyboard88Loader";
import { Keyboard88Performer } from "./Keyboard88Performer";

/** Lifetime of one public model, independent of the DEV-only private pianist path. */
export class Keyboard88PerformerHost {
  private readonly loader = new Keyboard88PerformerLoader();
  private performer: Keyboard88Performer | undefined;
  private stage: ThreeStage | undefined;
  private notes: HandsSource["notes"] | undefined;
  private hands: HandsLayer | undefined;
  private unsubscribeSong: (() => void) | undefined;
  private manifestUrl: string | undefined;
  private sourceChanged = false;
  private wanted = false;
  private generation = 0;

  get ready(): boolean {
    return this.wanted && this.performer !== undefined;
  }

  sync(stage: ThreeStage, keys: KeysScene, hands: HandsLayer): void {
    if (this.hands !== hands) {
      this.unsubscribeSong?.();
      this.hands = hands;
      this.unsubscribeSong = hands.subscribeSong(this.setSong);
      this.setSong(hands.songNotes);
    }
    this.wanted = hands.pianist || hands.container.visible;
    if (!this.wanted) {
      this.performer?.setVisibility(false, false);
      return;
    }
    if (this.loader.state === "idle" || this.sourceChanged) {
      this.sourceChanged = false;
      const generation = this.generation;
      void this.loader.load(this.manifestUrl).then((asset) => {
        if (!asset || generation !== this.generation) return;
        try {
          this.performer = new Keyboard88Performer(asset);
          this.performer.setSong(this.notes);
          this.performer.setVisibility(false, false);
        } catch (error) {
          this.performer?.dispose();
          this.performer = undefined;
          this.loader.fail(error);
          console.warn("keyboard88 performer unavailable", error);
        }
      });
    }
    if (!this.performer) return;
    if (this.stage !== stage) {
      this.stage?.removeFromKeys(this.performer.space);
      stage.addToKeys(this.performer.space);
      this.stage = stage;
    }
    this.performer.setVisibility(hands.pianist, hands.container.visible);
    this.performer.follow(keys);
  }

  private readonly setSong = (notes: HandsSource["notes"]): void => {
    this.notes = notes;
    this.performer?.setSong(notes);
  };

  setAssetSource(manifestUrl?: string): void {
    if (manifestUrl === this.manifestUrl) return;
    this.clear();
    this.manifestUrl = manifestUrl;
    this.sourceChanged = true;
  }

  pose(source: HandsSource | undefined, separateCameras: boolean): void {
    if (!this.ready) return;
    this.performer?.setSeparateCameras(separateCameras);
    this.performer?.pose(source);
  }

  clear(): void {
    this.generation++;
    this.wanted = false;
    if (this.performer) {
      this.stage?.removeFromKeys(this.performer.space);
      this.performer.dispose();
    }
    this.performer = undefined;
    this.stage = undefined;
    this.notes = undefined;
    this.unsubscribeSong?.();
    this.unsubscribeSong = undefined;
    this.hands = undefined;
    this.loader.cancel();
  }

  dispose(): void {
    this.clear();
    this.loader.dispose();
  }
}
