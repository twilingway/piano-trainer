/** A score and its corresponding keys, independent of practice and rendering. */
export const READING_INTRO_NOTES = [
  {
    pitch: 60,
    name: "до",
    notation: "C4",
    finger: 1,
    fingerName: "Большой палец",
    position: "До — на короткой добавочной линии под нотным станом.",
    beat: 0
  },
  {
    pitch: 62,
    name: "ре",
    notation: "D4",
    finger: 2,
    fingerName: "Указательный палец",
    position: "Ре — под нижней линией нотного стана.",
    beat: 1
  },
  {
    pitch: 64,
    name: "ми",
    notation: "E4",
    finger: 3,
    fingerName: "Средний палец",
    position: "Ми — на нижней линии нотного стана.",
    beat: 2
  },
  {
    pitch: 65,
    name: "фа",
    notation: "F4",
    finger: 4,
    fingerName: "Безымянный палец",
    position: "Фа — между первой и второй линиями снизу.",
    beat: 3
  },
  {
    pitch: 67,
    name: "соль",
    notation: "G4",
    finger: 5,
    fingerName: "Мизинец",
    position: "Соль — на второй линии нотного стана снизу.",
    beat: 4
  }
] as const;

const STEPS = ["C", "D", "E", "F", "G"] as const;
const notes = STEPS.map(
  (step, index) => `<note id="intro-${step}4"><pitch><step>${step}</step><octave>4</octave></pitch>
<duration>1</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>${index === 3 ? '</measure><measure number="2" implicit="yes">' : ""}`
).join("");

/** Selection moves the cursor over this constant score; it never regenerates the lesson. */
export const READING_INTRO_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0"><part-list><score-part id="P1"><part-name/></score-part></part-list>
<part id="P1"><measure number="1"><attributes><divisions>1</divisions><key><fifths>0</fifths></key>
<time><beats>4</beats><beat-type>4</beat-type></time><staves>1</staves><clef><sign>G</sign><line>2</line></clef>
</attributes>${notes}</measure></part></score-partwise>`;
