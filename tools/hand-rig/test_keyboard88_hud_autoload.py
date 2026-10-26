"""Source-binding regressions without Blender or licensed atlas fixtures."""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
from types import ModuleType, SimpleNamespace
import unittest
from unittest.mock import patch


def load_reader():
    bpy = ModuleType("bpy")
    app = ModuleType("bpy.app")
    handlers = ModuleType("bpy.app.handlers")
    handlers.persistent = lambda callback: callback
    bpy.app = app
    app.handlers = handlers
    spec = importlib.util.spec_from_file_location("_hud_source_test", Path(__file__).with_name("keyboard88_hud_autoload.py"))
    module = importlib.util.module_from_spec(spec)
    with patch.dict(sys.modules, {"bpy": bpy, "bpy.app": app, "bpy.app.handlers": handlers}):
        spec.loader.exec_module(module)
    return module


class HudSourceBindingTests(unittest.TestCase):
    def setUp(self):
        self.reader = load_reader()
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.folder = Path(self.directory.name)
        self.active = self.fixture()

    def asset(self, name, value):
        payload = json.dumps(value, sort_keys=True).encode("utf-8")
        (self.folder / name).write_bytes(payload)
        return {"path": name, "sha256": hashlib.sha256(payload).hexdigest()}

    def fixture(self, frame=400, source_pass=True):
        sources = {"400": self.asset("audit.json", {"blender_frame": frame, "class": "GREEN", "reasons": [], "report": {"source_consistency": {"pass": source_pass}}})}
        receipt = {"stage": "complete", "after_blend_sha256": "1" * 64, "written_frames": [400], "v4_frames": [400], "audit_sources": sources, "audit_source_profile": "accepted_v4_saved_geometry_identity_v1"}
        return {"frames": [400], "v4_frames": [400], "audit_sources": sources, "scene_sha256": "1" * 64, "audit_source_profile": receipt["audit_source_profile"], "promotion_report": self.asset("receipt.json", receipt)}

    def view(self):
        return SimpleNamespace(STATUS={"400": {"label": "OLD GREEN · case400", "color": "green", "reason": ""}}, LABELS={"GREEN": "GREEN"}, COLORS={"GREEN": "green", "YELLOW": "yellow"})

    def test_valid_saved_source_is_used(self):
        view = self.view()
        self.assertEqual(self.reader._apply_audit_sources(view, self.folder, self.active), {"verified": 1, "unverified": 0})
        self.assertEqual(view.STATUS["400"]["color"], "green")
        self.assertIn("V4", view.STATUS["400"]["label"])

    def test_removed_or_corrupt_mapping_invalidates_previous_green_and_recovers(self):
        for mode in ("empty", "removed", "null", "bad_mapping", "missing_receipt", "wrong_scene", "stale_sha", "empty_manifest"):
            with self.subTest(mode=mode):
                view = self.view()
                self.reader._apply_audit_sources(view, self.folder, self.active)
                valid_label = view.STATUS["400"]["label"]
                bad = copy.deepcopy(self.active)
                if mode in ("empty", "removed"): bad["v4_frames"] = []
                elif mode == "null": bad["v4_frames"] = None
                elif mode == "bad_mapping": bad["audit_sources"] = []
                elif mode == "missing_receipt": bad.pop("promotion_report")
                elif mode == "wrong_scene": bad["scene_sha256"] = "0" * 64
                elif mode == "stale_sha": bad["audit_sources"]["400"]["sha256"] = "0" * 64
                else: bad = {}
                self.assertEqual(self.reader._apply_audit_sources(view, self.folder, bad), {"verified": 0, "unverified": 1})
                self.assertEqual(view.STATUS["400"]["color"], "yellow")
                self.assertEqual(self.reader._apply_audit_sources(view, self.folder, self.active), {"verified": 1, "unverified": 0})
                self.assertEqual(view.STATUS["400"]["label"], valid_label)

    def test_hash_drift_after_publication_is_rejected(self):
        (self.folder / "audit.json").write_bytes((self.folder / "audit.json").read_bytes() + b"\n")
        view = self.view()
        self.assertEqual(self.reader._apply_audit_sources(view, self.folder, self.active), {"verified": 0, "unverified": 1})

    def test_wrong_frame_or_source_identity_is_rejected(self):
        for frame, source_pass in ((402, True), (400, False), (400, 1), (400.0, True)):
            with self.subTest(frame=frame, source_pass=source_pass):
                active = self.fixture(frame=frame, source_pass=source_pass)
                self.assertEqual(self.reader._apply_audit_sources(self.view(), self.folder, active), {"verified": 0, "unverified": 1})

    def test_asset_cannot_escape_atlas_folder(self):
        with self.assertRaises(ValueError):
            self.reader._verified_asset(self.folder, {"path": "../audit.json", "sha256": "0" * 64})


if __name__ == "__main__":
    unittest.main()