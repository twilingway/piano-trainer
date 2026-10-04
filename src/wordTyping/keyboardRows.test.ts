import { describe, expect, it } from "vitest";
import { KEYBOARD_ROWS, columnKey, keyColumn } from "./keyboardRows";
import { tokenPool } from "./inputTokens";

describe("keyboard columns", () => {
  it("gives every key the generator can assign a distinct column that maps back", () => {
    const columns = new Set<number>();
    for (const token of [...tokenPool("ru"), ...tokenPool("en")]) {
      const column = keyColumn(token.physicalKey);
      expect(column, token.physicalKey).toBeDefined();
      if (column !== undefined) {
        expect(columnKey(column)).toBe(token.physicalKey);
        columns.add(column);
      }
    }
    expect(columns.size).toBe(KEYBOARD_ROWS.flat().length);
  });

  it("knows nothing of keys outside the rows", () => {
    expect(keyColumn("Space")).toBeUndefined();
    expect(columnKey(0)).toBeUndefined();
  });
});
