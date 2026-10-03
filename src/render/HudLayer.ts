import { Container, FillGradient, Sprite, Text, Texture } from "pixi.js";
import type { TextStyleOptions } from "pixi.js";

import type { ComboBoard, GradedStrike, StrikeGrade } from "../practice/combo";

/** What each grade says over its key, and in what colour. */
const GRADES: Readonly<Record<StrikeGrade, { readonly label: string; readonly color: number }>> = {
  perfect: { label: "Идеально!", color: 0x00e5ff },
  great: { label: "Отлично", color: 0x00ff7b },
  good: { label: "Хорошо", color: 0xffee00 },
  ok: { label: "Зачтено", color: 0xff9d00 },
  early: { label: "Рано", color: 0xffee00 },
  late: { label: "Поздно", color: 0xff9d00 },
  miss: { label: "Мимо", color: 0xff2454 }
};
/** How long a grade stays up, and how far it rises meanwhile. */
const POP_S = 0.75;
const POP_RISE_PX = 36;
/** The grade swells at first, then settles: this long, from this scale. */
const POP_SWELL_S = 0.12;
const POP_SWELL = 1.35;
const DISPLAY_FONT = "'Russo One', system-ui, sans-serif";
const BOARD_MARGIN_PX = 24;
const MIN_BOARD_SCALE = 0.55;
const FULL_BOARD_WIDTH_PX = 1600;
const ACCENT = 0x3fd6ff;
/** The divider under the combo, and how wide the board is. */
const BOARD_WIDTH_PX = 190;

function glowing(color: number, size: number): TextStyleOptions {
  return {
    fontFamily: DISPLAY_FONT,
    fontSize: size,
    fill: color,
    dropShadow: { color, blur: 10, distance: 0, alpha: 0.8 }
  };
}

/*
 * The board after the approved mockup: a white italic title, a big italic
 * number shading from ice blue to deep blue, a thin divider, then the
 * accuracy in white with its figure in the accent.
 */
const TITLE_STYLE: TextStyleOptions = {
  fontFamily: DISPLAY_FONT,
  fontSize: 34,
  fontStyle: "italic",
  // Canvas measures italic text upright: the slant and the stroke need room or they are cut.
  padding: 16,
  fill: 0xffffff,
  stroke: { color: 0x0b1a33, width: 4 },
  dropShadow: { color: 0x000000, blur: 6, distance: 2, alpha: 0.6 }
};
const NUMBER_STYLE: TextStyleOptions = {
  fontFamily: DISPLAY_FONT,
  fontSize: 84,
  fontStyle: "italic",
  // Canvas measures italic text upright: the slant and the stroke need room or they are cut.
  padding: 16,
  fill: new FillGradient({
    type: "linear",
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
    colorStops: [
      { offset: 0, color: 0xc8f7ff },
      { offset: 0.45, color: 0x48d8ff },
      { offset: 1, color: 0x1477ff }
    ],
    textureSpace: "local"
  }),
  stroke: { color: 0x071a3a, width: 5 },
  dropShadow: { color: ACCENT, blur: 18, distance: 0, alpha: 0.7 }
};
const ACCURACY_LABEL_STYLE: TextStyleOptions = {
  fontFamily: "Manrope, system-ui, sans-serif",
  fontSize: 20,
  fontWeight: "700",
  fill: 0xffffff,
  dropShadow: { color: 0x000000, blur: 4, distance: 1, alpha: 0.6 }
};
const ACCURACY_VALUE_STYLE: TextStyleOptions = {
  fontFamily: DISPLAY_FONT,
  fontSize: 30,
  fill: ACCENT,
  dropShadow: { color: ACCENT, blur: 12, distance: 0, alpha: 0.7 }
};

interface Pop {
  readonly text: Text;
  age: number;
  baseY: number;
}

/**
 * The game's heads-up display over the view: the combo and accuracy board at
 * the lane's corner, and each strike's grade rising over its key at the hit
 * line. The labels are Text objects made once and reused, so a grade costs no
 * new texture.
 */
export class HudLayer {
  readonly container = new Container();
  private readonly board = new Container();
  private readonly comboTitle = new Text({ text: "КОМБО", style: TITLE_STYLE });
  private readonly comboValue = new Text({ text: "0", style: NUMBER_STYLE });
  private readonly divider = new Sprite(Texture.WHITE);
  private readonly accuracyLabel = new Text({ text: "точность", style: ACCURACY_LABEL_STYLE });
  private readonly accuracy = new Text({ text: "", style: ACCURACY_VALUE_STYLE });
  private readonly pops = new Container();
  private readonly active: Pop[] = [];
  private readonly spare = new Map<StrikeGrade, Text[]>();
  private shown = { combo: -1, accuracy: -1 };

