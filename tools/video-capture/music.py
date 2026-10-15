"""Local Transkun inference; model note ends remain estimates."""
import hashlib
import importlib.metadata
import importlib.resources
import json
import math
from pathlib import Path


def normalize_notes(notes, offset):
    _validate_source_offset(offset)
    result = []
    for note in sorted(notes, key=lambda item: (item.start, item.pitch, item.end)):
        onset, end = float(note.start) + offset, float(note.end) + offset
        if not all(math.isfinite(x) for x in (onset, end)) or end <= onset:
            raise ValueError('Transkun returned an invalid note interval')
        if not 0 <= int(note.pitch) <= 127 or not 1 <= int(note.velocity) <= 127:
            raise ValueError('Transkun returned an invalid MIDI value')
        result.append({'id': f'note-{len(result) + 1:06d}', 'pitch': int(note.pitch),
                       'onset': onset, 'offset': end, 'velocity': int(note.velocity)})
    return result


def _validate_source_offset(offset):
    if isinstance(offset, bool) or not isinstance(offset, (int, float)) or not math.isfinite(offset):
        raise ValueError('Source offset must be finite')


def _normalize_pedal_events(events, offset):
    _validate_source_offset(offset)
    result = []
    for event in events:
        if not isinstance(event, dict):
            raise ValueError('Invalid sustain pedal candidate')
        raw_time, value = event.get('time'), event.get('value')
        if (isinstance(raw_time, bool) or not isinstance(raw_time, (int, float))
                or not math.isfinite(raw_time)):
            raise ValueError('Sustain pedal time must be finite')
        time = raw_time + offset
        if not math.isfinite(time) or time < 0:
            raise ValueError('Sustain pedal time must be nonnegative and finite')
        if isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= 127:
            raise ValueError('Sustain pedal value must be an integer from 0 to 127')
        result.append({'time': time, 'value': value, 'source': 'transkun', 'estimated': True})
    # Keep down/up/down transitions at one timestamp. Only adjacent equal
    # events in stable chronological order are redundant.
    ordered = sorted(result, key=lambda event: event['time'])
    unique = []
    for event in ordered:
        if unique and event['time'] == unique[-1]['time'] and event['value'] == unique[-1]['value']:
            continue
        unique.append(event)
    return unique


def normalize_pedal_candidates(instruments, offset):
    events = ({'time': control.time, 'value': control.value}
              for instrument in instruments for control in instrument.control_changes
              if control.number == 64)
    return _normalize_pedal_events(events, offset)


def transcribe(args):
    import moduleconf
    import numpy as np
    import scipy.io.wavfile
    import soxr
    import torch
    from transkun.Data import writeMidi

    if not args.device.startswith('cuda') or not torch.cuda.is_available():
        raise RuntimeError('Transkun requires available CUDA in this isolated environment')
    base = Path(str(importlib.resources.files('transkun')))
    weight = base / 'pretrained/2.0.pt'
    config = base / 'pretrained/2.0.conf'
    manager = moduleconf.parseFromFile(str(config))
    model = manager['Model'].module.TransKun(conf=manager['Model'].config).to(args.device)
    # Load only the pinned package checkpoint; its digest is exported below.
    checkpoint = torch.load(str(weight), map_location=args.device, weights_only=False)
    model.load_state_dict(checkpoint.get('best_state_dict', checkpoint.get('state_dict')), strict=True)
    model.eval()
    sample_rate, samples = scipy.io.wavfile.read(args.audio)
    if np.issubdtype(samples.dtype, np.integer):
        info = np.iinfo(samples.dtype)
        if info.min == 0:
            samples = (samples.astype(np.float32) - (info.max + 1) / 2) / ((info.max + 1) / 2)
        else:
            samples = samples.astype(np.float32) / max(abs(info.min), info.max)
    else:
        samples = samples.astype(np.float32)
    if samples.ndim == 1:
        samples = samples[:, None]
    if sample_rate != model.fs:
        samples = soxr.resample(samples, sample_rate, model.fs)
    with torch.inference_mode():
        estimated = model.transcribe(torch.from_numpy(samples).to(args.device),
                                     discardSecondHalf=False)
    midi = writeMidi(estimated)
    notes = normalize_notes([n for instrument in midi.instruments for n in instrument.notes],
                            args.source_offset)
    output = {'schemaVersion': 1,
              'backend': {'name': 'transkun', 'version': importlib.metadata.version('transkun'),
                          'device': args.device,
                          'modelSha256': hashlib.sha256(weight.read_bytes()).hexdigest(),
                          'configSha256': hashlib.sha256(config.read_bytes()).hexdigest(),
                          'segmentSeconds': model.segmentSizeInSecond,
                          'segmentHopSeconds': model.segmentHopSizeInSecond,
                          'torchVersion': torch.__version__, 'cudaVersion': torch.version.cuda},
              'notes': notes,
              'pedalCandidates': normalize_pedal_candidates(midi.instruments, args.source_offset),
              'warnings': ['Model note ends are estimates, not observed physical key releases.',
                           'Automatic transcription has not been reviewed.']}
    with open(args.output, 'x', encoding='utf-8') as target:
        json.dump(output, target, ensure_ascii=False, indent=2, allow_nan=False)


