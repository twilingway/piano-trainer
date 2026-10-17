"""The keyboard as the hand solver sees it (hand_solver.py), metres; piano_kit.py builds the same keys.

Exec'd into the caller's namespace. The player faces +Y; the keys run from the front edge y=KEY_FRONT
to +Y; C4's centre is at x=X0 and white key i (from C4) at X0 + i * WHITE_W; semitones count from C4.
A pressed key pivots round an axis hidden in the case and its front edge drops KEY_DIP; with
KEY_DIP 0 (the caller's) a finger only rests on its key.
"""
import math

WHITE_W, WHITE_L, WHITE_H = 0.0235, 0.150, 0.022
BLACK_W, BLACK_L, BLACK_H = 0.0137, 0.095, 0.012
KEY_TOP, KEY_FRONT, X0 = 0.74, 0.30, 0.36
WHITE_PCS = [0, 2, 4, 5, 7, 9, 11]
KEY_DIP = globals().get("KEY_DIP", 0.010)
PIVOT_Y = KEY_FRONT + WHITE_L + 0.10


def white_semitone(w):
    return 12 * (w // 7) + WHITE_PCS[w % 7]


def white_x(i):
    return X0 + i * WHITE_W


def key_of(semitone):
    octave, pc = divmod(semitone, 12)
    if pc in WHITE_PCS:
        return white_x(octave * 7 + WHITE_PCS.index(pc)), False
    return white_x(octave * 7 + WHITE_PCS.index(pc - 1)) + WHITE_W / 2, True


def key_front(black):
    return KEY_FRONT + (WHITE_L - BLACK_L if black else 0)


def angle_of(black):
    return math.atan2(KEY_DIP, PIVOT_Y - key_front(black))


def pressed_top(black, y):
    """Surface height of a pressed key at depth y."""
    return KEY_TOP + (BLACK_H if black else 0) - (PIVOT_Y - y) * math.tan(angle_of(black))
