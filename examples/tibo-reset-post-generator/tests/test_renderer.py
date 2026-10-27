"""P0 integration tests. Run in an actual repo checkout with canonical poster."""
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

from PIL import Image, ImageChops

PROJECT = Path(__file__).resolve().parents[1]
SKILL = PROJECT / ".agents/skills/tibo-reset-post-generator"
CANONICAL = PROJECT / "assets/codex-10-26极简重置更新公告海报.png"
SOURCE = SKILL / "examples/deterministic-input.json"

def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

class TestRenderer(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.renderer = load(SKILL / "scripts/render_poster.py", "poster_renderer")
        cls.builder = load(PROJECT / "build_skill.py", "skill_builder")

    def test_avatar_region_extends_below_portrait_and_precedes_quote(self):
        layout = json.loads((SKILL / "references/layout.json").read_text(encoding="utf-8"))
        identity = layout["protected_regions"]["tibo_identity"]
        quote = layout["editable_regions"]["quote"]
        self.assertGreaterEqual(identity[3], 1023)
        self.assertGreaterEqual(quote[1], identity[3])
        self.assertFalse(self.renderer.intersection(identity, quote))

    def test_asset_identity(self):
        self.assertTrue(CANONICAL.exists(), "canonical PNG required in Git checkout")
        self.assertEqual(self.renderer.blob_sha(CANONICAL.read_bytes()), self.renderer.EXPECTED_BLOB)

    def test_render_and_pixel_qa(self):
        font = self.renderer.choose_font(None)
        with tempfile.TemporaryDirectory() as d:
            out = Path(d)
            data = json.loads(SOURCE.read_text(encoding="utf-8"))
            qa = self.renderer.run(data, out, font_path=font)
            self.assertEqual(qa["status"], "READY_FOR_REVIEW")
            self.assertEqual(qa["image"]["base_git_blob_sha"], self.renderer.EXPECTED_BLOB)
            self.assertEqual(qa["pixels_changed_outside_editable_regions"], 0)
            self.assertTrue(all(n == 0 for n in qa["protected_pixel_differences"].values()))
            self.assertEqual(qa["image"]["width"] * 4, qa["image"]["height"] * 3)
            self.assertTrue((out/"title.txt").read_text(encoding="utf-8").strip())
            self.assertTrue((out/"caption.md").read_text(encoding="utf-8").strip())
            base = Image.open(CANONICAL).convert("RGB")
            poster = Image.open(out/"poster.png").convert("RGB")
            self.assertEqual(base.size, poster.size)
            for box in qa["editable_rectangles"].values():
                self.assertGreaterEqual(box["font_px"], 17)
                for b in box["text_bounds"]:
                    r = box["rectangle"]
                    self.assertTrue(r[0] <= b[0] < b[2] <= r[2])
                    self.assertTrue(r[1] <= b[1] < b[3] <= r[3])
            # Independent protection comparison.
            layout = json.loads((SKILL/"references/layout.json").read_text())
            w,h = base.size; rw,rh = layout["reference_dimensions"]
            for key, coords in layout["protected_regions"].items():
                bounds = self.renderer.rect(coords,w,h,rw,rh)
                self.assertIsNone(ImageChops.difference(base.crop(bounds),poster.crop(bounds)).getbbox(), key)

    def test_reject_mismatched_base_and_overflow(self):
        data = json.loads(SOURCE.read_text(encoding="utf-8"))
        with tempfile.TemporaryDirectory() as d:
            fake = Path(d)/"wrong.png"
            Image.new("RGB",(1086,1448),"white").save(fake)
            with self.assertRaisesRegex(self.renderer.ValidationError,"BASE_HASH_MISMATCH"):
                self.renderer.run(data,Path(d)/"out",base_path=fake)
            data["poster"]["quote"] = "有关重置的冗长文字"*20
            with self.assertRaisesRegex(self.renderer.ValidationError,"TOO_DENSE"):
                self.renderer.run(data,Path(d)/"out")

    def test_evidence_tiers_fail_closed(self):
        data = json.loads(SOURCE.read_text(encoding="utf-8"))
        data["evidence"]["level"] = "UNVERIFIED"
        with self.assertRaisesRegex(self.renderer.ValidationError,"EVIDENCE_UNVERIFIED"):
            self.renderer.validated_input(data)
        data["evidence"]["level"] = "ARCHIVE_CROSSCHECK"
        data["evidence"]["urls"] = ["https://example.com/a"]
        with self.assertRaisesRegex(self.renderer.ValidationError,"two distinct"):
            self.renderer.validated_input(data)
        data = json.loads(SOURCE.read_text(encoding="utf-8"))
        data["poster"]["hero"] = "02:00已重置"
        with self.assertRaisesRegex(self.renderer.ValidationError,"UNSOURCED_TIME"):
            self.renderer.validated_input(data)

    def test_cli_writes_machine_readable_qa_for_success_and_failure(self):
        font = self.renderer.choose_font(None)
        script = SKILL / "scripts/render_poster.py"
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            success = subprocess.run([
                sys.executable, str(script), "--input", str(SOURCE),
                "--out-dir", str(root/"good"), "--font", font
            ], text=True, capture_output=True)
            self.assertEqual(success.returncode, 0, success.stderr)
            qa = json.loads((root/"good/qa.json").read_text(encoding="utf-8"))
            self.assertEqual(qa["status"], "READY_FOR_REVIEW")
            self.assertEqual(qa["pixels_changed_outside_editable_regions"], 0)
            wrong = root/"wrong.png"
            Image.new("RGB", (1086, 1448), "white").save(wrong)
            fail = subprocess.run([
                sys.executable, str(script), "--input", str(SOURCE),
                "--out-dir", str(root/"bad"), "--base", str(wrong), "--font", font
            ], text=True, capture_output=True)
            self.assertNotEqual(fail.returncode, 0)
            badqa = json.loads((root/"bad/qa.json").read_text(encoding="utf-8"))
            self.assertEqual(badqa["status"], "INCOMPLETE")
            self.assertIn("BASE_HASH_MISMATCH", badqa["reason"])
            self.assertFalse((root/"bad/poster.png").exists())

    def test_portable_zip_clean_extract(self):
        with tempfile.TemporaryDirectory() as d:
            dest = Path(d)/"skill.zip"
            self.builder.build(dest)
            with zipfile.ZipFile(dest) as archive:
                names = archive.namelist()
                self.assertIn("tibo-reset-post-generator/SKILL.md",names)
                self.assertIn("tibo-reset-post-generator/assets/base-poster.png",names)
                self.assertIn("tibo-reset-post-generator/scripts/render_poster.py",names)
                self.assertFalse(any(n.endswith((".ttf",".ttc",".otf")) for n in names))
                archive.extractall(Path(d)/"unpacked")
            standalone = Path(d)/"unpacked/tibo-reset-post-generator"
            self.assertEqual(self.renderer.blob_sha((standalone/"assets/base-poster.png").read_bytes()),self.renderer.EXPECTED_BLOB)
            portable = load(standalone/"scripts/render_poster.py", "portable_renderer")
            data = json.loads((standalone/"examples/deterministic-input.json").read_text(encoding="utf-8"))
            qa = portable.run(data,Path(d)/"out",font_path=portable.choose_font(None))
            self.assertEqual(qa["status"],"READY_FOR_REVIEW")

if __name__ == "__main__":
    unittest.main()
