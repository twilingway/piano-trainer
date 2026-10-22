"""Standalone local model adapter; orchestration and review live in TypeScript."""
import argparse
import json
import os
import sys
from pathlib import Path

os.environ.setdefault('MPLCONFIGDIR', str(Path(__file__).resolve().parents[2] / '.browser-artifacts/video-capture/matplotlib'))


def main():
    parser = argparse.ArgumentParser()
    commands = parser.add_subparsers(dest='command', required=True)
    music = commands.add_parser('music')
    music.add_argument('--audio', required=True)
    music.add_argument('--output', required=True)
    music.add_argument('--device', default='cuda')
    music.add_argument('--source-offset', type=float, default=0)
    hands = commands.add_parser('hands')
    hands.add_argument('--video', required=True)
    hands.add_argument('--model', required=True)
    hands.add_argument('--output', required=True)
    hands.add_argument('--summary', required=True)
    hands.add_argument('--calibration')
    hands.add_argument('--roi')
    hands.add_argument('--start', type=float)
    hands.add_argument('--end', type=float)
    hands.add_argument('--overlay-dir')
    hands.add_argument('--overlay-every', type=int, default=150)
    midi = commands.add_parser('midi')
    midi.add_argument('--notes', required=True)
    midi.add_argument('--output', required=True)
    args = parser.parse_args()
    # Check outputs before loading models or reading large inputs.
    for key in ('output', 'summary'):
        value = getattr(args, key, None)
        if value and Path(value).exists():
            parser.error(f'Output already exists: {value}')
    if args.command == 'hands':
        if args.overlay_every < 1:
            parser.error('--overlay-every must be positive')
        if args.start is not None and args.end is not None and args.end <= args.start:
            parser.error('--end must be greater than --start')
        from hands import extract
        extract(args)
    elif args.command == 'music':
        from music import transcribe
        transcribe(args)
    else:
        from music import export_midi
        export_midi(args)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(json.dumps({'error': type(error).__name__, 'message': str(error)}), file=sys.stderr)
        sys.exit(1)
