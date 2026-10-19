"""Wide views over the seams of the flat right hand, for one Codex pass (python -I).

The seams (best-view hand-overs and the dorsal/palmar UV seam, seam_mask.py) run along every
finger, so instead of spot close-ups: the four fingers from the back and the palm, straight
and 45° toward the thumb and the little finger, plus the thumb and the index web from the back
and the palm. Frame SCALE = 13 cm on 1024 px, about the texture's 0.1 mm per texel.
Output: seam-targets.json for render_fix_view.py (FIX_SET=seams).
"""
from pathlib import Path
import json

import numpy as np

HERE = Path(__file__).resolve().parent
verts = np.array([[float(x) for x in line.split()[1:]]
                  for line in (HERE/'flat-hand.obj').read_text(encoding='utf-8').splitlines()
                  if line.startswith('v ')])
tip_x = verts[:, 0].min()
fingers = verts[(verts[:, 0] < tip_x+.11) & (verts[:, 2] < .01)]  # index..little, not the thumb
focus = (fingers.min(0)+fingers.max(0))/2
thumb = verts[verts[:, 2] > .02]
thumb_focus = (thumb.min(0)+thumb.max(0))/2
# Thumb side is +Z, the back of the hand +Y.
shots = {
    'seam-dorsal': (focus, (0, 1, 0)), 'seam-palmar': (focus, (0, -1, 0)),
    'seam-dorsal-thumb': (focus, (0, 1, 1)), 'seam-dorsal-little': (focus, (0, 1, -1)),
    'seam-palmar-thumb': (focus, (0, -1, 1)), 'seam-palmar-little': (focus, (0, -1, -1)),
    'seam-thumb-dorsal': (thumb_focus, (0, 1, .5)), 'seam-thumb-palmar': (thumb_focus, (0, -1, .5)),
}
targets = {name: {'focus': f.tolist(), 'direction': (np.array(d)/np.linalg.norm(d)).tolist()}
           for name, (f, d) in shots.items()}
(HERE/'seam-targets.json').write_text(json.dumps(targets, indent=1)+'\n', encoding='utf-8')
print('SEAM TARGETS', list(targets))
