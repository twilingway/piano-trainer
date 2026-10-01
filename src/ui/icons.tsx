/** The player's icons: small line drawings in the current text colour. */

export function StaffIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {[6, 9, 12, 15, 18].map((y) => (
        <line key={y} x1="2" x2="22" y1={y} y2={y} />
      ))}
      <ellipse cx="10" cy="15" rx="3" ry="2.2" className="filled" />
      <line x1="13" x2="13" y1="15" y2="4" />
    </svg>
  );
}

export function FallingNotesIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="3" width="4" height="8" rx="1" className="filled" />
      <rect x="10" y="7" width="4" height="10" rx="1" className="filled" />
      <rect x="17" y="2" width="4" height="6" rx="1" className="filled" />
      <line x1="2" x2="22" y1="21" y2="21" />
    </svg>
  );
}

export function KeyboardIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2" y="5" width="20" height="14" rx="1.5" />
      {[7, 12, 17].map((x) => (
        <line key={x} x1={x} x2={x} y1="12" y2="19" />
      ))}
      {[5.5, 9.5, 15.5].map((x) => (
        <rect key={x} x={x} y="5" width="2.6" height="7" className="filled" />
      ))}
    </svg>
  );
}

export function NoteCardIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="3" width="16" height="18" rx="3" />
      {[9, 12, 15].map((y) => (
        <line key={y} x1="7" x2="17" y1={y} y2={y} />
      ))}
      <ellipse cx="11" cy="15" rx="2" ry="1.5" className="filled" />
      <line x1="12.8" x2="12.8" y1="15" y2="8" />
    </svg>
  );
}

export function RoadIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M10 3h4l7 18H3z" />
      <line x1="12" x2="12" y1="6" y2="9" />
      <line x1="12" x2="12" y1="12" y2="16" />
    </svg>
  );
}

export function HandIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 12V6.5a1.3 1.3 0 0 1 2.6 0V11V4.8a1.3 1.3 0 0 1 2.6 0V11V5.6a1.3 1.3 0 0 1 2.6 0V11.5V8a1.3 1.3 0 0 1 2.6 0v6.5a6.5 6.5 0 0 1-6.5 6.5h-.5a5.5 5.5 0 0 1-4.6-2.5L3.4 13.6a1.3 1.3 0 0 1 2-1.6L7 13.6" />
    </svg>
  );
}

export function LibraryIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="4" width="4" height="16" rx="1" />
      <rect x="9" y="4" width="4" height="16" rx="1" />
      <path d="M15.2 5.2l3.8-1 3.9 14.6-3.8 1z" />
    </svg>
  );
}

export function RestartIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <line x1="5" x2="5" y1="5" y2="19" />
      <path d="M19 5L8 12l11 7z" className="filled" />
    </svg>
  );
}

export function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 5l12 7-12 7z" className="filled" />
    </svg>
  );
}

export function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="6" y="5" width="4" height="14" rx="1" className="filled" />
      <rect x="14" y="5" width="4" height="14" rx="1" className="filled" />
    </svg>
  );
}

export function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.5 5.5l1.9 1.9M16.6 16.6l1.9 1.9M5.5 18.5l1.9-1.9M16.6 7.4l1.9-1.9" />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
