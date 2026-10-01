import { Container, Text } from "pixi.js";
import type { TextStyleOptions } from "pixi.js";

import type { ComboBoard, GradedStrike, StrikeGrade } from "../practice/combo";

/** What each grade says over its key, and in what colour. */
const GRADES: Readonly<Record<StrikeGrade, { readonly label: string; readonly color: number }>> = {
  perfect: { label: "Точно!", color: 0x62d9ff },
  early: { label: "Рано", color: 0xffd166 },
  late: { label: "Поздно", color: 0xffa94d },
  miss: { label: "Мимо", color: 0xff5d6c }
};
/** How long a grade stays up, and how far it rises meanwhile. */
const POP_S = 0.75;
const POP_RISE_PX = 36;
/** The grade swells at first, then settles: this long, from this scale. */
const POP_SWELL_S = 0.12;
const POP_SWELL = 1.35;
const DISPLAY_FONT = "'Russo One', system-ui, sans-serif";
const BOARD_MARGIN_PX = 16;

function glowing(color: number, size: number): TextStyleOptions {
  return {
    fontFamily: DISPLAY_FONT,
    fontSize: size,
    fill: color,
    dropShadow: { color, blur: 10, distance: 0, alpha: 0.8 }
  };
}

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
  private readonly comboTitle = new Text({ text: "КОМБО", style: glowing(0x9fb3d1, 15) });
  private readonly comboValue = new Text({ text: "0", style: glowing(0x62d9ff, 44) });
  private readonly accuracy = new Text({ text: "", style: glowing(0xe8edf7, 15) });
  private readonly pops = new Container();
  private readonly active: Pop[] = [];
  private readonly spare = new Map<StrikeGrade, Text[]>();
  private shown = { combo: -1, accuracy: -1 };

  constructor() {
    this.container.eventMode = "none";
    this.comboValue.y = 16;
    this.accuracy.y = 64;
    this.board.addChild(this.comboTitle, this.comboValue, this.accuracy);
    this.board.position.set(BOARD_MARGIN_PX, BOARD_MARGIN_PX);
    this.board.visible = false;
    this.container.addChild(this.board, this.pops);
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
      this.accuracy.text = `точность ${String(percent)}%`;
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
