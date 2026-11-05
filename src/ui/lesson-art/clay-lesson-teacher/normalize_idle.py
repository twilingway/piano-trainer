"""Normalize the single reviewed idle cutout without creative pixel edits."""
from array import array
import hashlib
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent
REFERENCE = ROOT.parent / "animation-prototypes/teacher/mi-press-v2.png"
SOURCE = ROOT / "idle-source.png"
FRAME_SIZE = (512, 544)
PIVOT = (256, 528)

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def clean_hidden(image):
    raw = bytearray(image.tobytes())
    for i in range(0, len(raw), 4):
        if raw[i + 3] == 0:
            raw[i:i + 3] = b"\0\0\0"
    return Image.frombytes("RGBA", image.size, bytes(raw))

def largest_subject(alpha):
    w, h = alpha.size
    mask = bytearray(alpha.point(lambda a: 255 if a > 32 else 0).tobytes())
    largest = array("I")
    for seed in range(len(mask)):
        if not mask[seed]:
            continue
        component = array("I", [seed])
        mask[seed] = 0
        cursor = 0
        while cursor < len(component):
            i = component[cursor]
            cursor += 1
            x = i % w
            for near in ([i - 1] if x else []) + ([i + 1] if x + 1 < w else []) + ([i - w] if i >= w else []) + ([i + w] if i + w < w * h else []):
                if mask[near]:
                    mask[near] = 0
                    component.append(near)
        if len(component) > len(largest):
            largest = component
    if not 0.05 < len(largest) / (w * h) < 0.8:
        raise ValueError("Unsafe subject occupancy; background extraction required")
    raw = bytearray(w * h)
    for i in largest:
        raw[i] = 255
    return Image.frombytes("L", (w, h), bytes(raw)).filter(ImageFilter.MaxFilter(7))

def black_key_centers(image):
    result = []
    start = None
    for x in range(400, 1120):
        r, g, b, a = image.getpixel((x, 775))
        hit = a > 128 and max(r, g, b) < 100
        if hit and start is None:
            start = x
        if start is not None and (not hit or x == 1119):
            if x - start > 8:
                result.append((start + x - 1) / 2)
            start = None
    return result

def main():
    original = Image.open(SOURCE).convert("RGBA")
    assert original.size == (1536, 1024)
    alpha = original.getchannel("A")
    low, high = alpha.getextrema()
    corners = [alpha.getpixel(p) for p in [(0, 0), (1535, 0), (0, 1023), (1535, 1023)]]
    if low != 0 or high < 250 or max(corners) > 7:
        raise ValueError("Opaque source or baked haze must be rejected")
    subject = largest_subject(alpha)
    normalized = original.copy()
    scaled = alpha.point(lambda a: min(255, round(a * 255 / high)))
    kept = Image.new("L", original.size, 0)
    kept.paste(scaled, (0, 0), subject)
    normalized.putalpha(kept)
    normalized = clean_hidden(normalized)
    rgb_same = all(a[:3] == b[:3] for a, b in zip(original.getdata(), normalized.getdata()) if b[3])
    assert rgb_same
    canvas = Image.new("RGBA", (1024, 1088))
    canvas.paste(normalized.crop((256, 0, 1280, 1024)), (0, 32))
    frame = clean_hidden(canvas.resize(FRAME_SIZE, Image.Resampling.LANCZOS))
    bounds = frame.getchannel("A").point(lambda a: 255 if a >= 128 else 0).getbbox()
    delta_y = PIVOT[1] - bounds[3]
    anchored = Image.new("RGBA", FRAME_SIZE)
    anchored.paste(frame, (0, delta_y))
    anchored = clean_hidden(anchored)
    anchored.save(ROOT / "idle-frame.png")
    anchored.save(ROOT / "idle-frame.webp", lossless=True, exact=True)
    assert Image.open(ROOT / "idle-frame.webp").convert("RGBA").tobytes() == anchored.tobytes()
    qa = ROOT / "qa"
    qa.mkdir(exist_ok=True)
    reference = Image.open(REFERENCE).convert("RGBA")
    key_reference = black_key_centers(reference)
    key_idle = black_key_centers(normalized)
    if len(key_reference) != 10 or len(key_idle) != 10:
        raise ValueError("Black key inventory changed")
    key_deltas = [round(abs(a - b), 3) for a, b in zip(key_reference, key_idle)]
    if max(key_deltas) > 3:
        raise ValueError("Keyboard drift beyond3px source tolerance")
    groups = []
    for index, center in enumerate(key_idle):
        if index == 0 or center - key_idle[index - 1] > 80:
            groups.append(1)
        else:
            groups[-1] += 1
    if groups != [3, 2, 3, 2]:
        raise ValueError("Mirrored keyboard groups changed")
    report = {
        "status": "mechanical-normalization-passed-awaiting-native-context",
        "sourceSha256": sha(SOURCE),
        "referenceSha256": sha(REFERENCE),
        "sourceCanvas": list(original.size),
        "sourceAlphaRange": [low, high],
        "sourceCornerAlpha": corners,
        "retainedVisibleRgbUnchanged": rgb_same,
        "frameSize": list(FRAME_SIZE),
        "pivotPx": list(PIVOT),
        "sourceCropPx": [256, 0, 1280, 1024],
        "sourceOffsetPx": [0, 32],
        "translationAfterScalePx": [0, delta_y],
        "frameVisibleBoundsAlpha128": list(anchored.getchannel("A").point(lambda a: 255 if a >= 128 else 0).getbbox()),
        "frameAlphaRange": list(anchored.getchannel("A").getextrema()),
        "pngSha256": sha(ROOT / "idle-frame.png"),
        "webpSha256": sha(ROOT / "idle-frame.webp"),
        "webpExactRgba": True,
        "normalization": "Largest connected alpha>32, dilate3px; scale maximum opacity to255; zero hidden RGB; common crop/0.5scale and integer anchor translation. No creative RGB edits.",
        "blackKeyScanSourceY": 775,
        "blackKeyReferenceCenters": key_reference,
        "blackKeyIdleCenters": key_idle,
        "blackKeyCenterDeltasSourcePx": key_deltas,
        "blackKeyMaximumCenterDriftFramePx": max(key_deltas) * 0.5,
        "blackKeyGroupsViewerLeftToRight": groups,
        "visualGate": "Hands neutral, no target patch, unchanged mirrored 3-2-3-2 keyboard group order reviewed on dark/light composites; fifth fingertip not independently countable."
    }
    for label, color in [("dark", (8, 24, 32, 255)), ("light", (242, 242, 240, 255))]:
        full = Image.new("RGBA", (1024, 600), color)
        full.alpha_composite(anchored, (256, 20))
        full.convert("RGB").save(qa / ("idle-" + label + ".jpg"), quality=94)
        comparison = Image.new("RGBA", (1536, 360), color)
        comparison.alpha_composite(reference.crop((300, 625, 1236, 835)).resize((748, 168)), (10, 40))
        comparison.alpha_composite(normalized.crop((300, 625, 1236, 835)).resize((748, 168)), (778, 40))
        draw = ImageDraw.Draw(comparison)
        draw.text((12, 12), "Accepted Mi reference", fill=(130, 130, 130))
        draw.text((780, 12), "Neutral idle: no active key", fill=(130, 130, 130))
        comparison.convert("RGB").save(qa / ("keyboard-compare-" + label + ".jpg"), quality=95)
    (qa / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps(report, indent=2))

if __name__ == "__main__":
    main()
