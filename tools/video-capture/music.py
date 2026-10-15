"""Local Transkun inference; model note ends remain estimates."""
import hashlib
import importlib.metadata
import importlib.resources
import json
import math
from pathlib import Path


def normalize_notes(notes, offset):
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
              'warnings': ['Model note ends are estimates, not observed physical key releases.',
                           'Automatic transcription has not been reviewed.']}
    with open(args.output, 'x', encoding='utf-8') as target:
        json.dump(output, target, ensure_ascii=False, indent=2, allow_nan=False)


def export_midi(args):
    import pretty_midi
    notes = json.loads(Path(args.notes).read_text(encoding='utf-8'))
    if isinstance(notes, dict):
        notes = notes['notes']
    midi = pretty_midi.PrettyMIDI(initial_tempo=120, resolution=10000)
    instrument = pretty_midi.Instrument(program=0)
    for note in notes:
        onset = note.get('onset', note.get('onsetSeconds'))
        end = note.get('offset', note.get('modelEndSeconds'))
        if onset is None or end is None or not math.isfinite(onset) or not math.isfinite(end) or end <= onset or onset < 0:
            raise ValueError('Invalid note interval for MIDI export')
        instrument.notes.append(pretty_midi.Note(velocity=note.get('velocity') or 80,
                                                pitch=note['pitch'], start=onset, end=end))
    midi.instruments.append(instrument)
    with open(args.output, 'xb') as target:
        midi.write(target)
