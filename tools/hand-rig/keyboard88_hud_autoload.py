"""Automatically restore the Keyboard88 viewport HUD for local atlas scenes.

Install this module in Blender's user scripts/startup directory. This is a
Blender startup module, so scene auto-execution may remain disabled. It reads
the HUD next to the opened atlas and never saves the scene or starts MCP.
"""

from pathlib import Path
import importlib.util
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
        print(f"Keyboard88 HUD enabled: {count} frames; {path.parent}")
    except Exception:
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
