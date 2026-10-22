"""Sequential hand inference retaining every source presentation timestamp."""
import hashlib
import importlib.metadata
import json
import math
from collections import Counter
from pathlib import Path

from tracking import HandTracker, model_timestamp, source_landmark

CONNECTIONS = [(0, 1), (1, 2), (2, 3), (3, 4), (0, 5), (5, 6), (6, 7),
               (7, 8), (5, 9), (9, 10), (10, 11), (11, 12), (9, 13),
               (13, 14), (14, 15), (15, 16), (13, 17), (0, 17),
               (17, 18), (18, 19), (19, 20)]


def crop_bounds(roi, width, height):
    if roi is None:
        return (0, 0, width, height)
    x, y, w, h = [roi[key] for key in ('x', 'y', 'width', 'height')]
    if not all(math.isfinite(n) for n in (x, y, w, h)) or min(x, y) < 0 or min(w, h) <= 0 or x + w > 1 or y + h > 1:
        raise ValueError('ROI must be inside the normalized source image')
    result = (int(x * width), int(y * height), int((x + w) * width), int((y + h) * height))
    if result[2] <= result[0] or result[3] <= result[1]:
        raise ValueError('ROI has no pixels')
    return result


def draw_overlay(image, row, calibration, path):
    from PIL import ImageDraw
    draw = ImageDraw.Draw(image)
    width, height = image.size
    for key in calibration.get('keys', []):
        polygon = [(p['x'] * width, p['y'] * height) for p in key['polygon']]
        draw.polygon(polygon, outline='#ffee00', width=1)
    for hand in row['hands']:
        points = [(p['x'] * width, p['y'] * height) for p in hand['landmarks']]
        color = '#00e6ff' if hand['side'] == 'left' else '#ff55dd'
        for start, end in CONNECTIONS:
            draw.line([points[start], points[end]], fill=color, width=3)
        for index, (x, y) in enumerate(points):
            draw.ellipse((x - 3, y - 3, x + 3, y + 3), fill=color)
            draw.text((x + 4, y), str(index), fill='white')
        draw.text(points[0], hand['trackId'] + ' ' + str(hand['side']), fill='white')
    draw.text((10, 10), f"frame={row['frameIndex']} pts={row['pts']} time={row['time']:.6f}", fill='white')
    with open(path, 'xb') as target:
        image.save(target, format='PNG')


def extract(args):
    import av
    import mediapipe as mp
    from mediapipe.tasks import python
    from mediapipe.tasks.python import vision

    calibration = json.loads(Path(args.calibration).read_text(encoding='utf-8')) if args.calibration else {}
    roi = calibration.get('roi')
    if args.roi:
        roi = dict(zip(('x', 'y', 'width', 'height'), map(float, args.roi.split(','))))
    mirrored = calibration.get('mirrored')
    tracker = HandTracker()
    counters = Counter()
    previous_timestamp = None
    previous_source_time = None
    overlay_dir = Path(args.overlay_dir) if args.overlay_dir else None
    if overlay_dir:
        overlay_dir.mkdir(parents=True, exist_ok=True)
        if any(overlay_dir.iterdir()):
            raise FileExistsError('Overlay output directory is not empty')
    options = vision.HandLandmarkerOptions(
        base_options=python.BaseOptions(model_asset_path=args.model),
        running_mode=vision.RunningMode.VIDEO, num_hands=2,
        min_hand_detection_confidence=0.5, min_hand_presence_confidence=0.5,
        min_tracking_confidence=0.5)
    with av.open(args.video) as container, vision.HandLandmarker.create_from_options(options) as model, open(args.output, 'x', encoding='utf-8') as target:
        stream = container.streams.video[0]
        for frame_index, frame in enumerate(container.decode(stream)):
            if frame.pts is None or frame.time_base is None:
                raise RuntimeError(f'Frame {frame_index} has no PTS/time base; refusing synthetic timing')
            time = float(frame.pts * frame.time_base)
            if args.start is not None and time < args.start:
                continue
            if args.end is not None and time >= args.end:
                break
            if previous_source_time is not None and time <= previous_source_time:
                raise RuntimeError('Non-increasing source PTS; cannot establish temporal correspondence')
            previous_source_time = time
            timestamp, adjusted = model_timestamp(time, previous_timestamp)
            previous_timestamp = timestamp
            image = frame.to_ndarray(format='rgb24')
            height, width = image.shape[:2]
            crop = crop_bounds(roi, width, height)
            left, top, right, bottom = crop
            import numpy as np
            cropped = np.ascontiguousarray(image[top:bottom, left:right])
            result = model.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=cropped), timestamp)
            hands = []
            for index, points in enumerate(result.hand_landmarks):
                category = result.handedness[index][0]
                predicted = category.category_name.lower()
                # Camera orientation and dorsal views can invalidate handedness.
                # Only human review assigns anatomical side; mirroring is metadata.
                hands.append({'side': None, 'predictedSide': predicted,
                              'handednessScore': float(category.score),
                              'landmarks': [source_landmark(p, crop, width, height) for p in points],
                              'worldLandmarks': [{'x': float(p.x), 'y': float(p.y), 'z': float(p.z)} for p in result.hand_world_landmarks[index]],
                              'worldIsEstimate': True})
            diagnostics = tracker.assign(hands, time)
            if not hands:
                diagnostics.append('no-hands-detected')
            if adjusted:
                diagnostics.append('model-millisecond-timestamp-adjusted')
            counters.update(diagnostics)
            counters['frames'] += 1
            counters['handObservations'] += len(hands)
            row = {'frameIndex': frame_index, 'pts': str(frame.pts), 'timeBase': str(frame.time_base),
                   'time': time, 'width': width, 'height': height,
                   'hands': hands, 'diagnostics': diagnostics}
            target.write(json.dumps(row, allow_nan=False, separators=(',', ':')) + '\n')
            if overlay_dir and (counters['frames'] - 1) % args.overlay_every == 0:
                from PIL import Image
                draw_overlay(Image.fromarray(image), row, calibration, overlay_dir / f'{frame_index:08d}.png')
            if counters['frames'] % 300 == 0:
                print(json.dumps({'progressFrames': counters['frames'], 'time': time}), flush=True)
    summary = {'schemaVersion': 1,
               'backend': {'name': 'mediapipe', 'version': importlib.metadata.version('mediapipe'),
                           'modelSha256': hashlib.sha256(Path(args.model).read_bytes()).hexdigest(),
                           'avVersion': importlib.metadata.version('av')},
               'range': {'start': args.start, 'end': args.end},
               'roi': roi, 'mirrored': mirrored, 'counters': dict(counters),
               'worldCoordinates': {'units': 'estimated meters', 'origin': 'hand geometric center',
                                    'calibratedWorld': False},
               'warnings': ['Landmarks and handedness are unreviewed model predictions.',
                            'Occluded joints may be hallucinated; no per-joint confidence is supplied.']}
    if not counters['frames']:
        raise RuntimeError('No frames in requested source interval')
    with open(args.summary, 'x', encoding='utf-8') as target:
        json.dump(summary, target, indent=2, allow_nan=False)
