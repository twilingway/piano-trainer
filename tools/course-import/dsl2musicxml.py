"""Tiny text DSL -> two-staff piano MusicXML.

Header lines `key: value` (title, composer, key, time, tempo), then one line a measure:
  [@attr=val ...] R: tokens | L: tokens | R2: tokens | L2: tokens
Measure attrs: @bar=double (double barline after the measure), @mark=Часть_B (section words
above the measure, `_` = space). The last measure always gets a final barline.
Tokens: r:q  rest;  E5:q.~/3  note (pitch:dur, `~` tie start, `/f` finger);
  [F3 A3 C4]:h/531  chord (fingers low->high in written order);
  durations w h q e s t, `.` dot, `3` triplet.  Attrs: key, time, tempo, clef1, clef2, pickup.
Lines starting with # are comments.
"""
import sys, re
from xml.sax.saxutils import escape

DIV = 24
BASE = {"w": 96, "h": 48, "q": 24, "e": 12, "s": 6, "t": 3}
TYPE = {"w": "whole", "h": "half", "q": "quarter", "e": "eighth", "s": "16th", "t": "32nd"}
STEPS = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
VOICE = {"R": (1, 1), "R2": (1, 2), "L": (2, 5), "L2": (2, 6)}
CLEF = {"G": ("G", 2), "F": ("F", 4)}

def dur(s):
    m = re.fullmatch(r"([whqest])(\.{0,2})(3?)", s)
    if not m: raise ValueError(f"bad duration {s!r}")
    d = BASE[m[1]]; add = d
    for _ in m[2]: add //= 2; d += add
    if m[3]: d = d * 2 // 3
    return d, TYPE[m[1]], len(m[2]), bool(m[3])

def pitch(p):
    m = re.fullmatch(r"([A-G])(#|b|##|bb)?(-?\d)(~?)", p)
    if not m: raise ValueError(f"bad pitch {p!r}")
    alter = {"#": 1, "b": -1, "##": 2, "bb": -2}.get(m[2] or "", 0)
    return m[1], alter, int(m[3]), bool(m[4])

def midi(step, alter, octave): return (octave + 1) * 12 + STEPS[step] + alter

def parse_token(tok):
    m = re.fullmatch(r"(\[[^\]]+\]|[^:]+):([whqest]\.{0,2}3?)(~?)(?:/(\d+))?", tok)
    if not m: raise ValueError(f"bad token {tok!r}")
    body, d, tie, fing = m.groups()
    if body == "r": return {"rest": True, "dur": dur(d)}
    pitches = [pitch(p) for p in body.strip("[]").split()]
    fingers = list(fing) if fing else []
    if fingers and len(fingers) != len(pitches): raise ValueError(f"finger count {tok!r}")
    return {"rest": False, "dur": dur(d), "pitches": pitches, "tie": bool(tie), "fingers": fingers}

def note_xml(ev, staff, voice, open_ties):
    (d, typ, dots, trip) = ev["dur"]
    common = f"<duration>{d}</duration><voice>{voice}</voice><type>{typ}</type>" + "<dot/>" * dots
    tm = "<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>" if trip else ""
    if ev["rest"]:
        return [f"<note><rest/>{common}{tm}<staff>{staff}</staff></note>"]
    out = []
    for i, (step, alter, octave, ptie) in enumerate(ev["pitches"]):
        key = (staff, midi(step, alter, octave))
        stop = key in open_ties
        start = ev["tie"] or ptie
        if stop: open_ties.discard(key)
        if start: open_ties.add(key)
        ties = ("<tie type=\"stop\"/>" if stop else "") + ("<tie type=\"start\"/>" if start else "")
        tied = ("<tied type=\"stop\"/>" if stop else "") + ("<tied type=\"start\"/>" if start else "")
        fing = f"<technical><fingering>{ev['fingers'][i]}</fingering></technical>" if ev["fingers"] else ""
        notations = f"<notations>{tied}{fing}</notations>" if (tied or fing) else ""
        alt = f"<alter>{alter}</alter>" if alter else ""
        chord = "<chord/>" if i else ""
        out.append(f"<note>{chord}<pitch><step>{step}</step>{alt}<octave>{octave}</octave></pitch>"
                   f"{common.replace('<voice>', ties + '<voice>', 1)}{tm}<staff>{staff}</staff>{notations}</note>")
    return out

