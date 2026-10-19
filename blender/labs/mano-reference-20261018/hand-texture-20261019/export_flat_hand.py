"""Right hand of SMPL-H in the zero pose (straight fingers, flat palm) as an OBJ for texture work.

Zero pose = the model template: T-pose arm along -X (source coordinates, +Y up, +Z body front),
palm down, thumb toward +Z. Kept: every face whose vertices are all within FOREARM_KEEP of the
wrist toward the elbow or beyond it toward the fingers (hand + a short cuff of forearm).
Vertex ids are the SMPL-H ids, so a UV made on this piece maps back to the full skin.
Output: <name>.obj (metres), <name>.json (ids, joints, sizes).
Env HAND_PIECE: 'hand' (default: hand + FOREARM_KEEP cuff) or 'arm' (up to just past the elbow).
Env HAND_POSE=spread: fingers spread apart at the knuckles (SPREAD rad per finger step about
the vertical axis) -> spread-hand.obj; same faces and vertex order as flat-hand.obj, so the
views of this pose bake into the same UV (their sides between fingers are visible there).
"""
from pathlib import Path
import json, os, sys
import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from smplh_data import load_smplh, evaluate_smplh

FOREARM_KEEP = .06
ELBOW_PAST = .03
PIECE = os.environ.get('HAND_PIECE', 'hand')
NAME = {'hand': 'flat-hand', 'arm': 'flat-arm'}[PIECE]
POSE = os.environ.get('HAND_POSE', 'flat')
SPREAD = .3
if POSE == 'spread':
    NAME = 'spread-hand' if PIECE == 'hand' else 'spread-arm'

model = load_smplh(HERE.parent/'source/mano_v1_2/models/SMPLH_male.pkl')
pose = np.zeros(156)
if POSE == 'spread':
    # Right-hand knuckles (joints 37..51, 3 values each); +Y turns a finger toward the thumb.
    for joint, step in (('rindex0', 1), ('rring0', -1), ('rpinky0', -2), ('rthumb0', .5)):
        pose[3*model['joint_names'].index(joint)+1] = SPREAD*step
vertices, joints, _ = evaluate_smplh(model, pose)
faces = model['f'].astype(int)
wrist, elbow = joints[21], joints[19]
axis = (wrist-elbow)/np.linalg.norm(wrist-elbow)
along = (vertices-wrist) @ axis
right = vertices[:, 0] < elbow[0]
limit = FOREARM_KEEP if PIECE == 'hand' else float(np.linalg.norm(wrist-elbow))+ELBOW_PAST
keep = right & (along > -limit)
face_ids = np.flatnonzero(keep[faces].all(1))
kept_faces = faces[face_ids]
ids = np.unique(kept_faces)
remap = {int(v): i for i, v in enumerate(ids)}
with open(HERE/f'{NAME}.obj', 'w', encoding='utf-8') as out:
    out.write('# SMPL-H right hand, zero pose, metres; vertex order = flat-hand.json ids\n')
    for v in vertices[ids]:
        out.write(f'v {v[0]:.6f} {v[1]:.6f} {v[2]:.6f}\n')
    for f in kept_faces:
        out.write('f '+' '.join(str(remap[int(i)]+1) for i in f)+'\n')
hand = vertices[ids][along[ids] > 0]
tip = hand[np.argmax(hand @ axis)]
info = {'smplh_vertex_ids': ids.tolist(), 'smplh_face_ids': face_ids.tolist(), 'faces': len(kept_faces), 'wrist': wrist.tolist(), 'elbow': elbow.tolist(),
        'hand_length_mm': round(float(((hand-wrist) @ axis).max())*1000, 1),
        'hand_breadth_mm_z': round(float(np.ptp(hand[:, 2]))*1000, 1),
        'hand_thickness_mm_y': round(float(np.ptp(hand[:, 1]))*1000, 1)}
(HERE/f'{NAME}.json').write_text(json.dumps(info)+'\n', encoding='utf-8')
print({k: v for k, v in info.items() if k not in ('smplh_vertex_ids', 'smplh_face_ids')}, 'vertices', len(ids))
