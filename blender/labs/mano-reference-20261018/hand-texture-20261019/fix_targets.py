"""Close-up targets for Codex touch-ups on the flat right hand (python -I).

From the SMPL-H zero pose joints. Nails: the centre lies NAIL_FROM_DIP beyond the distal joint
along the last phalanx; the camera looks down from the back of the hand, tilted toward the
fingertip. Skin spots the user pointed at: the index side facing the thumb, and the web
between index and middle from the back. Output: fix-targets.json for render_fix_view.py.
"""
from pathlib import Path
import json
import sys

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from smplh_data import load_smplh, evaluate_smplh

NAIL_FROM_DIP = .011  # metres
TILT = .4  # camera direction = back of the hand + TILT × finger direction

model = load_smplh(HERE.parent/'source/mano_v1_2/models/SMPLH_male.pkl')
_, joints, _ = evaluate_smplh(model, np.zeros(156))
names = model['joint_names']
targets = {}
for finger, smplh in (('index', 'rindex'), ('middle', 'rmiddle'), ('ring', 'rring'), ('little', 'rpinky')):
    pip, dip = joints[names.index(smplh+'1')], joints[names.index(smplh+'2')]
    along = (dip-pip)/np.linalg.norm(dip-pip)
    eye = np.array([0., 1., 0.])+TILT*along
    targets[f'fix-{finger}-nail'] = {'focus': (dip+along*NAIL_FROM_DIP).tolist(),
                                     'direction': (eye/np.linalg.norm(eye)).tolist(),
                                     'finger': along.tolist()}
j = {name: joints[names.index(name)] for name in names}
mid = (j['rindex0']+j['rindex1'])/2
targets['fix-index-thumb-side'] = {  # radial side of the index, seen from the thumb, a bit below
    'focus': (mid+np.array([0, 0, .008])).tolist(),
    'direction': (np.array([-.1, -.45, 1.])/np.linalg.norm([-.1, -.45, 1.])).tolist()}
web = (j['rindex0']+j['rmiddle0'])/2+np.array([-.012, .006, 0])
targets['fix-index-middle-web'] = {  # web between index and middle, from the back
    'focus': web.tolist(),
    'direction': (np.array([-.35, 1., 0])/np.linalg.norm([-.35, 1., 0])).tolist()}
# Web between middle and ring, 2 cm out along the fingers, from the back tilted 45° to either
# side: the finger sides facing each other (user's screenshot of a patch there).
web = (j['rmiddle0']+j['rring0'])/2+np.array([-.02, .004, 0])
for side, z in (('thumb', .6), ('little', -.6)):
    d = np.array([-.3, .75, z])
    targets[f'fix-middle-ring-web-{side}'] = {'focus': web.tolist(), 'direction': (d/np.linalg.norm(d)).tolist()}
(HERE/'fix-targets.json').write_text(json.dumps(targets, indent=1)+'\n', encoding='utf-8')
print('FIX TARGETS', list(targets))
