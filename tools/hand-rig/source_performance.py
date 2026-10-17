"""Package saved video fingering and placements without running a model or a fingering solver.

python tools/hand-rig/source_performance.py --source <capture> --midi <v5.mid> --out <derived-dir>
The original capture is read-only. The derived directory must differ from it.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

import numpy as np
from hand_features import placement

ROOT = Path(__file__).resolve().parents[2]

def load(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def save(path, value):
    path.write_text(json.dumps(value, ensure_ascii=True, indent=1) + "\n", encoding="utf-8")

NODE = r"""
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(process.cwd() + '/package.json');
const { Midi } = require('@tonejs/midi');
const { resolveSourceFingering } = await import(process.argv[1]);
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const resolved = resolveSourceFingering(input.events, input.candidates, input.decisions);
const midi = new Midi(fs.readFileSync(process.argv[2]));
const used = new Set();
let maximumOnsetError = 0;
const notes = [];
const tracks = midi.tracks.filter(t => !t.instrument.percussion && t.notes.length > 0);
for (const [trackIndex, track] of tracks.entries()) {
  for (const [noteIndex, note] of track.notes.entries()) {
    const hits = resolved.filter(s => s.pitch === note.midi && Math.abs(s.onset - note.time) < .001);
    if (hits.length !== 1 || used.has(hits[0].sourceId)) throw Error('Source/MIDI mapping is not bijective');
    const source = hits[0]; used.add(source.sourceId);
    if (['left','right'].includes(track.name) && source.hand !== track.name) throw Error('Source/MIDI hand mismatch');
    maximumOnsetError = Math.max(maximumOnsetError, Math.abs(source.onset - note.time));
    notes.push({...source, midiId: `t${trackIndex}n${noteIndex}`});
  }
}
if (used.size !== resolved.length) throw Error('Source/MIDI note count mismatch');
process.stdout.write(JSON.stringify({resolved, notes, maximumOnsetError}));
"""

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--midi", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    source, out = args.source.resolve(), args.out.resolve()
    if out == source:
        raise ValueError("The output must be a new derived directory, not the capture root")
    poses = source / "hand-poses"
    base = source / "claude-handoff-v4"
    index = load(poses / "index.json")
    keyboard = load(poses / "keyboard.json")
    originals = load(base / "notes.json")
    candidates = load(poses / "candidates.json")
    decisions = load(poses / "fingers.decisions.json")["notes"]
    notes = originals["notes"]
    events = []
    policies = {}
    for note in notes:
        for key in ("keyRelease", "displayedOffset", "estimatedOffset", "offset"):
            if note.get(key) is not None:
                end, policies[note["id"]] = note[key], key
                break
        else:
            end, policies[note["id"]] = None, "unknown"
        events.append(dict(id=note["id"], pitch=note["pitch"], hand=note["hand"],
                           onset=note["onset"], estimatedContactEnd=end))
    result = subprocess.run(
        ["node", "--experimental-strip-types", "--input-type=module", "-e", NODE,
         (ROOT / "src/song/sourceFingering.ts").as_uri(), str(args.midi.resolve())],
        input=json.dumps(dict(events=events, candidates=candidates, decisions=decisions)),
        text=True, encoding="utf-8", cwd=ROOT, capture_output=True, check=True)
    calculated = json.loads(result.stdout)
    resolved = calculated["resolved"]
    by_id = {note["sourceId"]: note for note in resolved}
    events_by_id = {note["id"]: note for note in events}
    merged = {}
    for note in resolved:
        if note["finger"] is not None:
            merged[note["sourceId"]] = dict(decisions.get(note["sourceId"], {}),
                finger=note["finger"], origin=note["origin"])
    sheets_path = poses / "sheets/sheets.json"
    sheets = {row["note"]: row["thumb"] for row in load(sheets_path)} if sheets_path.exists() else {}
    inverse = np.linalg.inv(np.asarray(keyboard["H"]))
    features, conflicts = [], []
    for onset in index["onsets"]:
        feature = placement(onset, inverse, merged, sheets) if onset.get("track") else None
        if feature is None:
            feature = dict(id=onset["id"], hand=onset["hand"], time=onset["time"],
                           frames=[], notes=[dict(id=n["id"], pitch=n["pitch"], x=n["x"],
                           finger=None, origin="unknown") for n in onset["notes"]],
                           missingHand=True, thumb=None, thumbFrom=None)
        feature["time"] = min(events_by_id[n["id"]]["onset"] for n in onset["notes"])
        counts = {}
        for note in feature["notes"]:
            saved = by_id[note["id"]]
            note.update(onset=saved["onset"], estimatedContactEnd=saved.get("estimatedContactEnd"),
                        sourceFinger=saved)
            if saved["finger"] is not None:
                counts.setdefault(saved["finger"], []).append(saved["sourceId"])
        duplicates = {str(f): ids for f, ids in counts.items() if len(ids) > 1}
        if duplicates:
            conflict = dict(onset=feature["id"], time=feature["time"],
                kind="duplicate-finger-within-source-onset-group", fingers=duplicates,
                sourceNoteOnsets={n["id"]: n["onset"] for n in feature["notes"]},
                requiresReview=True)
            conflicts.append(conflict)
            feature["fingerConflict"] = conflict
        features.append(feature)
    conflicting_ids = {note_id for conflict in conflicts for ids in conflict["fingers"].values() for note_id in ids}
    for note in resolved + calculated["notes"]:
        if note["sourceId"] in conflicting_ids:
            note["conflict"] = "duplicate-finger-group"
    identity = dict(id="local-source-" + sha(args.midi)[:12], midiSha256=sha(args.midi),
                    sourceSha256=originals["sourceSha256"], noteCount=len(notes), timeOriginSeconds=0)
    package = dict(schemaVersion=1, **identity, notes=calculated["notes"])
    reconciliation = dict(total=len(notes), resolved=sum(n["finger"] is not None for n in resolved),
        unknown=sum(n["finger"] is None for n in resolved),
        selectedDecisions=sum(n["selectedFrom"] == "decision" for n in resolved),
        selectedCandidates=sum(n["selectedFrom"] == "candidate" for n in resolved),
        teacher=sum(n["origin"] == "teacher" for n in resolved),
        videoAuto=sum(n["origin"] == "video-auto" for n in resolved),
        correctedCandidates=sum(n["selectedFrom"] == "decision" and n["candidateFinger"] is not None
            and n["candidateFinger"] != n["finger"] for n in resolved),
        decisionsFilledMissingCandidate=sum(n["selectedFrom"] == "decision" and n["candidateFinger"] is None for n in resolved),
        maximumMidiOnsetErrorSeconds=calculated["maximumOnsetError"],
        observedOnsets=sum(not f.get("missingHand", False) for f in features),
        completeOnsets=sum(all(n["finger"] for n in f["notes"]) for f in features),
        onsetsWithKnownNotes=sum(any(n["finger"] for n in f["notes"]) for f in features),
        fullyReviewed=False, conflicts=conflicts,
        unresolved=[n["sourceId"] for n in resolved if n["finger"] is None])
    contacts = []
    for original in notes:
        saved = by_id[original["id"]]
        contacts.append(dict(saved, id=original["id"], offset=saved["estimatedContactEnd"],
            endPolicy=policies[original["id"]], rawOffset=original.get("offset"),
            keyRelease=original.get("keyRelease"), physicalReleaseVerified=original.get("keyRelease") is not None))
    out.mkdir(parents=True, exist_ok=True)
    save(out / "local-performance.json", package)
    save(out / "resolved-fingers.json", dict(schemaVersion=1, notes=resolved))
    save(out / "contacts.full.json", dict(schemaVersion=1, notes=contacts))
    save(out / "features.full.json", dict(index="original hand-poses/index.json", keyboard=keyboard,
        nearS=0.018, onsetWindow=index["onsetWindow"], onsets=features,
        sourceFingerprint=identity, fullyReviewed=False))
    save(out / "reconciliation.json", reconciliation)
    inputs = [args.midi.resolve(), base / "notes.json", poses / "candidates.json",
              poses / "fingers.decisions.json", poses / "index.json", poses / "keyboard.json"]
    save(out / "manifest.json", dict(schemaVersion=1, **identity,
        inputs=[dict(path=str(p), sha256=sha(p)) for p in inputs],
        outputs={p.name: sha(p) for p in out.glob("*.json") if p.name != "manifest.json"}))
    (out / "README.md").write_text(
        "# Derived source performance\n\nOriginal capture files were read only. No model, video extraction, "
        "or MIDI fingering solver ran.\n\nThe runtime package preserves decisions over video-auto candidates. "
        "Unknowns stay null. Automatic candidates are not reviewed teacher observations. "
        "See reconciliation.json for exact counts and duplicate-finger groups requiring review.\n\n"
        "features.full.json keeps all source onset groups, including incomplete chords and a missing-hand group. "
        "Do not apply the old all(finger) filter: keep known notes beside unknown ones. "
        "Individual source onsets are retained; the original 30ms grouping is not proof of simultaneity.\n\n"
        "contacts.full.json uses v4 keyRelease, otherwise displayedOffset/estimatedOffset/raw offset, in that order. "
        "Unknown physical release remains unverified. v5 acoustic note ends belong to audio, never hand holds.\n\n"
        "This package contains no baked movement yet. All hand paths must be baked offline before playback. "
        "Do not replace missing motion with an on-frame solver.\n", encoding="utf-8")
    print(json.dumps({k: v for k, v in reconciliation.items() if k not in ("conflicts", "unresolved")}, indent=2))
    print("derived", out)

if __name__ == "__main__":
    main()