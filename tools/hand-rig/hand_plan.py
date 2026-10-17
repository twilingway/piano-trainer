"""The hand over time (design "Кисть по времени"): per hand, from its strikes (onsets, notes with their ends,
fingers), the keys of its pose in time. Pure numpy over hand_mech.place(); no Blender.

- A strike's pose stands over its keys before the onset (READY; the pressing fingers hang HOVER mm over
  them) and presses at the onset.
- A note still sounding at the next onset whose finger the next strike does not need is held: it joins the
  next strike's placement, so its tip stays on its key while the hand moves. A note place() cannot keep is
  released at the hand's departure.
- The hand stays where it is while its fingers reach the next strike's keys from there. When it must
  move, it goes to the one position that covers this strike and as many following ones as fit one hand
  (a finger on one key, the tips in contact, the yaw within every strike's example tolerance): a riff
  inside a five-finger position is played by the fingers, not by the wrist.
- The hand leaves a pose when its last note that is not held ends, but no later than the move needs at the
  teacher's speed limit (SPEED): a note that would make the hand late is let go early ("cut"). Late even so
  ("degraded"): the hand moves at the limit and arrives after the onset; the lag and the wrist's distance
  still to go at the onset go to the report, never a jump.

    python hand_plan.py speed <capture package> <keyboard.json>     the teacher's speed percentiles (task 7.1)
    python hand_plan.py check <hand-poses> --rest <mech-report.json> [--from 2.7 --to 18.5]
"""
import json, math, os, sys

import numpy as np

import hand_mech as M

# The wrist's speed over the key plane (mm/s) and the hand's yaw speed (deg/s): the 99th percentile of the
# teacher's MediaPipe track (Seven Nation Army capture v4, 60 fps): wrist and middle MCP through the key
# homography, a 5-frame median, speed over 100 ms; segments whose local median step passes 6 mm a frame
# dropped as jitter (2145 of 17158 samples; tracks 7, 9-12 swap or shake). Left / right: wrist p50 86 / 72,
# p90 248 / 245, p99 920 / 503; yaw p50 15 / 12, p90 52 / 44, p99 145 / 101.
SPEED = {"left": {"wrist": 920.0, "yaw": 145.0}, "right": {"wrist": 503.0, "yaw": 101.0}}
READY = 0.06          # s: the hand stands over the strike's keys this long before the onset (a third of a short gap)
TAP = 0.05            # s: a struck pose is kept at least this long, however soon the next one comes
HOVER = 6.0           # mm: the pressing fingers' tips over their keys while the hand is ready
HELD_EPS = 0.02       # s: a note ending this close after the next onset is not held into it
LOOKAHEAD = 6         # strikes ahead a new hand position may cover (a bound on the search, not on the music)
JITTER_MM, JITTER_HALF, MEDIAN_N, WINDOW_FRAMES = 6.0, 15, 5, 3


def strikes_of(features, ends, hand, t0=0.0, t1=1e9):
    """The hand's strikes in time: id, onset, thumb state and notes (pitch, finger, end)."""
    out = []
    for o in features["onsets"]:
        if o["hand"] == hand and t0 <= o["time"] <= t1 and all(n["finger"] for n in o["notes"]):
            notes = [{"pitch": n["pitch"], "finger": n["finger"], "end": ends.get(n["id"], o["time"] + TAP)}
                     for n in o["notes"]]
            out.append({"id": o["id"], "time": o["time"], "thumb": o["thumb"], "notes": notes})
    return sorted(out, key=lambda s: (s["time"], s["id"]))


def move_time(a, b, hand):
    """Seconds the move between two roots needs at the speed limit."""
    lim = SPEED[hand]
    return max(math.hypot(b[3] - a[3], b[4] - a[4]) / lim["wrist"], abs(b[0] - a[0]) / lim["yaw"])


def hover_lift(rest, pose, fingers, mm=HOVER):
    """Per finger of the strike's own notes, the flexion deltas (hand_mech.press_delta) that lift its tip
    straight up by mm: the ready pose. A held note's finger stays on its key."""
    ang, root = pose["angles"], pose["rootVec"]
    return {f: M.press_delta(rest, ang, root, f, -mm) for f in pose["press"] if f in fingers}


