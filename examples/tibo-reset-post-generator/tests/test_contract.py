"""Dependency-free static tests. NOT an LLM behavior or image-rendering test."""

import hashlib
import json
import re
import struct
import unittest
import zlib
from datetime import datetime, timedelta, timezone
from pathlib import Path

PROJECT = Path(__file__).resolve().parents[1]
SKILL = PROJECT / ".agents/skills/tibo-reset-post-generator"
ROOT = PROJECT.parents[1]
FIXTURES = PROJECT / "tests/fixtures/cases.json"
DEFAULT_IMAGE = PROJECT / "assets/codex-10-26极简重置更新公告海报.png"
# Git blob SHA of the founder-selected image on main before this change.
EXPECTED_BASE_IMAGE_BLOB_SHA = "44fee2832dd283e8f168a7ca1eee6a71bd3e0416"


class TestPublicSkillContract(unittest.TestCase):
    def test_skill_frontmatter(self):
        text = (SKILL / "SKILL.md").read_text(encoding="utf-8")
        self.assertTrue(text.startswith("---\n"))
        head = text.split("---", 2)[1]
        fields = dict(
            (line.split(":", 1)[0].strip(), line.split(":", 1)[1].strip())
            for line in head.splitlines()
            if ":" in line and not line.startswith(" ") and line.strip()
        )
        name = fields["name"]
        self.assertEqual(name, SKILL.name)
        self.assertRegex(name, r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
        self.assertLessEqual(len(name), 64)
        self.assertTrue(0 < len(fields["description"]) <= 1024)
        self.assertIn("poster", fields["description"].lower())

    def test_self_contained_skill_references(self):
        body = (SKILL / "SKILL.md").read_text(encoding="utf-8")
        for rel in [
            "references/evidence-rules.md",
            "references/poster-style.md",
            "examples/sample-case.md",
        ]:
            self.assertIn("(" + rel + ")", body)
            self.assertTrue((SKILL / rel).is_file(), rel)

    def test_local_markdown_links(self):
        files = list(PROJECT.rglob("*.md")) + [ROOT / "README.md", ROOT / "examples/README.md"]
        for path in files:
            text = path.read_text(encoding="utf-8")
            for href in re.findall(r"\]\(([^)]+)\)", text):
                target = href.split("#", 1)[0]
                if not target or "://" in target or target.startswith(("mailto:", "/", "#")):
                    continue
                self.assertTrue((path.parent / target).is_file(), f"{path}: missing {href}")

    def test_fixture_conventions_and_timezones(self):
        data = json.loads(FIXTURES.read_text(encoding="utf-8"))
        self.assertEqual(data["format_version"], 1)
        cases = {c["id"]: c for c in data["cases"]}
        self.assertEqual(set(cases), {
            "clock_without_timezone",
            "explicit_future_reset_instant",
            "irrelevant_post",
            "unreadable_url_only",
            "base_image_unavailable",
        })
        clock = cases["clock_without_timezone"]
        self.assertIsNone(clock["source"]["viewer_timezone"])
        self.assertIsNone(clock["expected"]["post_time_beijing"])
        self.assertIsNone(clock["expected"]["reset_time_beijing"])
        self.assertEqual(clock["expected"]["poster_time"], "重置时间待确认")
        self.assertEqual(clock["expected"]["claim_status"], "CLAIMED")
        event = cases["explicit_future_reset_instant"]
        aware = datetime.fromisoformat(event["source"]["reset_event_iso"])
        self.assertIsNotNone(aware.tzinfo)
        beijing = aware.astimezone(timezone(timedelta(hours=8)))
        self.assertEqual(beijing.isoformat(), event["expected"]["reset_time_beijing"])
        self.assertEqual(event["expected"]["claim_status"], "ANNOUNCED")
        for cid in ("irrelevant_post", "unreadable_url_only"):
            self.assertIsNone(cases[cid]["expected"]["poster_time"])
            self.assertIsNone(cases[cid]["expected"]["reset_time_beijing"])
            self.assertIsNone(cases[cid]["expected"]["render_mode"])
        for cid in ("clock_without_timezone", "explicit_future_reset_instant"):
            self.assertTrue(cases[cid]["base_image_accessible"])
            self.assertEqual(cases[cid]["expected"]["render_mode"], "edit_existing_poster")
        missing = cases["base_image_unavailable"]
        self.assertFalse(missing["base_image_accessible"])
        self.assertEqual(missing["expected"]["disposition"], "INCOMPLETE")
        self.assertEqual(missing["expected"]["failure_reason"], "BASE_IMAGE_UNAVAILABLE")
        self.assertEqual(missing["expected"]["render_mode"], "edit_existing_poster")
        for c in cases.values():
            self.assertTrue(c["expected"]["must_not_claim_all_accounts"])

    def test_default_image_is_original_png_and_3_by_4(self):
        # The example intentionally includes ONE founder-selected public base PNG.
        self.assertTrue(DEFAULT_IMAGE.is_file())
        raw = DEFAULT_IMAGE.read_bytes()
        self.assertTrue(raw.startswith(b"\x89PNG\r\n\x1a\n"))
        self.assertGreaterEqual(len(raw), 33)
        length = struct.unpack(">I", raw[8:12])[0]
        self.assertEqual(raw[12:16], b"IHDR")
        self.assertEqual(length, 13)
        data = raw[16:29]
        expected_crc = struct.unpack(">I", raw[29:33])[0]
        self.assertEqual(zlib.crc32(b"IHDR" + data) & 0xFFFFFFFF, expected_crc)
        width, height = struct.unpack(">II", data[:8])
        self.assertGreater(width, 0)
        self.assertGreater(height, 0)
        self.assertEqual(width * 4, height * 3, "default poster must be 3:4")
        blob = b"blob " + str(len(raw)).encode("ascii") + b"\0" + raw
        self.assertEqual(hashlib.sha1(blob).hexdigest(), EXPECTED_BASE_IMAGE_BLOB_SHA)

    def test_only_allow_selected_example_image(self):
        images = [
            p.relative_to(PROJECT).as_posix()
            for p in PROJECT.rglob("*")
            if p.is_file() and p.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp", ".gif"}
        ]
        self.assertEqual(images, ["assets/codex-10-26极简重置更新公告海报.png"])

    def test_template_contract_and_outputs(self):
        data = json.loads(FIXTURES.read_text(encoding="utf-8"))
        template = data["template"]
        self.assertEqual(template["default_base_image"], DEFAULT_IMAGE.relative_to(PROJECT).as_posix())
        self.assertEqual(template["git_blob_sha"], EXPECTED_BASE_IMAGE_BLOB_SHA)
        self.assertEqual(template["default_render_mode"], "edit_existing_poster")
        self.assertIn("BASE_IMAGE_UNAVAILABLE", template["missing_base_outcome"])
        self.assertIn("Tibo profile picture", template["protected_regions"])
        self.assertIn("OpenAI/Codex logo", template["protected_regions"])
        self.assertIn("Chinese translation", template["editable_text_regions"])
        self.assertIn("separate Chinese title", template["deliverables"])
        self.assertIn("separate Chinese caption", template["deliverables"])
        skill_text = (SKILL / "SKILL.md").read_text(encoding="utf-8")
        style = (SKILL / "references/poster-style.md").read_text(encoding="utf-8")
        workflow = (PROJECT / "workflows/generate-post.md").read_text(encoding="utf-8")
        project_readme = (PROJECT / "README.md").read_text(encoding="utf-8")
        for token in ("edit_existing_poster", "BASE_IMAGE_UNAVAILABLE", "READY_FOR_REVIEW",
                      "post_published_at", "reset_event_at"):
            self.assertIn(token, skill_text)
        for token in ("Tibo", "OpenAI/Codex", "时间待确认", "3:4"):
            self.assertIn(token, style)
        self.assertIn("ACTUAL edited 3:4 poster image", workflow)
        self.assertIn("separate Chinese social TITLE", workflow)
        self.assertIn("attach its actual PNG bytes", project_readme)



if __name__ == "__main__":
    unittest.main()
