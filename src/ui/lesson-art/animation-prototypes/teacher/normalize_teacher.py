"""Normalize reviewed teacher cutouts without changing hands, keys, or visible RGB.

Largest connected alpha>32 subject, three-pixel dilation, opaque 254->255,
and invisible RGB cleanup were explicitly authorized for these generated assets.
"""
from array import array
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

from inspect_teacher import inspect, inspect_sources

ROOT = Path(__file__).resolve().parent
POSES = {
    "do": {"source": "sources/teacher-do-insert-source.png", "finger": 1, "pitch": "C", "contactReview": "verified"},
    "re": {"source": "sources/teacher-re-extracted-source.png", "finger": 2, "pitch": "D", "contactReview": "verified", "anatomyLimitation": "Four fingertip silhouettes readable; fifth fingertip is not independently verifiable."},
    "mi": {"source": "sources/teacher-mi-clean-source.png", "finger": 3, "pitch": "E", "contactReview": "verified"},
}
FRAME_SIZE = (512, 544)
PIVOT = (256, 528)
SOURCE_CROP = (256, 0, 1280, 1024)
SOURCE_OFFSET_IN_CANVAS = (0, 32)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def clean_hidden_rgb(image):
    pixels = bytearray(image.tobytes())
    for index in range(0, len(pixels), 4):
        if pixels[index + 3] == 0:
            pixels[index:index + 3] = b"\0\0\0"
    return Image.frombytes("RGBA", image.size, bytes(pixels))


def subject_mask(alpha):
    width, height = alpha.size
    pixels = bytearray(alpha.point(lambda value: 255 if value > 32 else 0).tobytes())
    largest = array("I")
    component_count = 0
    for seed in range(len(pixels)):
        if pixels[seed] == 0:
            continue
        component_count += 1
        component = array("I", [seed])
        pixels[seed] = 0
        cursor = 0
        while cursor < len(component):
            index = component[cursor]
            cursor += 1
            column = index % width
            adjacent = []
            if column:
                adjacent.append(index - 1)
            if column + 1 < width:
                adjacent.append(index + 1)
            if index >= width:
                adjacent.append(index - width)
            if index + width < width * height:
                adjacent.append(index + width)
            for neighbor in adjacent:
                if pixels[neighbor]:
                    pixels[neighbor] = 0
                    component.append(neighbor)
        if len(component) > len(largest):
            largest = component
    if not (0.05 < len(largest) / (width * height) < 0.8):
        raise ValueError("Subject occupancy is unsafe; do not repair a baked opaque background")
    mask = bytearray(width * height)
    for index in largest:
        mask[index] = 255
    result = Image.frombytes("L", alpha.size, bytes(mask)).filter(ImageFilter.MaxFilter(7))
    return result, {"connectedComponentsAboveAlpha32": component_count, "largestComponentPixels": len(largest), "dilationPx": 3}


def normalize(source):
    image, before = inspect(source)
    if image.size != (1536, 1024) or before["alphaRange"][0] != 0 or not before["fullyTransparentPixels"]:
        raise ValueError("Invalid source canvas or missing true transparency")
    if max(before["cornerAlpha"]) > 7 or before["alphaRange"][1] < 250:
        raise ValueError("Source has a baked haze or lacks an opaque subject")
    alpha = image.getchannel("A")
    mask, mask_report = subject_mask(alpha)
    maximum = before["alphaRange"][1]
    scaled = alpha.point(lambda value: min(255, round(value * 255 / maximum)))
    new_alpha = Image.new("L", image.size, 0)
    new_alpha.paste(scaled, (0, 0), mask)
    normalized = image.copy()
    normalized.putalpha(new_alpha)
    normalized = clean_hidden_rgb(normalized)
    kept_rgb_unchanged = all(old[:3] == new[:3] for old, new in zip(image.getdata(), normalized.getdata()) if new[3] > 0)
    if not kept_rgb_unchanged:
        raise AssertionError("Visible RGB changed")
    return normalized, {"before": before, "mask": mask_report, "alphaScaleNumerator": 255, "alphaScaleDenominator": maximum, "retainedVisibleRgbUnchanged": kept_rgb_unchanged}


