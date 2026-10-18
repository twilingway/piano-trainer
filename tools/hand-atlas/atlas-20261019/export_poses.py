"""Export reviewed author-intent fields without MANO/SMPL+H model data.

Standard-library only. The licensed exact reconstruction remains a local backup.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import re
from typing import Any

POSE_FIELDS = (
    'case_id', 'group', 'mask', 'blender_frame', 'frame_id', 'name',
    'assignment_midis', 'pressed_fingers', 'pressed_midis',
    'finger_flexion_degrees_mcp_pip_dip', 'finger_abduction_degrees',
    'wrist_translation_m', 'canonical_to_keyboard_rotation',
)
REQUIRED_POSE_FIELDS = set(POSE_FIELDS) - {'group', 'frame_id', 'name'}
KEYBOARD_SCALARS = (
    'white_width_m', 'white_depth_m', 'white_top_z_m', 'black_width_m',
    'black_start_y_m', 'black_top_z_m', 'pressed_white_rigid_drop_m',
    'pressed_black_rigid_drop_m',
)
STATUSES = {
    'PASS_GEOMETRY_ONLY', 'PASS_SOFT_PAD_GEOMETRY_ONLY',
    'REJECTED_VALIDATION', 'PENDING_ACTUAL_VALIDATION', 'UNRESOLVED',
}
RU_NOTES = ('до', 'до♯', 'ре', 'ре♯', 'ми', 'фа', 'фа♯', 'соль', 'соль♯', 'ля', 'ля♯', 'си')
EN_NOTES = ('C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B')
FORBIDDEN_KEYS = {
    'full_pose156', 'right_hand_pose45', 'left_hand_pose45', 'body_pose66',
    'shape_betas10', 'v_template', 'v_shaped', 'v_posed', 'posedirs', 'shapedirs',
    'weights', 'hands_mean', 'hands_components', 'hands_coeffs', 'j_regressor',
    'kintree_table', 'arm_report', 'attempts', 'selected_attempt_index',
    'canonical_frame_h_rows', 'canonical_origin_source_m', 'source_to_blender_c_rows',
    'dense_hand_vertex_ids', 'finger_pad_vertex_ids', 'finger_hinge_axes_canonical',
    'vertices', 'triangles', 'faces', 'topology', 'subdivision', 'delta', 'deformation',
    'source_model', 'body_translation_m', 'source_frame', 'source_atlas_frame',
}


def digest(blob: bytes) -> str:
    return hashlib.sha256(blob).hexdigest()


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def number(value: Any, where: str) -> None:
    require(type(value) in (int, float) and math.isfinite(value), f'{where}: finite number required')


def vector(value: Any, size: int, where: str) -> None:
    require(isinstance(value, list) and len(value) == size, f'{where}: expected {size} values')
    for index, item in enumerate(value):
        number(item, f'{where}/{index}')


def integer(value: Any, low: int, high: int, where: str) -> None:
    require(type(value) is int and low <= value <= high, f'{where}: integer {low}..{high} required')


def rotation(value: Any, where: str) -> None:
    require(isinstance(value, list) and len(value) == 3, f'{where}: expected 3x3 matrix')
    for row in value:
        vector(row, 3, where)
    error = max(abs(sum(value[k][i] * value[k][j] for k in range(3)) - (1 if i == j else 0))
                for i in range(3) for j in range(3))
    determinant = sum(value[0][i] * (value[1][(i+1) % 3] * value[2][(i+2) % 3]
                                   - value[1][(i+2) % 3] * value[2][(i+1) % 3]) for i in range(3))
    require(error < 1e-6 and abs(determinant - 1) < 1e-6, f'{where}: proper rotation required')


def notes_for(pose: dict[str, Any]) -> list[dict[str, Any]]:
    result = []
    for finger in pose['pressed_fingers']:
        midi = pose['assignment_midis'][finger-1]
        result.append({'finger': finger, 'midi': midi,
            'name_ru': RU_NOTES[midi % 12] + str(midi // 12 - 1),
            'name_intl': EN_NOTES[midi % 12] + str(midi // 12 - 1)})
    return result


def validate_pose(pose: dict[str, Any], frame: int) -> None:
    require(REQUIRED_POSE_FIELDS.issubset(pose), f'frame {frame}: missing reviewed motion fields')
    require(pose['blender_frame'] == frame, f'frame {frame}: frame ordering differs')
    integer(pose['blender_frame'], 1, 51, 'blender_frame')
    integer(pose['mask'], 0, 31, 'mask')
    require(isinstance(pose['case_id'], str) and bool(pose['case_id']), 'case_id required')
    for key in ('group', 'name'):
        if key in pose:
            require(isinstance(pose[key], str), f'{key}: string required')
    if 'frame_id' in pose:
        integer(pose['frame_id'], 0, 100000, 'frame_id')
    require(isinstance(pose['assignment_midis'], list) and len(pose['assignment_midis']) == 5,
            f'frame {frame}: five MIDI assignments required')
    for midi in pose['assignment_midis']:
        integer(midi, 0, 127, 'assignment MIDI')
    expected_fingers = [finger for finger in range(1, 6) if pose['mask'] & (1 << (finger-1))]
    require(pose['pressed_fingers'] == expected_fingers, f'frame {frame}: mask/fingers differ')
    require(all(type(finger) is int for finger in pose['pressed_fingers']), 'finger integers required')
    require(pose['pressed_midis'] == [pose['assignment_midis'][finger-1] for finger in expected_fingers],
            f'frame {frame}: pressed MIDI assignments differ')
    require(all(type(midi) is int for midi in pose['pressed_midis']), 'MIDI integers required')
    flex = pose['finger_flexion_degrees_mcp_pip_dip']
    require(isinstance(flex, dict) and set(flex) == set('12345'), f'frame {frame}: five finger angle triplets required')
    for finger in '12345':
        vector(flex[finger], 3, f'frame {frame}/finger {finger}/MCP PIP DIP')
    vector(pose['finger_abduction_degrees'], 5, f'frame {frame}/abduction')
    vector(pose['wrist_translation_m'], 3, f'frame {frame}/wrist translation')
    rotation(pose['canonical_to_keyboard_rotation'], f'frame {frame}/wrist rotation')


def assert_public(value: Any, where: str = '') -> None:
    """Fail closed if forbidden model keys or nonfinite values enter the output."""
    if isinstance(value, dict):
        for key, item in value.items():
            require(isinstance(key, str) and key.lower() not in FORBIDDEN_KEYS,
                    f'Forbidden public field at {where}/{key}')
            assert_public(item, f'{where}/{key}')
    elif isinstance(value, list):
        for index, item in enumerate(value):
            assert_public(item, f'{where}/{index}')
    elif type(value) is float:
        number(value, where)
    else:
        require(value is None or type(value) in (str, int, bool), f'Unexpected value at {where}')


def keyboard_metadata(source: dict[str, Any]) -> dict[str, Any]:
    original = source['keyboard']
    result = {key: original[key] for key in KEYBOARD_SCALARS}
    for key, value in result.items():
        number(value, 'keyboard/' + key)
    for color in ('whites', 'blacks'):
        result[color] = []
        for key in original[color]:
            integer(key['midi'], 0, 127, 'keyboard MIDI')
            number(key['x'], 'keyboard center X')
            result[color].append({'midi': key['midi'], 'x': key['x']})
    all_midis = [key['midi'] for color in ('whites', 'blacks') for key in result[color]]
    require(len(all_midis) == len(set(all_midis)), 'Duplicate keyboard center MIDI')
    result['exported_center_midi_range_inclusive'] = [min(all_midis), max(all_midis)]
    result['center_scope'] = 'Only centers explicitly present in the authored source JSON; not a mesh export.'
    return result


def build(source: dict[str, Any], statuses: dict[str, Any], source_sha: str, status_sha: str) -> tuple[dict[str, Any], dict[str, Any]]:
    require(isinstance(source.get('poses'), list) and len(source['poses']) == 51, 'Exactly 51 source poses required')
    require(isinstance(statuses, dict) and set(statuses) == {str(frame) for frame in range(1, 52)},
            'Exactly 51 saved frame-status records required')
    poses = []
    for frame, original in enumerate(source['poses'], 1):
        validate_pose(original, frame)
        pose = {key: original[key] for key in POSE_FIELDS if key in original}
        status = statuses[str(frame)]
        require(status.get('frame') == frame and status.get('case_id') == original['case_id'],
                f'frame {frame}: status/source identity mismatch')
        require(status.get('geometry_status') in STATUSES, f'frame {frame}: unrecognized saved geometry status')
        require(isinstance(status.get('reasons'), list) and all(isinstance(reason, str) for reason in status['reasons']),
                f'frame {frame}: status reasons must be strings')
        notes = notes_for(pose)
        instruction = ('Нажать: ' + ' · '.join(f"{note['finger']} → {note['name_ru']} ({note['name_intl']})" for note in notes)
                       if notes else 'Покой: клавиши не нажимать')
        require(status.get('pressed_notes') == notes and status.get('instruction') == instruction,
                f'frame {frame}: saved note instructions differ from raw assignments')
        require(isinstance(status.get('label'), str) and isinstance(status.get('visual_acceptance'), str),
                f'frame {frame}: saved label/visual status required')
        pose.update(pressed_notes=notes, instruction=instruction, display_label=status['label'],
                    geometry_status=status['geometry_status'], geometry_reasons=status['reasons'],
                    visual_acceptance=status['visual_acceptance'])
        poses.append(pose)
    require(len({pose['case_id'] for pose in poses}) == 51, 'Duplicate case IDs')
    upstream = {'authored_pose_source_sha256': source_sha, 'saved_status_source_sha256': status_sha}
    for key in ('source_sha256', 'source_pose_json_sha256', 'source_blend_sha256'):
        value = source.get(key)
        if isinstance(value, str) and re.fullmatch(r'[0-9a-fA-F]{64}', value):
            upstream[key] = value.lower()
    metadata = {
        'schema_version': 1, 'pose_count': 51, 'scope': 'Authored right-hand motion intent; no licensed hand model or derived mesh',
        'units': {'flexion': 'degrees', 'abduction': 'degrees', 'length': 'metres', 'rotation': '3x3 proper rotation matrix'},
        'finger_numbering': {'1': 'thumb', '2': 'index', '3': 'middle', '4': 'ring', '5': 'little'},
        'mask_rule': 'bit (finger-1) means pressed; finger numbering 1..5',
        'coordinate_system': {'origin_world_m': [.36, .30, .74], 'x': 'towards higher piano notes',
            'y': 'towards the back of the keys', 'z': 'up',
            'wrist_rotation': 'Maps the local canonical wrist frame into keyboard axes; no source anatomical frame is included'},
        'keyboard': keyboard_metadata(source), 'upstream_sha256': upstream,
        'references': {'pose_form_article': 'https://hub.yamaha.com/music-educators/instruments/piano/piano-pedagogy-even-scales/',
                       'external_model_license': 'https://mano.is.tue.mpg.de/license.html'},
        'visual_contact_recipes': [
            {'frames': [4, 5], 'active_fingers': {'4': 3, '5': 4}, 'axis': 'keyboard Z', 'maximum_displacement_m': .001,
             'purpose': 'Bounded static pad-contact visual recipe; geometry-dependent offsets are excluded'},
            {'frames': [45, 48], 'axis': 'keyboard X', 'maximum_displacement_m': .002,
             'purpose': 'Bounded static side-contact visual recipe; geometry-dependent offsets are excluded'},
        ],
        'status_scope': 'Saved status snapshot, not fresh validation and not visual acceptance on a replacement rig',
        'reconstruction_scope': 'Exact saved Blender reconstruction requires the separate local licensed backup; retarget authored angles and wrist placement to an independently licensed rig',
    }
    public = {'schema_version': 1, 'poses': poses}
    assert_public(public)
    assert_public(metadata)
    # Positive preservation check: every reviewed source field is exactly equal
    # in all 51 records, independently of the blacklist or JSON serialization.
    comparisons = sum(1 for frame, original in enumerate(source['poses']) for key in POSE_FIELDS
                      if key in original and poses[frame].get(key) == original[key])
    expected = sum(sum(key in original for key in POSE_FIELDS) for original in source['poses'])
    require(comparisons == expected, 'Reviewed authored fields did not survive exactly')
    require(all({key: pose[key] for key in POSE_FIELDS if key in pose}
                == {key: original[key] for key in POSE_FIELDS if key in original}
                for pose, original in zip(poses, source['poses'])), 'Unexpected authored-field export difference')
    return public, metadata


def encoded(value: Any) -> bytes:
    return (json.dumps(value, ensure_ascii=False, allow_nan=False, indent=2) + '\n').encode('utf-8')


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True, help='Private current pose JSON; input only')
    parser.add_argument('--status', type=Path, required=True, help='Saved frame-status.json; input only')
    parser.add_argument('--output', type=Path, required=True, help='Public output directory')
    args = parser.parse_args()
    source_blob, status_blob = args.source.read_bytes(), args.status.read_bytes()
    public, metadata = build(json.loads(source_blob), json.loads(status_blob), digest(source_blob), digest(status_blob))
    outputs = {'poses.json': encoded(public), 'metadata.json': encoded(metadata)}
    # Reject output locations that would overwrite an input, then write only
    # these explicit public files. Existing unrelated files are never removed.
    destinations = [args.output / name for name in (*outputs, 'export-manifest.json')]
    require(all(path.resolve() not in (args.source.resolve(), args.status.resolve()) for path in destinations),
            'Output would overwrite a private input')
    args.output.mkdir(parents=True, exist_ok=True)
    for name, blob in outputs.items():
        (args.output / name).write_bytes(blob)
    saved = json.loads((args.output / 'poses.json').read_bytes())
    require(saved == public, 'Serialized public poses differ')
    assert_public(saved)
    manifest = {'schema_version': 1, 'pose_count': 51, 'all_reviewed_authored_fields_exact': True,
        'forbidden_model_fields_absent': True, 'input_sha256': {'source': digest(source_blob), 'status': digest(status_blob)},
        'files_sha256': {name: digest(blob) for name, blob in outputs.items()}}
    (args.output / 'export-manifest.json').write_bytes(encoded(manifest))
    require(args.source.read_bytes() == source_blob and args.status.read_bytes() == status_blob, 'Private inputs changed during export')
    print(json.dumps({'pose_count': 51, 'authored_fields_exact': True, 'forbidden_fields_absent': True,
                      'files_sha256': manifest['files_sha256']}))


if __name__ == '__main__':
    main()