def export_midi(args):
    import pretty_midi
    payload = json.loads(Path(args.notes).read_text(encoding='utf-8'))
    if isinstance(payload, dict):
        notes = payload['notes']
        candidates = payload.get('pedalCandidates', [])
        if not isinstance(candidates, list):
            raise ValueError('Sustain pedal candidates must be a list')
        pedals = _normalize_pedal_events(candidates, 0)
    else:
        notes, pedals = payload, []
    midi = pretty_midi.PrettyMIDI(initial_tempo=120, resolution=10000)
    instrument = pretty_midi.Instrument(program=0)
    for note in notes:
        onset = note.get('onset', note.get('onsetSeconds'))
        end = note.get('offset', note.get('modelEndSeconds'))
        if onset is None or end is None or not math.isfinite(onset) or not math.isfinite(end) or end <= onset or onset < 0:
            raise ValueError('Invalid note interval for MIDI export')
        instrument.notes.append(pretty_midi.Note(velocity=note.get('velocity') or 80,
                                                pitch=note['pitch'], start=onset, end=end))
    instrument.control_changes = [pretty_midi.ControlChange(number=64, value=event['value'],
                                                          time=event['time']) for event in pedals]
    midi.instruments.append(instrument)
    # pretty_midi sorts simultaneous controllers by value. Restore their
    # stable source order, including distinct times quantized to the same tick.
    from io import BytesIO
    import mido
    buffer = BytesIO()
    midi.write(buffer)
    buffer.seek(0)
    encoded = mido.MidiFile(file=buffer)
    pedal_order = {}
    for event in pedals:
        tick = int(midi.time_to_tick(event['time']))
        pedal_order.setdefault(tick, []).append(event['value'])
    for track in encoded.tracks:
        tick = 0
        controls = {}
        for message in track:
            tick += message.time
            if message.type == 'control_change' and message.control == 64:
                controls.setdefault(tick, []).append(message)
        for tick, messages in controls.items():
            values = pedal_order[tick]
            if len(messages) != len(values):
                raise ValueError('MIDI writer changed sustain pedal event count')
            for message, value in zip(messages, values):
                message.value = value
    # For [down, up) sustain intervals, all CC64 changes at a tick take
    # effect before that tick's note-off/on. Preserve metadata and setup slots.
    def performance_event(message):
        return (message.type in ('note_on', 'note_off')
                or (message.type == 'control_change' and message.control == 64))

    for track in encoded.tracks:
        groups = []
        tick = 0
        for message in track:
            tick += message.time
            if not groups or groups[-1][0] != tick:
                groups.append((tick, []))
            groups[-1][1].append(message)
        ordered_track = []
        previous_tick = 0
        for tick, group in groups:
            performance = iter(sorted(
                (message for message in group if performance_event(message)),
                key=lambda message: 0 if message.type == 'control_change' else 1))
            ordered = [next(performance) if performance_event(message) else message
                       for message in group]
            for index, message in enumerate(ordered):
                ordered_track.append(message.copy(time=tick - previous_tick if index == 0 else 0))
            previous_tick = tick
        track[:] = ordered_track
    with open(args.output, 'xb') as target:
        encoded.save(file=target)
