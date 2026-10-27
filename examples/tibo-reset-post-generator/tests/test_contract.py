"""Dependency-free static tests. NOT an LLM behavior or image-rendering test."""

import json
import re
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

PROJECT = Path(__file__).resolve().parents[1]
SKILL = PROJECT / ".agents/skills/tibo-reset-post-generator"
ROOT = PROJECT.parents[1]
FIXTURES = PROJECT / "tests/fixtures/cases.json"


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
        for c in cases.values():
            self.assertTrue(c["expected"]["must_not_claim_all_accounts"])

    def test_public_asset_boundary(self):
        assets = list((PROJECT / "assets").iterdir())
        self.assertEqual([x.name for x in assets], ["README.md"])
        for path in PROJECT.rglob("*"):
            if path.is_file():
                self.assertNotIn(path.suffix.lower(), {".jpg", ".jpeg", ".png", ".webp", ".gif"})
        skill_text = (SKILL / "SKILL.md").read_text(encoding="utf-8")
        self.assertIn("INCOMPLETE", skill_text)
        self.assertIn("READY_FOR_REVIEW", skill_text)
        self.assertIn("post_published_at", skill_text)
        self.assertIn("reset_event_at", skill_text)


if __name__ == "__main__":
    unittest.main()