def convert(text):
    head, measures = {}, []
    for raw in text.splitlines():
        line = "" if raw.lstrip().startswith("#") else raw.strip()
        if not line: continue
        if re.match(r"^(title|composer|key|time|tempo|clef1|clef2):", line) and not measures and "|" not in line and not line.startswith(("R:", "L:")):
            k, v = line.split(":", 1); head[k] = v.strip(); continue
        measures.append(line)
    beats, beat_type = map(int, head.get("time", "4/4").split("/"))
    cur = {"key": head.get("key", "0"), "time": head.get("time", "4/4"),
           "clef1": head.get("clef1", "G"), "clef2": head.get("clef2", "F")}
    xml = ['<?xml version="1.0" encoding="UTF-8"?>',
           '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">',
           '<score-partwise version="4.0">',
           f"<work><work-title>{escape(head.get('title', ''))}</work-title></work>",
           f"<identification><creator type=\"composer\">{escape(head.get('composer', ''))}</creator>"
           "<encoding><software>piano-trainer hand transcription</software></encoding></identification>",
           '<part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>', '<part id="P1">']
    open_ties = set()
    number = 0
    for idx, line in enumerate(measures):
        attrs = dict(re.findall(r"@(\w+)=?(\S*)", line))
        line = re.sub(r"@\w+=?\S*", "", line)
        pickup = "pickup" in attrs
        number = number + 1 if not (pickup and idx == 0) else 0
        changes = {k: attrs[k] for k in ("key", "time", "clef1", "clef2") if k in attrs and attrs[k] != cur[k]}
        cur.update(changes)
        beats, beat_type = map(int, cur["time"].split("/"))
        full = beats * DIV * 4 // beat_type
        body = [f'<measure number="{number}"' + (' implicit="yes"' if pickup else "") + ">"]
        if idx == 0 or changes:
            a = ["<attributes>"]
            if idx == 0: a.append(f"<divisions>{DIV}</divisions>")
            if idx == 0 or "key" in changes: a.append(f"<key><fifths>{cur['key']}</fifths></key>")
            if idx == 0 or "time" in changes: a.append(f"<time><beats>{beats}</beats><beat-type>{beat_type}</beat-type></time>")
            if idx == 0: a.append("<staves>2</staves>")
            for n in (1, 2):
                if idx == 0 or f"clef{n}" in changes:
                    s, l = CLEF[cur[f"clef{n}"]]
                    a.append(f'<clef number="{n}"><sign>{s}</sign><line>{l}</line></clef>')
            a.append("</attributes>"); body.append("".join(a))
        if "mark" in attrs:
            body.append(f'<direction placement="above"><direction-type><words font-weight="bold">'
                        f'{escape(attrs["mark"].replace("_", " "))}</words></direction-type></direction>')
        tempo = attrs.get("tempo") or (head.get("tempo") if idx == 0 else None)
        if tempo:
            body.append(f'<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit>'
                        f'<per-minute>{tempo}</per-minute></metronome></direction-type><sound tempo="{tempo}"/></direction>')
        parts = {}
        for seg in line.split("|"):
            seg = seg.strip()
            if not seg: continue
            name, toks = seg.split(":", 1) if re.match(r"^(R2?|L2?):", seg) else (None, None)
            if name is None: raise ValueError(f"measure {number}: bad segment {seg!r}")
            parts[name] = re.findall(r"\[[^\]]*\]\S*|\S+", toks)
        parts.setdefault("R", [])
        parts.setdefault("L", [])
        lengths = {}
        first = True
        for name in ("R", "R2", "L", "L2"):
            if name not in parts: continue
            staff, voice = VOICE[name]
            evs = [parse_token(t) for t in parts[name]]
            total = sum(e["dur"][0] for e in evs)
            if not evs:
                if pickup:  # leave empty voices out of a pickup measure
                    continue
                evs = [{"rest": True, "dur": (full, "whole", 0, False)}]; total = full
            if not pickup and total != full and idx != len(measures) - 1:
                raise ValueError(f"measure {number} {name}: {total} != {full}")
            lengths[name] = total
            if not first: body.append(f"<backup><duration>{prev}</duration></backup>")
            for e in evs: body.extend(note_xml(e, staff, voice, open_ties))
            prev = total; first = False
        style = "light-heavy" if idx == len(measures) - 1 else ("light-light" if attrs.get("bar") == "double" else None)
        if style:
            body.append(f'<barline location="right"><bar-style>{style}</bar-style></barline>')
        body.append("</measure>")
        xml.append("\n".join(body))
    if open_ties: raise ValueError(f"unclosed ties {open_ties}")
    xml += ["</part>", "</score-partwise>", ""]
    return "\n".join(xml)

if __name__ == "__main__":
    src, dst = sys.argv[1], sys.argv[2]
    with open(src, encoding="utf-8") as f: out = convert(f.read())
    with open(dst, "w", encoding="utf-8", newline="\n") as f: f.write(out)
    print("ok", dst)
