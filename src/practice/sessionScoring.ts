import type { SongNote } from "../song/song";
import { energyPerHit } from "./energy";
import { GameScore } from "./gameScore";
import { idealScore } from "./gameResults";
import { GAME_RULES } from "./gameRules";
import type { Difficulty } from "./gameRules";

type Command =
  | { type: "hit"; id: string; offset: number; at: number }
  | { type: "miss"; id: string; at: number }
  | { type: "wrong"; at: number }
  | { type: "chord"; id: string; complete: boolean; at: number }
  | { type: "hold"; id: string; ticks: number; at: number }
  | { type: "overdrive"; at: number };

const ORDER = { hit: 0, miss: 1, wrong: 2, chord: 3, hold: 4, overdrive: 5 };

/** Replaying the small judgement log makes score independent of callback delivery order. */
export class SessionScoring {
  private readonly commands: Command[] = [];
  private scorer: GameScore;
  private dirty = false;
  private readonly targetScore: number;
  private readonly energyPerHit: number;
  private lastApplied: Command | undefined;
  constructor(
    private readonly notes: readonly SongNote[],
    private readonly difficulty: Difficulty,
    private readonly learningWindow = false
  ) {
    this.targetScore = idealScore(notes);
    this.energyPerHit = energyPerHit(notes);
    this.scorer = this.create();
  }
  hit(id: string, offset: number, at: number): void {
    this.add({ type: "hit", id, offset, at });
  }
  miss(id: string, at: number): void {
    this.add({ type: "miss", id, at });
  }
  wrong(at: number): void {
    this.add({ type: "wrong", at });
  }
  chord(id: string, complete: boolean, at: number): void {
    this.add({ type: "chord", id, complete, at });
  }
  hold(id: string, ticks: number, at: number): void {
    this.add({ type: "hold", id, ticks, at });
  }
  truncateHold(id: string, until: number): void {
    let changed = false;
    for (let index = this.commands.length - 1; index >= 0; index--) {
      const event = this.commands[index];
      if (event?.type === "hold" && event.id === id && event.at > until) {
        this.commands.splice(index, 1);
        changed = true;
      }
    }
    if (changed) this.dirty = true;
  }
  activateOverdrive(at: number): boolean {
    this.rebuild();
    const state = this.scorer.snapshot(at);
    if (state.energy < GAME_RULES.overdriveCost || state.overdriveActive) return false;
    this.add({ type: "overdrive", at });
    return true;
  }
  snapshot(at: number): ReturnType<GameScore["snapshot"]> {
    this.rebuild();
    return this.scorer.snapshot(at);
  }
  private add(command: Command): void {
    this.commands.push(command);
    const previous = this.lastApplied;
    if (
      !this.dirty &&
      (!previous ||
        command.at > previous.at ||
        (command.at === previous.at && ORDER[command.type] >= ORDER[previous.type]))
    ) {
      this.apply(command);
      this.lastApplied = command;
    } else this.dirty = true;
  }
  private create(): GameScore {
    return new GameScore(this.notes.length, {
      difficulty: this.difficulty,
      learningWindow: this.learningWindow,
      targetScore: this.targetScore,
      energyPerHit: this.energyPerHit
    });
  }
  private rebuild(): void {
    if (!this.dirty) return;
    this.scorer = this.create();
    const ordered = [...this.commands].sort((a, b) => a.at - b.at || ORDER[a.type] - ORDER[b.type]);
    for (const command of ordered) this.apply(command);
    this.lastApplied = ordered.at(-1);
    this.dirty = false;
  }
  private apply(command: Command): void {
    switch (command.type) {
      case "hit":
        this.scorer.hit(command.id, command.offset, command.at);
        break;
      case "miss":
        this.scorer.miss(command.id);
        break;
      case "wrong":
        this.scorer.wrong();
        break;
      case "chord":
        this.scorer.chord(command.id, command.complete);
        break;
      case "hold":
        this.scorer.hold(command.id, command.ticks, command.at);
        break;
      case "overdrive":
        this.scorer.activateOverdrive(command.at);
        break;
    }
  }
}
