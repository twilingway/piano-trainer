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

export function ListenIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 14v-3a8 8 0 0 1 16 0v3" />
      <rect x="3" y="11" width="4" height="9" rx="2" />
      <rect x="17" y="11" width="4" height="9" rx="2" />
      <path d="M12 8v7m0-7 4 1" />
      <ellipse cx="10.5" cy="15.5" rx="1.5" ry="1" className="filled" />
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
      <path d="M19.21 9.93L21.88 10.44L21.88 13.56L19.21 14.07L18.56 15.64L20.09 17.88L17.88 20.09L15.64 18.56L14.07 19.21L13.56 21.88L10.44 21.88L9.93 19.21L8.36 18.56L6.12 20.09L3.91 17.88L5.44 15.64L4.79 14.07L2.12 13.56L2.12 10.44L4.79 9.93L5.44 8.36L3.91 6.12L6.12 3.91L8.36 5.44L9.93 4.79L10.44 2.12L13.56 2.12L14.07 4.79L15.64 5.44L17.88 3.91L20.09 6.12L18.56 8.36Z" />
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

export function FullscreenIcon({ active }: { readonly active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d={
          active
            ? "M3 8h5V3M16 3v5h5M21 16h-5v5M8 21v-5H3"
            : "M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5"
        }
      />
    </svg>
  );
}
