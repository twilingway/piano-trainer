"""Read-only source inspection and proper alpha-composited teacher previews.

No source pixels, alpha values, hand positions, or key positions are changed.
"""
import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw

EXPECTED_SIZE = (1536, 1024)
HAND_CROP = (450, 550, 820, 820)
BACKGROUNDS = {"dark": "#04101b", "light": "#f2ede4"}


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def inspect(path):
    source = Image.open(path)
    image = source.convert("RGBA")
    alpha = image.getchannel("A")
    hist = alpha.histogram()
    corners = [alpha.getpixel(point) for point in (
        (0, 0), (image.width - 1, 0),
        (0, image.height - 1), (image.width - 1, image.height - 1)
    )]
    opaque_bounds = alpha.point(lambda value: 255 if value >= 128 else 0).getbbox()
    strict_alpha = (source.mode == "RGBA" and alpha.getextrema() == (0, 255)
                    and hist[0] > 0 and hist[255] > 0 and all(value == 0 for value in corners))
    return image, {
        "file": path.name,
        "sha256": sha(path),
        "mode": source.mode,
        "size": list(image.size),
        "matchesExpectedCanvas": image.size == EXPECTED_SIZE,
        "alphaRange": list(alpha.getextrema()),
        "cornerAlpha": corners,
        "fullyTransparentPixels": hist[0],
        "fullyOpaquePixels": hist[255],
        "nearOpaquePixels250to255": sum(hist[250:]),
        "lowAlphaNoisePixels1to7": sum(hist[1:8]),
        "invisibleRgbPixels": sum(1 for red, green, blue, opacity in image.getdata()
                                  if opacity == 0 and (red or green or blue)),
        "boundsAlpha128": list(opaque_bounds) if opaque_bounds else None,
        "strictAlphaGate": strict_alpha,
        "visualContactGate": "pending-human-inspection",
        "automaticAcceptance": False,
    }


def compose(image, background):
    canvas = Image.new("RGBA", image.size, background)
    return Image.alpha_composite(canvas, image).convert("RGB")


def inspect_sources(paths, output):
    output.mkdir(parents=True, exist_ok=True)
    reports = []
    for path in paths:
        image, report = inspect(path)
        reports.append(report)
        for theme, background in BACKGROUNDS.items():
            composite = compose(image, background)
            preview = composite.resize((768, 512), Image.Resampling.LANCZOS)
            preview.save(output / (path.stem + "-" + theme + ".jpg"), quality=94)
            if image.size == EXPECTED_SIZE:
                composite.crop(HAND_CROP).resize((1110, 810), Image.Resampling.NEAREST).save(
                    output / (path.stem + "-contact-" + theme + ".png"))
    (output / "report.json").write_text(json.dumps({
        "schemaVersion": 1,
        "operation": "source-inspection-only",
        "normalization": "none; source images and alpha unchanged",
        "handCropFullSourcePx": list(HAND_CROP),
        "expectedCanvas": list(EXPECTED_SIZE),
        "images": reports,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return reports


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("images", nargs="+", type=Path)
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()
    result = inspect_sources(args.images, args.out)
    print(json.dumps([{
        "file": item["file"], "alphaRange": item["alphaRange"],
        "strictAlphaGate": item["strictAlphaGate"],
        "cornerAlpha": item["cornerAlpha"]
    } for item in result], indent=2))
