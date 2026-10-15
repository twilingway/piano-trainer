"""Offline behavioral checks; no model downloads or GPU are needed."""
import json
import tempfile
import unittest
from fractions import Fraction
from pathlib import Path
from types import SimpleNamespace

from hands import crop_bounds
from music import export_midi, normalize_notes
from tracking import HandTracker, model_timestamp, source_landmark


def hand(x, side='left'):
    return {'side': side, 'landmarks': [{'x': x, 'y': 0.5, 'z': 0}] * 21}


class CorrespondenceTests(unittest.TestCase):
    def test_detection_order_does_not_swap_tracks(self):
        tracker = HandTracker()
        first = [hand(0.2), hand(0.8, 'right')]
        tracker.assign(first, 0)
        second = [hand(0.79, 'right'), hand(0.21)]
        tracker.assign(second, 0.03)
        self.assertEqual(second[0]['trackId'], first[1]['trackId'])
        self.assertEqual(second[1]['trackId'], first[0]['trackId'])

    def test_crossing_ambiguity_breaks_ids(self):
        tracker = HandTracker()
        first = [hand(0.48), hand(0.52, 'right')]
        tracker.assign(first, 0)
        second = [hand(0.50), hand(0.50, 'right')]
        diagnostics = tracker.assign(second, 0.03)
        self.assertIn('ambiguous-correspondence-new-track-ids', diagnostics)
        self.assertFalse(set(h['trackId'] for h in first) & set(h['trackId'] for h in second))

    def test_disappearance_does_not_reuse_id(self):
        tracker = HandTracker()
        first = [hand(0.3)]
        tracker.assign(first, 0)
        tracker.assign([], 0.03)
        second = [hand(0.3)]
        tracker.assign(second, 0.06)
        self.assertNotEqual(first[0]['trackId'], second[0]['trackId'])

    def test_time_gap_breaks_id(self):
        tracker = HandTracker()
        first = [hand(0.3)]
        tracker.assign(first, 0)
        second = [hand(0.3)]
        self.assertIn('tracking-gap', tracker.assign(second, 1))
        self.assertNotEqual(first[0]['trackId'], second[0]['trackId'])

    def test_prediction_changes_are_reported_without_assigning_anatomy(self):
        tracker = HandTracker()
        first = [dict(hand(0.3, None), predictedSide='left')]
        tracker.assign(first, 0)
        second = [dict(hand(0.31, None), predictedSide='right')]
        diagnostics = tracker.assign(second, 0.03)
        self.assertIn('handedness-prediction-changed', diagnostics)
        self.assertIsNone(second[0]['side'])
        self.assertEqual(second[0]['trackId'], first[0]['trackId'])


class TimelineTests(unittest.TestCase):
    def test_submillisecond_pts_remain_distinct(self):
        pts = [1, 2, 5]
        times = [float(p * Fraction(1, 10000)) for p in pts]
        previous = None
        timestamps = []
        for time in times:
            previous, _ = model_timestamp(time, previous)
            timestamps.append(previous)
        self.assertEqual(timestamps, [0, 1, 2])
        self.assertEqual(pts, [1, 2, 5])
        self.assertEqual(times, [0.0001, 0.0002, 0.0005])

    def test_crop_coordinates_return_to_full_frame(self):
        bounds = crop_bounds({'x': 0.1, 'y': 0.5, 'width': 0.8, 'height': 0.5}, 1000, 500)
        result = source_landmark(SimpleNamespace(x=0.5, y=0.5, z=-0.1), bounds, 1000, 500)
        self.assertAlmostEqual(result['x'], 0.5)
        self.assertAlmostEqual(result['y'], 0.75)
        self.assertAlmostEqual(result['z'], -0.08)
        with self.assertRaises(ValueError):
            crop_bounds({'x': 0.5, 'y': 0, 'width': 0.8, 'height': 1}, 100, 100)


class MusicTests(unittest.TestCase):
    def test_chords_repetitions_and_absolute_audio_offset(self):
        notes = [SimpleNamespace(start=0.2, end=0.4, pitch=60, velocity=80),
                 SimpleNamespace(start=0, end=0.1, pitch=64, velocity=70),
                 SimpleNamespace(start=0, end=0.15, pitch=60, velocity=90)]
        result = normalize_notes(notes, 5)
        self.assertEqual([(n['pitch'], n['onset']) for n in result], [(60, 5), (64, 5), (60, 5.2)])
        self.assertEqual(len(set(n['id'] for n in result)), 3)
        self.assertAlmostEqual(result[2]['offset'], 5.4)

    def test_nonfinite_note_is_not_silently_exported(self):
        with self.assertRaises(ValueError):
            normalize_notes([SimpleNamespace(start=0, end=float('nan'), pitch=60, velocity=80)], 0)

    def test_midi_preserves_selected_json_intervals(self):
        try:
            import pretty_midi
        except ImportError:
            self.skipTest('pretty_midi is installed by setup-capture')
        notes = [{'pitch': 60, 'onset': 1.001, 'offset': 1.101, 'velocity': 90},
                 {'pitch': 64, 'onset': 1.001, 'offset': 1.201, 'velocity': 70},
                 {'pitch': 60, 'onset': 1.101, 'offset': 1.401, 'velocity': 85}]
        with tempfile.TemporaryDirectory() as directory:
            source, output = Path(directory) / 'notes.json', Path(directory) / 'notes.mid'
            source.write_text(json.dumps(notes), encoding='utf-8')
            export_midi(SimpleNamespace(notes=str(source), output=str(output)))
            actual = pretty_midi.PrettyMIDI(str(output)).instruments[0].notes
            actual.sort(key=lambda n: (n.start, n.pitch))
            for expected, note in zip(notes, actual):
                self.assertEqual(note.pitch, expected['pitch'])
                self.assertEqual(note.velocity, expected['velocity'])
                self.assertAlmostEqual(note.start, expected['onset'], places=4)
                self.assertAlmostEqual(note.end, expected['offset'], places=4)
            with self.assertRaises(FileExistsError):
                export_midi(SimpleNamespace(notes=str(source), output=str(output)))


if __name__ == '__main__':
    unittest.main()