def sprite_frame(image):
    canvas = Image.new("RGBA", (1024, 1088))
    canvas.paste(image.crop(SOURCE_CROP), SOURCE_OFFSET_IN_CANVAS)
    frame = clean_hidden_rgb(canvas.resize(FRAME_SIZE, Image.Resampling.LANCZOS))
    bounds = frame.getchannel("A").point(lambda value: 255 if value >= 128 else 0).getbbox()
    offset_y = PIVOT[1] - bounds[3]
    anchored = Image.new("RGBA", FRAME_SIZE)
    anchored.paste(frame, (0, offset_y))
    anchored = clean_hidden_rgb(anchored)
    final_bounds = anchored.getchannel("A").point(lambda value: 255 if value >= 128 else 0).getbbox()
    if final_bounds[3] != PIVOT[1]:
        raise AssertionError("Pose baseline differs from the common pivot")
    return anchored, {"translationAfterScalePx": [0, offset_y], "visibleBoundsAlpha128": list(final_bounds)}



def preview_report(frames):
    """Compare animation decodes, permitting only invisible RGB in libwebp."""
    durations = [900] * len(frames)
    webp_path = ROOT / "previews/teacher-cde.webp"
    frames[0].save(webp_path, save_all=True, append_images=frames[1:], duration=durations, loop=0, lossless=True, exact=True, method=6)
    png_path = ROOT / "previews/teacher-cde.png"
    frames[0].save(png_path, save_all=True, append_images=frames[1:], duration=durations, loop=0, disposal=0, blend=0)
    report = {"durationMsPerPose": durations, "loop": 0, "webp": [], "apng": []}
    for kind, path in (("webp", webp_path), ("apng", png_path)):
        animation = Image.open(path)
        if animation.n_frames != len(frames):
            raise AssertionError("Wrong animation frame count")
        for index, expected in enumerate(frames):
            animation.seek(index)
            actual = animation.convert("RGBA")
            differences = [(a, b) for a, b in zip(actual.getdata(), expected.getdata()) if a != b]
            visible = sum(1 for a, b in differences if a[3] or b[3])
            if visible or (kind == "apng" and differences):
                raise AssertionError("Animation changed visible pixels or APNG RGBA")
            report[kind].append({"pose": list(POSES)[index], "visiblePixelDifferences": visible, "invisibleRgbDifferences": len(differences)})
    # Read the encoded WebP frame durations rather than Pillow's optional metadata.
    data = webp_path.read_bytes()
    position = 12
    encoded_durations = []
    while position + 8 <= len(data):
        size = int.from_bytes(data[position + 4:position + 8], "little")
        if data[position:position + 4] == b"ANMF":
            encoded_durations.append(int.from_bytes(data[position + 20:position + 23], "little"))
        position += 8 + size + size % 2
    if encoded_durations != durations:
        raise AssertionError("Encoded WebP timing differs")
    report["encodedWebpDurationMs"] = encoded_durations
    for theme, background, foreground in (("light", "#f1eee5", "#182e31"), ("dark", "#142c31", "#f5f3e9")):
        sheet = Image.new("RGBA", (FRAME_SIZE[0] * len(frames), FRAME_SIZE[1] + 48), background)
        draw = ImageDraw.Draw(sheet)
        try:
            font = ImageFont.truetype("C:/Windows/Fonts/segoeui.ttf", 24)
        except OSError:
            font = ImageFont.load_default()
        for index, frame in enumerate(frames):
            left = index * FRAME_SIZE[0]
            sheet.alpha_composite(frame, (left, 48))
            draw.text((left + 28, 10), ("До · палец 1", "Ре · палец 2", "Ми · палец 3")[index], fill=foreground, font=font)
        sheet.convert("RGB").save(ROOT / ("qa/teacher-cde-" + theme + ".jpg"), quality=95, subsampling=0)
    (ROOT / "qa/animation-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main():
    (ROOT / "sheets").mkdir(exist_ok=True)
    (ROOT / "previews").mkdir(exist_ok=True)
    reports = {}
    frames = []
    manifest = {
        "schemaVersion": 1,
        "status": "prototype-contact-verified-not-integrated",
        "generationTool": "built-in image_gen",
        "normalization": "Largest connected alpha>32 subject; dilate3px; normalize max opacity to255; zero invisible RGB. No hand, key, face or body RGB changes.",
        "sourceCanvas": [1536, 1024],
        "frameSize": list(FRAME_SIZE),
        "pivotPx": list(PIVOT),
        "sourceCropPx": list(SOURCE_CROP),
        "sourceCropOffsetPx": list(SOURCE_OFFSET_IN_CANVAS),
        "uniformScale": 0.5,
        "poses": {},
        "rejectedHistory": "Wrong D insert and old alpha-baked D display candidate are excluded; see README. Frozen generation reference inputs are not display assets.",
        "sampling": "linear; clamp sprite frame rectangles; no generated mipmaps",
        "gameplayIntegration": False,
        "anatomyLimitation": "Four fingertips are readable in these views; all five are not independently verified. Contact review is scoped to the designated thumb/index/middle.",
    }
    for note, pose in POSES.items():
        source = ROOT / pose["source"]
        normalized, report = normalize(source)
        report["before"]["file"] = pose["source"]
        png = ROOT / (note + "-press-v2.png")
        webp = ROOT / (note + "-press-v2.webp")
        normalized.save(png)
        normalized.save(webp, format="WEBP", lossless=True, exact=True, method=6)
        decoded = Image.open(webp).convert("RGBA")
        if decoded.tobytes() != normalized.tobytes():
            raise AssertionError("Lossless WebP roundtrip changed RGBA")
        _, after = inspect(png)
        if not after["strictAlphaGate"] or after["invisibleRgbPixels"]:
            raise AssertionError("Normalized cutout failed strict alpha gate")
        report.update({"after": after, "losslessWebpRoundtrip": True})
        reports[note] = report
        frame, frame_geometry = sprite_frame(normalized)
        frame_path = ROOT / "sheets" / (note + "-press-frame.webp")
        frame.save(frame_path, format="WEBP", lossless=True, exact=True, method=6)
        frames.append(frame)
        manifest["poses"][note] = {**pose, "sourceSha256": sha(source), "png": png.name, "webp": webp.name, "pngSha256": sha(png), "webpSha256": sha(webp), "frame": "sheets/" + frame_path.name, "strictAlphaGate": True, "frameGeometry": frame_geometry}
    sheet = Image.new("RGBA", (FRAME_SIZE[0] * len(frames), FRAME_SIZE[1]))
    for index, frame in enumerate(frames):
        sheet.paste(frame, (index * FRAME_SIZE[0], 0))
    sheet.save(ROOT / "sheets/teacher-cde.webp", format="WEBP", lossless=True, exact=True, method=6)
    preview_report(frames)
    (ROOT / "manifest-v2.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (ROOT / "qa/normalization-report.json").write_text(json.dumps(reports, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    inspect_sources([ROOT / (note + "-press-v2.png") for note in POSES], ROOT / "qa/normalized-v2")
    print(json.dumps({note: {"before": report["before"]["alphaRange"], "after": report["after"]["alphaRange"], "corners": report["after"]["cornerAlpha"], "removedLowAlphaPixels": report["before"]["lowAlphaNoisePixels1to7"] - report["after"]["lowAlphaNoisePixels1to7"]} for note, report in reports.items()}, indent=2))


if __name__ == "__main__":
    main()
