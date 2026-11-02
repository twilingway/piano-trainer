import { useState } from "react";

interface Props {
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly label: string;
  readonly target: string;
  readonly disabled?: boolean;
  readonly onChange: (value: number) => void;
}

/** Keep unfinished numeric edits local while finite values preview through the canonical owner. */
export function ProjectionNumberInput({
  value,
  min,
  max,
  step,
  label,
  target,
  disabled,
  onChange
}: Props) {
  const [draft, setDraft] = useState(String(value));
  const [editing, setEditing] = useState(false);
  return (
    <input
      type="number"
      className="game-input"
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      value={editing ? draft : String(value)}
      aria-label={label}
      data-setting-target={target}
      onFocus={() => {
        setDraft(String(value));
        setEditing(true);
      }}
      onChange={(event) => {
        setDraft(event.target.value);
        const next = event.target.valueAsNumber;
        if (event.target.value !== "" && Number.isFinite(next)) onChange(next);
      }}
      onBlur={() => {
        setEditing(false);
        setDraft(String(value));
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
    />
  );
}
