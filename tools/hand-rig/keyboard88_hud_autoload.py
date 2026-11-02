"""Automatically restore the Keyboard88 viewport HUD for local atlas scenes.

Install this module in Blender's user scripts/startup directory. This is a
Blender startup module, so scene auto-execution may remain disabled. It reads
the HUD next to the opened atlas and never saves the scene or starts MCP.
"""

from pathlib import Path
import hashlib
import importlib.util
import json
import sys
import traceback

import bpy
from bpy.app.handlers import persistent

_MODULE = "_keyboard88_autoloaded_hud"
_TAG = "keyboard88_hud_autoload_v1"
_CLEANUP = "_keyboard88_hud_autoload_cleanup"
_active = None
_handle = None


def _remove_draw():
    global _active, _handle
    if _active is not None:
        _active.STATUS.clear()
    if _handle is not None:
        try:
            bpy.types.SpaceView3D.draw_handler_remove(_handle, "WINDOW")
        except (ValueError, ReferenceError, RuntimeError):
            pass
    _active = None
    _handle = None


def _atlas_hud():
    if bpy.app.background or not bpy.data.filepath:
        return None
    folder = Path(bpy.data.filepath).resolve().parent
    hud = folder / "kb88_hud.py"
    if not hud.is_file() or not (folder / "frame-index.json").is_file():
        return None
    if not any("Black Key Atlas Refined" in scene.name for scene in bpy.data.scenes):
        return None
    return hud


def _verified_asset(folder, asset):
    if not isinstance(asset, dict) or set(asset) != {"path", "sha256"}:
        raise ValueError("Missing verified audit asset")
    path = (folder / asset["path"]).resolve()
    path.relative_to(folder.resolve())
    payload = path.read_bytes()
    if hashlib.sha256(payload).hexdigest() != asset["sha256"]:
        raise ValueError("Audit asset SHA changed")
    return json.loads(payload)


def _frame_ids(value):
    return {frame for frame in value if type(frame) is int and frame > 0} if isinstance(value, (list, tuple, set)) else set()

def _apply_audit_sources(module, folder, active=None):
    if active is None:
        path = folder / "probes/continuation-20261025/active-audit.json"
        active = json.loads(path.read_text(encoding="utf-8")) if path.is_file() else {}
    frames = active.get("v4_frames", [])
    summary = {"verified": 0, "unverified": 0}
    receipt = {}
    try:
        if active.get("audit_source_profile") != "accepted_v4_saved_geometry_identity_v1":
            raise ValueError("Unknown saved-geometry audit profile")
        receipt = _verified_asset(folder, active.get("promotion_report"))
        if not isinstance(receipt, dict):
            receipt = {}
            raise ValueError("Invalid promotion receipt")
        if receipt.get("stage") != "complete" or receipt.get("after_blend_sha256") != active.get("scene_sha256"):
            raise ValueError("Audit receipt belongs to another scene")
        if (receipt.get("audit_source_profile") != active.get("audit_source_profile")
                or receipt.get("v4_frames") != frames
                or receipt.get("written_frames") != frames
                or receipt.get("audit_sources") != active.get("audit_sources")):
            raise ValueError("Audit mapping does not match the promotion receipt")
        receipt_ok = True
    except (KeyError, TypeError, ValueError, OSError):
        receipt_ok = False
    targets = _frame_ids(frames) | _frame_ids(receipt.get("v4_frames", []))
    targets |= _frame_ids(getattr(module, "_versioned_audit_frames", []))
    sources = active.get("audit_sources", {})
    source_assets = sources if isinstance(sources, dict) else {}
    if isinstance(sources, dict):
        targets |= {int(key) for key in sources if isinstance(key, str) and key.isdecimal() and int(key) > 0}
    if not receipt_ok and not targets and active.get("audit_source_profile") is not None:
        targets |= _frame_ids(active.get("frames", []))
    module._versioned_audit_frames = sorted(targets)
    for frame in sorted(targets):
        entry = module.STATUS.get(str(frame))
        if entry is None:
            continue
        entry.setdefault("_verified_source_original_label", entry["label" ])
        try:
            if not receipt_ok or type(frame) is not int or frame not in active.get("frames", []):
                raise ValueError("Unverified active frame")
            record = _verified_asset(folder, source_assets.get(str(frame)))
            if type(record.get("blender_frame")) is not int or record.get("blender_frame") != frame or record["report"]["source_consistency"]["pass"] is not True:
                raise ValueError("Saved pose/source identity failed")
            color = record["class"]
            tail = entry["_verified_source_original_label"].partition(" · ")[2]
            entry["label"] = f"{module.LABELS[color]} (проверено V4) · {tail}"
            entry["color"] = module.COLORS[color]
            entry["reason"] = ", ".join(record.get("reasons", [])[:3]) or "Сохранённая геометрия проверена"
            summary["verified"] += 1
        except (KeyError, TypeError, ValueError, OSError):
            entry.update(label="НЕТ АКТУАЛЬНОЙ ПРОВЕРКИ", color=module.COLORS["YELLOW"],
                         reason="Источник проверки не соответствует сохранённой сцене")
            summary["unverified"] += 1
    module._versioned_audit_summary = summary
    return summary

def _enable():
    global _active, _handle
    _remove_draw()
    path = _atlas_hud()
    if path is None:
        return None
    try:
        for folder in (path.parent, path.parent.parent, path.parent.parent.parent):
            value = str(folder)
            if value not in sys.path:
                sys.path.insert(0, value)
        spec = importlib.util.spec_from_file_location(_MODULE, path)
        module = importlib.util.module_from_spec(spec)
        sys.modules[_MODULE] = module
        spec.loader.exec_module(module)
        # Historical HUD versions hard-code the original laboratory directory.
        # Resolve data from this open scene, including independent worktrees.
        module.HERE = path.parent
        count = module.install()
        _active = module
        _handle = bpy.app.driver_namespace.get(module.HANDLE)
        _apply_audit_sources(module, path.parent)
        print(f"Keyboard88 HUD enabled: {count} frames; {path.parent}")
    except Exception:
        _remove_draw()
        traceback.print_exc()
    return None


_enable._keyboard88_hud_tag = _TAG


def _schedule():
    if not bpy.app.background and not bpy.app.timers.is_registered(_enable):
        bpy.app.timers.register(_enable, first_interval=0.25)


@persistent
def _after_load(_unused):
    _schedule()


_after_load._keyboard88_hud_tag = _TAG


@persistent
def _before_load(_unused):
    _remove_draw()
    bpy.app.driver_namespace.pop('keyboard88_hud_loaded_identity_v1', None)


_before_load._keyboard88_hud_tag = _TAG


def unregister():
    if bpy.app.timers.is_registered(_enable):
        bpy.app.timers.unregister(_enable)
    for handlers in (bpy.app.handlers.load_post, bpy.app.handlers.load_pre):
        for callback in list(handlers):
            if getattr(callback, "_keyboard88_hud_tag", None) == _TAG:
                handlers.remove(callback)
    _remove_draw()
    if getattr(bpy, _CLEANUP, None) is unregister:
        delattr(bpy, _CLEANUP)


def register():
    previous = getattr(bpy, _CLEANUP, None)
    if previous is not None and previous is not unregister:
        previous()
    unregister()
    if bpy.app.background:
        return
    setattr(bpy, _CLEANUP, unregister)
    bpy.app.handlers.load_pre.append(_before_load)
    bpy.app.handlers.load_post.append(_after_load)
    _schedule()


if __name__ == "__main__":
    register()
