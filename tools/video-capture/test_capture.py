"""Offline behavioral checks; no model downloads or GPU are needed."""
import json
import tempfile
import unittest
from fractions import Fraction
from pathlib import Path
from types import SimpleNamespace

from hands import crop_bounds
from music import export_midi, normalize_notes, normalize_pedal_candidates
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


class PedalTests(unittest.TestCase):
    @staticmethod
    def instruments(*groups):
        return [SimpleNamespace(control_changes=[SimpleNamespace(number=number, value=value, time=time)
                                                for number, value, time in group])
                for group in groups]

    def test_offset_filter_dedup_and_stable_same_time_values(self):
        instruments = self.instruments(
            [(64, 127, 2), (64, 64, 1), (64, 63, 1), (1, 99, 0), (64, 127, 4)],
            [(64, 64, 1), (64, 127, 2), (64, 0, 3)])
        result = normalize_pedal_candidates(instruments, 5)
        self.assertEqual([(p['time'], p['value']) for p in result],
                         [(6, 64), (6, 63), (6, 64), (7, 127), (8, 0), (9, 127)])
        self.assertTrue(all(p['source'] == 'transkun' and p['estimated'] is True for p in result))

    def test_same_timestamp_down_up_down_keeps_final_state_through_midi(self):
        try:
            import pretty_midi
        except ImportError:
            self.skipTest('pretty_midi is installed by setup-capture')
        instruments = self.instruments([(64, 127, 0.4), (64, 0, 0.4), (64, 127, 0.4)])
        pedals = normalize_pedal_candidates(instruments, 0)
        self.assertEqual([event['value'] for event in pedals], [127, 0, 127])
        with tempfile.TemporaryDirectory() as directory:
            source, output = Path(directory) / 'transitions.json', Path(directory) / 'transitions.mid'
            source.write_text(json.dumps({'notes': [
                {'pitch': 60, 'onset': 0.2, 'offset': 0.6, 'velocity': 80}],
                'pedalCandidates': pedals}), encoding='utf-8')
            export_midi(SimpleNamespace(notes=str(source), output=str(output)))
            controls = pretty_midi.PrettyMIDI(str(output)).instruments[0].control_changes
            self.assertEqual([event.value for event in controls], [127, 0, 127])
            self.assertTrue(all(event.number == 64 for event in controls))
            self.assertTrue(all(abs(event.time - 0.4) < 0.0001 for event in controls))
            self.assertEqual(controls[-1].value, 127)

    def test_pedal_changes_precede_note_off_and_on_at_same_tick(self):
        try:
            import mido
        except ImportError:
            self.skipTest('mido is installed with pretty_midi by setup-capture')
        with tempfile.TemporaryDirectory() as directory:
            source, output = Path(directory) / 'boundary.json', Path(directory) / 'boundary.mid'
            source.write_text(json.dumps({'notes': [
                {'pitch': 60, 'onset': 0.2, 'offset': 0.5, 'velocity': 80},
                {'pitch': 62, 'onset': 0.5, 'offset': 0.7, 'velocity': 90}],
                'pedalCandidates': [{'time': 0.5, 'value': value} for value in [127, 0, 127]]}),
                encoding='utf-8')
            export_midi(SimpleNamespace(notes=str(source), output=str(output)))
            midi = mido.MidiFile(str(output))
            target_tick = midi.ticks_per_beat
            found = []
            for track in midi.tracks:
                tick = 0
                for message in track:
                    tick += message.time
                    if tick == target_tick and not message.is_meta:
                        if message.type == 'control_change':
                            found.append(('cc', message.value))
                        elif message.type == 'note_off' or (message.type == 'note_on' and message.velocity == 0):
                            found.append(('off', message.note))
                        elif message.type == 'note_on':
                            found.append(('on', message.note))
            self.assertEqual(found, [('cc', 127), ('cc', 0), ('cc', 127), ('off', 60), ('on', 62)])
            self.assertTrue(all(track[-1].type == 'end_of_track' for track in midi.tracks))
            timing = [message for message in midi.tracks[0] if message.type == 'set_tempo']
            self.assertEqual([(message.tempo, message.time) for message in timing], [(500000, 0)])

    def test_invalid_time_value_or_source_offset_is_rejected(self):
        for time in [-0.01, float('nan'), float('inf'), True, '1']:
            with self.subTest(time=time), self.assertRaises(ValueError):
                normalize_pedal_candidates(self.instruments([(64, 127, time)]), 0)
        for value in [-1, 128, 63.5, True, '64']:
            with self.subTest(value=value), self.assertRaises(ValueError):
                normalize_pedal_candidates(self.instruments([(64, value, 1)]), 0)
        for offset in [float('nan'), float('inf'), -float('inf'), True]:
            with self.subTest(offset=offset), self.assertRaises(ValueError):
                normalize_pedal_candidates([], offset)
            with self.subTest(note_offset=offset), self.assertRaises(ValueError):
                normalize_notes([], offset)
        with self.assertRaises(ValueError):
            normalize_pedal_candidates(self.instruments([(64, 127, 0.1)]), -0.2)
        self.assertEqual(normalize_pedal_candidates(self.instruments([(64, 127, 1)]), -0.5)[0]['time'], 0.5)

    def test_midi_roundtrip_preserves_note_intervals_and_nonbinary_pedal_values(self):
        try:
            import pretty_midi
        except ImportError:
            self.skipTest('pretty_midi is installed by setup-capture')
        notes = [{'pitch': 60, 'onset': 0.2, 'offset': 1.4, 'velocity': 91}]
        pedals = [{'time': 0.3, 'value': 63}, {'time': 0.4, 'value': 64},
                  {'time': 0.4, 'value': 63}, {'time': 0.4, 'value': 63}, {'time': 0.6, 'value': 127},
                  {'time': 0.8, 'value': 127}, {'time': 1.2, 'value': 0}]
        with tempfile.TemporaryDirectory() as directory:
            source, output = Path(directory) / 'input.json', Path(directory) / 'output.mid'
            source.write_text(json.dumps({'notes': notes, 'pedalCandidates': pedals}), encoding='utf-8')
            export_midi(SimpleNamespace(notes=str(source), output=str(output)))
            instrument = pretty_midi.PrettyMIDI(str(output)).instruments[0]
            self.assertEqual([(c.number, c.value) for c in instrument.control_changes],
                             [(64, 63), (64, 64), (64, 63), (64, 127), (64, 127), (64, 0)])
            for actual, expected in zip(instrument.control_changes, [0.3, 0.4, 0.4, 0.6, 0.8, 1.2]):
                self.assertAlmostEqual(actual.time, expected, places=4)
            self.assertEqual(len(instrument.notes), 1)
            self.assertAlmostEqual(instrument.notes[0].start, notes[0]['onset'], places=4)
            self.assertAlmostEqual(instrument.notes[0].end, notes[0]['offset'], places=4)
            self.assertEqual(instrument.notes[0].velocity, notes[0]['velocity'])

    def test_old_notes_dictionary_still_exports_without_pedal(self):
        try:
            import pretty_midi
        except ImportError:
            self.skipTest('pretty_midi is installed by setup-capture')
        with tempfile.TemporaryDirectory() as directory:
            source, output = Path(directory) / 'old.json', Path(directory) / 'old.mid'
            source.write_text(json.dumps({'notes': [
                {'pitch': 64, 'onset': 0.25, 'offset': 0.75, 'velocity': 72}]}), encoding='utf-8')
            export_midi(SimpleNamespace(notes=str(source), output=str(output)))
            instrument = pretty_midi.PrettyMIDI(str(output)).instruments[0]
            self.assertEqual(instrument.control_changes, [])
            self.assertEqual(instrument.notes[0].pitch, 64)

    def test_export_rejects_invalid_pedal_before_creating_output(self):
        cases = [[{'time': float('nan'), 'value': 64}],
                 [{'time': -0.2, 'value': 127}],
                 [{'time': 1, 'value': 128}], None]
        with tempfile.TemporaryDirectory() as directory:
            source, output = Path(directory) / 'bad.json', Path(directory) / 'bad.mid'
            for pedals in cases:
                with self.subTest(pedals=pedals):
                    source.write_text(json.dumps({'notes': [], 'pedalCandidates': pedals}), encoding='utf-8')
                    with self.assertRaises(ValueError):
                        export_midi(SimpleNamespace(notes=str(source), output=str(output)))
                    self.assertFalse(output.exists())


if __name__ == '__main__':
    unittest.main()
