import {
  createContext,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import { useI18n } from "../app/useI18n";
import { LESSON_MENU_KINDS, LessonSlotContext, type LessonMenuKind } from "./LessonSlots";

export interface LessonWindowControls {
  readonly open: string | null;
  readonly onOpen: (id: string | null) => void;
  readonly interruptsAttempt: boolean;
}
export const LessonWindowContext = createContext<LessonWindowControls | null>(null);

interface Props {
  readonly title: string;
  readonly instruction: string;
  readonly input: string;
  readonly score: ReactNode;
  readonly action: ReactNode;
  readonly windows: LessonWindowControls;
  readonly children: ReactNode;
}

/**
 * The score keeps one owner; the panel's counter, exit, hint, answer controls,
 * feedback and menu items land in fixed places. Actions have their own rail beside
 * the scrollable score, or a top strip on narrow portrait screens.
 */
export function LessonWorkspace(props: Props) {
  const { t } = useI18n();
  const [exit, setExit] = useState<HTMLElement | null>(null);
  const [counter, setCounter] = useState<HTMLElement | null>(null);
  const [hint, setHint] = useState<HTMLElement | null>(null);
  const [answer, setAnswer] = useState<HTMLElement | null>(null);
  const [feedback, setFeedback] = useState<HTMLElement | null>(null);
  const [resultAction, setResultAction] = useState<HTMLElement | null>(null);
  const [menu, setMenu] = useState<Partial<Record<LessonMenuKind, HTMLElement>>>({});
  const [menuRefs] = useState(
    () =>
      Object.fromEntries(
        LESSON_MENU_KINDS.map((kind) => [
          kind,
          (node: HTMLElement | null) => {
            if (node)
              setMenu((groups) => (groups[kind] === node ? groups : { ...groups, [kind]: node }));
          }
        ])
      ) as Record<LessonMenuKind, (node: HTMLElement | null) => void>
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const menuArea = useRef<HTMLDivElement>(null);
  const menuList = useRef<HTMLDivElement>(null);
  const workspace = useRef<HTMLElement>(null);
  const menuId = useId();
  const slots = useMemo(
    () => ({
      targets: {
        ...(exit && { exit }),
        ...(counter && { counter }),
        ...(hint && { hint }),
        ...(answer && { answer }),
        ...(feedback && { feedback }),
        ...(resultAction && { resultAction })
      },
      menu,
      closeMenu: () => {
        setMenuOpen(false);
      }
    }),
    [exit, counter, hint, answer, feedback, resultAction, menu]
  );
  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: PointerEvent) => {
      if (event.target instanceof Node && menuArea.current?.contains(event.target)) return;
      setMenuOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
    };
  }, [menuOpen]);
  useLayoutEffect(() => {
    const list = menuList.current;
    const button = menuButton.current;
    const frame = workspace.current;
    if (!menuOpen || !list || !button || !frame) return;
    const position = () => {
      const anchor = button.getBoundingClientRect();
      const room = frame.getBoundingClientRect();
      const top = anchor.bottom + 4;
      list.style.top = `${String(top)}px`;
      list.style.right = `${String(Math.max(8, window.innerWidth - anchor.right))}px`;
      list.style.maxHeight = `${String(Math.max(40, room.bottom - top - 8))}px`;
      list.style.maxWidth = `${String(Math.max(1, room.width - 16))}px`;
    };
    position();
    const observer = new ResizeObserver(position);
    observer.observe(frame);
    observer.observe(button);
    window.addEventListener("resize", position);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", position);
    };
  }, [menuOpen]);
  return (
    <LessonWindowContext value={props.windows}>
      <LessonSlotContext value={slots}>
        <section className="lesson-workspace" aria-label={props.title} ref={workspace}>
          <header className="lesson-workspace__heading">
            <div className="lesson-workspace__bar">
              <div className="lesson-workspace__exit" ref={setExit} />
              <div className="lesson-workspace__title">
                <h2>{props.title}</h2>
                <div className="lesson-workspace__counter" ref={setCounter} />
              </div>
              <div
                className="lesson-menu"
                ref={menuArea}
                onKeyDown={(event) => {
                  if (event.key !== "Escape" || !menuOpen) return;
                  event.stopPropagation();
                  setMenuOpen(false);
                  menuButton.current?.focus();
                }}
              >
                <button
                  ref={menuButton}
                  type="button"
                  className="game-button lesson-menu__toggle"
                  aria-expanded={menuOpen}
                  aria-controls={menuId}
                  onClick={() => {
                    setMenuOpen((open) => !open);
                  }}
                >
                  {t("Меню урока")}
                </button>
                <div id={menuId} className="lesson-menu__list" hidden={!menuOpen} ref={menuList}>
                  {LESSON_MENU_KINDS.map((kind) => (
                    <div key={kind} className="lesson-menu__group" ref={menuRefs[kind]} />
                  ))}
                </div>
              </div>
            </div>
            <p className="lesson-workspace__instruction">{props.instruction}</p>
            <div className="lesson-workspace__feedback" aria-live="polite" ref={setFeedback} />
            <p className="lesson-workspace__input">{props.input}</p>
          </header>
          <div className="lesson-workspace__content">
            <footer className="lesson-workspace__response">
              <div className="lesson-workspace__actions">
                {props.action}
                <div className="lesson-workspace__hint" ref={setHint} />
                <div className="lesson-workspace__result-action" ref={setResultAction} />
              </div>
              <div className="lesson-workspace__answer" ref={setAnswer} />
            </footer>
            <div className="lesson-workspace__body">
              <div className="lesson-workspace__score">{props.score}</div>
            </div>
          </div>
          <div className="lesson-workspace__controls" aria-label={t("Управление уроком")}>
            {props.children}
          </div>
        </section>
      </LessonSlotContext>
    </LessonWindowContext>
  );
}

export function useLessonWindow() {
  return useContext(LessonWindowContext);
}
