"""Explicit local coverage; an assignment and a mask together identify a case."""
GROUPS = [
    ('black5', [61,63,66,68,70], [0,1,2,4,8,16,3,17,10,21,31]),
    ('mixedA', [60,63,64,66,67], [10,7]),
    ('thumbblack', [61,62,64,65,67], [1,5,7]),
    ('yamaha_e', [64,66,68,70,71], [0,14,31]),
]
CASES = []
for group, assignment, masks in GROUPS:
    for mask in masks:
        fingers = [f for f in range(1,6) if mask & (1 << (f-1))]
        CASES.append({'case_id': f'{group}_mask_{mask}', 'group':group,'mask':mask,
            'assignment_midis':assignment,'pressed_fingers':fingers,
            'pressed_midis':[assignment[f-1] for f in fingers], 'blender_frame':33+len(CASES)})
assert len(CASES)==19 and len({c['case_id'] for c in CASES})==19
