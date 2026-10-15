"""Conservative hand correspondence; ids describe observations, not anatomy."""
import itertools
import math


class HandTracker:
    def __init__(self, max_gap=0.15, max_distance=0.12, ambiguity_margin=0.025):
        self.max_gap = max_gap
        self.max_distance = max_distance
        self.ambiguity_margin = ambiguity_margin
        self.previous = []
        self.previous_time = None
        self.next_id = 1

    def assign(self, hands, time):
        diagnostics = []
        previous = self.previous
        if self.previous_time is not None and time - self.previous_time > self.max_gap:
            previous = []
            diagnostics.append('tracking-gap')
        assignments = []
        # At most two hands: enumerate partial injective matches. An ambiguous
        # correspondence gets fresh ids rather than invented continuity.
        for choices in itertools.product(range(-1, len(previous)), repeat=len(hands)):
            matched = [i for i in choices if i >= 0]
            if len(set(matched)) != len(matched):
                continue
            distance = 0.0
            valid = True
            for current, old in enumerate(choices):
                if old < 0:
                    continue
                a, b = hands[current]['landmarks'][0], previous[old]['landmarks'][0]
                d = math.hypot(a['x'] - b['x'], a['y'] - b['y'])
                if d > self.max_distance:
                    valid = False
                    break
                distance += d
            if valid:
                assignments.append((len(matched), distance, choices))
        assignments.sort(key=lambda item: (-item[0], item[1]))
        choices = assignments[0][2] if assignments else [-1] * len(hands)
        if (len(assignments) > 1 and assignments[0][0] > 0
                and assignments[0][0] == assignments[1][0]
                and assignments[1][1] - assignments[0][1] < self.ambiguity_margin):
            choices = [-1] * len(hands)
            diagnostics.append('ambiguous-correspondence-new-track-ids')
        for hand, old in zip(hands, choices):
            if old < 0:
                hand['trackId'] = f'hand-{self.next_id:06d}'
                self.next_id += 1
            else:
                hand['trackId'] = previous[old]['trackId']
                if hand.get('predictedSide', hand['side']) != previous[old].get('predictedSide', previous[old]['side']):
                    diagnostics.append('handedness-prediction-changed')
        if previous and len(hands) < len(previous):
            diagnostics.append('hand-detection-gap')
        self.previous = hands
        self.previous_time = time
        return diagnostics


def source_landmark(point, crop, width, height):
    """Map crop-relative model coordinates to the complete source image."""
    left, top, right, bottom = crop
    return {'x': (left + point.x * (right - left)) / width,
            'y': (top + point.y * (bottom - top)) / height,
            'z': point.z * (right - left) / width}


def model_timestamp(time, previous):
    """MediaPipe needs increasing milliseconds; exported PTS remains intact."""
    wanted = round(time * 1000)
    actual = wanted if previous is None else max(wanted, previous + 1)
    return actual, actual != wanted