  constructor() {
    this.container.eventMode = "none";
    this.comboValue.position.set(-4, 26);
    this.divider.tint = 0x7fdcff;
    this.divider.alpha = 0.7;
    this.divider.position.set(0, 126);
    this.divider.width = BOARD_WIDTH_PX;
    this.divider.height = 1.5;
    this.accuracyLabel.position.set(4, 138);
    this.accuracy.y = 131;
    this.board.addChild(
      this.comboTitle,
      this.comboValue,
      this.divider,
      this.accuracyLabel,
      this.accuracy
    );
    this.board.position.set(BOARD_MARGIN_PX, BOARD_MARGIN_PX);
    this.board.visible = false;
    this.container.addChild(this.board, this.pops);
    // A web font that arrives after the board was drawn: draw it again in the right face.
    const redraw = () => {
      // A view torn down (React mounts it twice in development) lets go of the fonts.
      if (this.container.destroyed) {
        document.fonts.removeEventListener("loadingdone", redraw);
        return;
      }
      for (const text of [this.comboTitle, this.comboValue, this.accuracyLabel, this.accuracy]) {
        text.style.update();
      }
    };
    document.fonts.addEventListener("loadingdone", redraw);
  }

  /**
   * One frame: the board (hidden without one), new grades at `keyX` of their
   * key on the line at `hitY`, and every grade up aged by `deltaSeconds`.
   */
  draw(
    board: ComboBoard | undefined,
    graded: readonly GradedStrike[],
    keyX: (pitch: number) => number | undefined,
    hitY: number,
    deltaSeconds: number
  ): void {
    this.drawBoard(board);
    for (const strike of graded) {
      const x = keyX(strike.pitch);
      if (x !== undefined) this.pop(strike.grade, x, hitY);
    }
    for (let index = this.active.length - 1; index >= 0; index--) {
      const pop = this.active[index];
      if (!pop) continue;
      pop.age += deltaSeconds;
      const share = pop.age / POP_S;
      if (share >= 1) {
        this.retire(index);
        continue;
      }
      const swell = Math.max(0, 1 - pop.age / POP_SWELL_S);
      pop.text.scale.set(1 + (POP_SWELL - 1) * swell);
      pop.text.y = pop.baseY - POP_RISE_PX * share;
      // Full for the first half, then gone by the end.
      pop.text.alpha = Math.min(1, 2 * (1 - share));
    }
  }

  /** Clears every grade still up: a new song or a seek starts the picture over. */
  clear(): void {
    for (let index = this.active.length - 1; index >= 0; index--) this.retire(index);
  }

  /** Keep the board inside the note lane, away from the keys on small screens. */
  layout(width: number, noteHeight: number, top = 0): void {
    const widthScale = Math.max(MIN_BOARD_SCALE, width / FULL_BOARD_WIDTH_PX);
    const scale = Math.max(0, Math.min(1, widthScale, width / 640, (noteHeight - top - 8) / 194));
    this.board.scale.set(scale);
    const margin = BOARD_MARGIN_PX * scale;
    this.board.position.set(margin, top + (scale < 1 ? Math.max(margin, 34) : margin));
  }

  private drawBoard(board: ComboBoard | undefined): void {
    this.board.visible = board !== undefined;
    if (!board) return;
    // Text re-renders its texture on every change: only when the numbers move.
    if (board.combo !== this.shown.combo) {
      this.comboValue.text = String(board.combo);
      this.shown.combo = board.combo;
    }
    const percent = Math.round(board.accuracy * 100);
    if (percent !== this.shown.accuracy) {
      this.accuracy.text = `${String(percent)}%`;
      this.accuracy.x = this.accuracyLabel.x + this.accuracyLabel.width + 8;
      this.shown.accuracy = percent;
    }
  }

  private pop(grade: StrikeGrade, x: number, hitY: number): void {
    const text = this.spare.get(grade)?.pop() ?? this.make(grade);
    text.position.set(x, hitY - 8);
    text.alpha = 1;
    text.visible = true;
    this.active.push({ text, age: 0, baseY: hitY - 8 });
  }

  private make(grade: StrikeGrade): Text {
    const { label, color } = GRADES[grade];
    const text = new Text({ text: label, style: { ...glowing(color, 22), fontWeight: "700" } });
    text.anchor.set(0.5, 1);
    text.label = grade;
    this.pops.addChild(text);
    return text;
  }

  private retire(index: number): void {
    const [pop] = this.active.splice(index, 1);
    if (!pop) return;
    pop.text.visible = false;
    const grade = pop.text.label as StrikeGrade;
    const spare = this.spare.get(grade) ?? [];
    spare.push(pop.text);
    this.spare.set(grade, spare);
  }
}