def plan(rest, library, hand, strikes):
    """keys: [{t, phase (ready | strike | depart), strike index}]; poses: place() per strike; report per strike."""
    poses, report, keys = [], [], []
    sounding = []                        # notes of earlier strikes still down: pitch, finger, end
    for i, s in enumerate(strikes):
        own = [(n["finger"], n["pitch"]) for n in s["notes"]]
        used = {f for f, _ in own}
        held = [h for h in sounding if h["end"] > s["time"] + HELD_EPS and h["finger"] not in used]
        down = own + [(h["finger"], h["pitch"]) for h in held]
        ref = [(own, s["thumb"])]            # held notes joined to a strike: still its example's root
        prev = poses[-1] if poses else None
        pose = None
        if prev is not None:
            # the hand stays where it is while its fingers reach the strike's keys from there
            pose = M.place(rest, library, hand, down, s["thumb"], hold=prev, ref=ref)
            if pose["rootVec"] != prev["rootVec"]:
                pose = None
        if pose is None:
            # it has to move: to the position that covers this strike and as many of the next ones as fit
            # one hand position (a finger on one key, a key under one finger, the tips in contact), so that
            # a riff inside it is played by the fingers
            hold, window, refs = prev, list(dict.fromkeys(down)), list(ref)
            for nx in strikes[i + 1:i + 1 + LOOKAHEAD]:
                pairs = [(n["finger"], n["pitch"]) for n in nx["notes"]]
                wider = list(dict.fromkeys(window + pairs))
                if len({f for f, _ in wider}) < len(wider) or len({p_ for _, p_ in wider}) < len(wider):
                    break
                cover = M.place(rest, library, hand, wider, s["thumb"], hold=hold, ref=refs + [(pairs, nx["thumb"])])
                if cover["dropped"] or max(cover["missMm"].values()) > M.MISS_MM:
                    break
                hold, window, refs = cover, wider, refs + [(pairs, nx["thumb"])]
            pose = M.place(rest, library, hand, down, s["thumb"], hold=hold, ref=ref)
        kept = [h for h in held if h["pitch"] not in pose["dropped"]]
        rep = {"id": s["id"], "time": s["time"], "flags": list(pose["flags"]), "held": [h["pitch"] for h in kept],
               "released": [h["pitch"] for h in held if h["pitch"] in pose["dropped"]], "lateS": 0.0, "missMm": 0.0}
        pose["hover"] = hover_lift(rest, pose, used)
        if i == 0:
            keys.append({"t": round(s["time"] - READY, 4), "phase": "ready", "strike": 0})
        else:
            p, prev = strikes[i - 1], poses[i - 1]
            gap = s["time"] - p["time"]
            ready = s["time"] - min(READY, gap / 3)
            need = move_time(prev["rootVec"], pose["rootVec"], hand)
            kept_pitches = {h["pitch"] for h in kept}
            release = max([n["end"] for n in p["notes"] if n["pitch"] not in kept_pitches] +
                          [h["end"] for h in sounding if h["pitch"] not in kept_pitches and h["end"] > p["time"]],
                          default=p["time"] + TAP)
            struck = keys[-1]["t"]           # the previous strike's key: its onset, or later when it came late
            depart = max(struck + TAP, min(release, ready - need))
            if depart < release - 1e-6:
                report[i - 1]["flags"].append("cut")
            arrive = depart + need
            if arrive > ready + 1e-6:
                rep["flags"].append("degraded")
                rep["lateS"] = round(max(0.0, arrive - s["time"]), 3)
                if arrive > s["time"] and need > 0:
                    rep["missMm"] = round(math.hypot(pose["rootVec"][3] - prev["rootVec"][3],
                                                     pose["rootVec"][4] - prev["rootVec"][4]) *
                                          (arrive - s["time"]) / need, 1)
                ready = arrive
            if depart > keys[-1]["t"] + 1e-6:
                keys.append({"t": round(depart, 4), "phase": "depart", "strike": i - 1})
            keys.append({"t": round(ready, 4), "phase": "ready", "strike": i})
        keys.append({"t": round(max(s["time"], keys[-1]["t"] + 1e-3), 4), "phase": "strike", "strike": i})
        poses.append(pose)
        report.append(rep)
        sounding = [h for h in sounding if h["pitch"] in {k["pitch"] for k in kept}] + \
                   [n for n in s["notes"]]
    return {"hand": hand, "keys": keys, "poses": poses, "report": report}


def _json(plan_):
    return json.dumps({k: plan_[k] for k in ("hand", "keys", "report")} |
                      {"roots": [p["rootVec"] for p in plan_["poses"]]}, sort_keys=True, default=float)


