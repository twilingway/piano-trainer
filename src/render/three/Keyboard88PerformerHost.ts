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
  private wanted = false;
  private generation = 0;

  get ready(): boolean {
    return this.wanted && this.performer !== undefined;
  }

  sync(stage: ThreeStage, keys: KeysScene, hands: HandsLayer): void {
    this.wanted = hands.pianist || hands.container.visible;
    if (!this.wanted) {
      this.clear();
      return;
    }
    if (this.notes !== hands.songNotes) {
      this.clear();
      this.wanted = true;
      this.notes = hands.songNotes;
    }
    if (this.loader.state === "idle") {
      const generation = this.generation;
      void this.loader.load().then((asset) => {
        if (!asset || !this.wanted || generation !== this.generation) return;
        try {
          this.performer = new Keyboard88Performer(asset);
        } catch (error) {
          this.loader.cancel();
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

  pose(source: HandsSource | undefined): void {
    if (this.ready) this.performer?.pose(source);
  }

  clear(): void {
    if (!this.wanted && !this.performer && this.loader.state === "idle") return;
    this.generation++;
    this.wanted = false;
    if (this.performer) {
      this.stage?.removeFromKeys(this.performer.space);
      this.performer.dispose();
    }
    this.performer = undefined;
    this.stage = undefined;
    this.notes = undefined;
    this.loader.cancel();
  }

  dispose(): void {
    this.clear();
    this.loader.dispose();
  }
}