def _speed(argv):
    from video_hands import Plane, load_frames
    package, keyboard = argv[:2]
    frames = load_frames(os.path.join(package, "hands.raw.jsonl"))
    plane = Plane(json.load(open(keyboard, encoding="utf-8"))["H"], frames[0]["w"], frames[0]["h"])
    tracks = {}
    for fr in frames:
        for h in fr["hands"]:
            k = plane.keys([h["landmarks"][0], h["landmarks"][9]]) * np.array([M.WHITE_W, 10.0])
            tracks.setdefault(h["trackId"], []).append((fr["i"], fr["t"], *k[0], *k[1], h.get("predictedSide")))
    med = lambda a: np.array([np.median(a[max(0, i - MEDIAN_N // 2):i + MEDIAN_N // 2 + 1]) for i in range(len(a))])
    D = WINDOW_FRAMES
    sp, yw, dropped = {"left": [], "right": []}, {"left": [], "right": []}, 0
    for rows in tracks.values():
        rows.sort()
        segs, cur = [], [rows[0]]
        for r in rows[1:]:
            if r[0] - cur[-1][0] == 1:
                cur.append(r)
            else:
                segs.append(cur)
                cur = [r]
        segs.append(cur)
        for sg in segs:
            if len(sg) < 2 * D + 2 * JITTER_HALF + 1:
                continue
            a = np.array([r[1:6] for r in sg], float)
            sides = [r[6] for r in sg]
            side = max(set(sides), key=sides.count) or "right"
            step = np.r_[0, np.hypot(np.diff(a[:, 1]), np.diff(a[:, 2]))]
            calm = np.array([np.median(step[max(0, i - JITTER_HALF):i + JITTER_HALF + 1]) for i in range(len(step))]) <= JITTER_MM
            t, wx, wy = a[:, 0], med(a[:, 1]), med(a[:, 2])
            yaw = med(np.degrees(np.unwrap(np.arctan2(a[:, 3] - a[:, 1], a[:, 4] - a[:, 2]))))
            dt = t[2 * D:] - t[:-2 * D]
            v = np.hypot(wx[2 * D:] - wx[:-2 * D], wy[2 * D:] - wy[:-2 * D]) / dt
            w = np.abs(yaw[2 * D:] - yaw[:-2 * D]) / dt
            ok = calm[2 * D:] & calm[:-2 * D]
            dropped += int((~ok).sum())
            sp[side] += list(v[ok])
            yw[side] += list(w[ok])
    for side in ("left", "right"):
        v, w = np.array(sp[side]), np.array(yw[side])
        print(f"{side}: n {len(v)}; wrist mm/s p50 {np.percentile(v, 50):.0f} p90 {np.percentile(v, 90):.0f} "
              f"p99 {np.percentile(v, 99):.0f}; yaw deg/s p50 {np.percentile(w, 50):.0f} p90 {np.percentile(w, 90):.0f} "
              f"p99 {np.percentile(w, 99):.0f}")
    print("dropped as jitter", dropped)


def _check(argv):
    import argparse
    import hand_library, hand_shape
    ap = argparse.ArgumentParser(prog="hand_plan.py check")
    ap.add_argument("folder")
    ap.add_argument("--rest", required=True)
    ap.add_argument("--song", default="seven-nation-army")
    ap.add_argument("--from", dest="t0", type=float, default=2.7)
    ap.add_argument("--to", dest="t1", type=float, default=18.5)
    ap.add_argument("--out")
    a = ap.parse_args(argv)
    features = json.load(open(os.path.join(a.folder, "features.json"), encoding="utf-8"))
    package = json.load(open(os.path.join(a.folder, "index.json"), encoding="utf-8"))["package"]
    notes = json.load(open(os.path.join(package, "notes.json"), encoding="utf-8"))["notes"]
    ends = {n["id"]: n["offset"] for n in notes}
    lib = hand_library.load(a.song)
    out, ok = {}, True
    for hand, side in (("right", "R"), ("left", "L")):
        rest = hand_shape.load_rest(a.rest, side)
        strikes = strikes_of(features, ends, hand, a.t0, a.t1)
        if not strikes:
            continue
        p1, p2 = plan(rest, lib, hand, strikes), plan(rest, lib, hand, strikes)
        same = _json(p1) == _json(p2)
        rep = p1["report"]
        held = [(r["id"], h) for r in rep for h in r["held"]]
        # a held note keeps its tip on its key: its finger is in contact in the strike's pose
        lost = [(r["id"], h) for r, pose in zip(rep, p1["poses"]) for h in r["held"]
                if max(pose["missMm"].get(f, 0.0) for f, q in pose["notes"] if q == h) > M.MISS_MM]
        mono = all(b["t"] >= a_["t"] for a_, b in zip(p1["keys"], p1["keys"][1:]))
        count = lambda fl: sum(fl in r["flags"] for r in rep)
        late = [r["lateS"] for r in rep if r["lateS"] > 0]
        print(f"{hand}: strikes {len(strikes)}, keys {len(p1['keys'])}, same plan twice {same}, keys in time order {mono}; "
              f"held {len(held)}, held off their key {len(lost)}, released {sum(len(r['released']) for r in rep)}; "
              f"cut {count('cut')}, degraded {count('degraded')} (late max {max(late, default=0):.3f} s, miss at onset max "
              f"{max((r['missMm'] for r in rep), default=0):.1f} mm), impossible {count('impossible')}")
        ok = ok and same and mono and not lost
        out[hand] = json.loads(_json(p1))
    if a.out:
        json.dump(out, open(a.out, "w", encoding="utf-8"), indent=1)
    assert ok, "plan check failed"
    print("CHECK PASSED")


if __name__ == "__main__":
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    if sys.argv[1:2] == ["speed"]:
        _speed(sys.argv[2:])
    elif sys.argv[1:2] == ["check"]:
        _check(sys.argv[2:])
