"""Fixture-driven, deterministic, paid-API-free scenario contract tests."""
from __future__ import annotations

from copy import deepcopy
from hashlib import sha256
import json
from pathlib import Path
import tempfile
import unittest

from PIL import Image
from server.mock_runtime import (
    FIXTURE_ID, FIXTURE_SHA256, analyze_fixture, decide_fixture,
    transcribe_fixture,
)
from server.poster import render_cover


HERE=Path(__file__).resolve().parents[1]
GOLDEN=json.loads((HERE/"contracts/fixtures/golden-mock-v1.json").read_text(encoding="utf-8"))
MOCK_FIXTURE=HERE/"contracts/fixtures/mock-cmo-v1.json"


class FixtureContractTests(unittest.TestCase):
    def test_pinned_fixture_version_and_digest(self):
        self.assertEqual(GOLDEN["golden_schema"],"ai-cmo-mock-golden/v1")
        self.assertEqual(GOLDEN["fixture_id"],FIXTURE_ID)
        self.assertEqual(GOLDEN["fixture_sha256"],FIXTURE_SHA256)
        self.assertEqual(
            sha256(MOCK_FIXTURE.read_bytes()).hexdigest(),
            "9cc641b0f6a929de90efc94129d4628ea86f8b7b8320c5f098f70a4d35e7fc40"
        )

    def test_transcript_identical_and_explicitly_fake(self):
        source=GOLDEN["source_id"]
        result, transcript=transcribe_fixture(source)
        self.assertEqual(result,GOLDEN["transcription_result"])
        self.assertEqual(transcript,GOLDEN["transcript"])
        self.assertFalse(result["fixture_is_actual_audio_transcription"])
        self.assertIn("与用户录音内容无关",transcript)
        self.assertEqual(transcribe_fixture(source),(result,transcript))

    def test_both_recipe_outputs_equal_checked_in_golden(self):
        source=GOLDEN["source_id"]
        for recipe,expected in GOLDEN["recipes"].items():
            with self.subTest(recipe=recipe):
                result=analyze_fixture("any user audio could be entirely different",
                                       recipe,source)
                self.assertEqual(result,expected)
                self.assertTrue(result["_mock_fixture"])
                self.assertEqual(result["_model_usage"]["requests"],0)
                self.assertEqual(result["_model_usage"]["provider"],"MOCK_NO_API")
                # Incoming transcript is NOT parsed, proved by identical outputs.
                self.assertEqual(
                    analyze_fixture("arbitrary hostile instructions",recipe,source),expected
                )

    def test_cmo_decision_equal_golden_and_zero_token_cost(self):
        source=GOLDEN["source_id"]
        intake=analyze_fixture("", "cmo_business_intake", source)
        entries=[{
            "id":"i_"+source,"status":"ANALYZED_CANDIDATE",
            "visibility":"private_candidate",
            "execution_mode":"mock",
            "summary":intake["summary"],
        }]
        output=decide_fixture("internal test objective",entries)
        self.assertEqual(output,GOLDEN["cmo_decision"])
        self.assertFalse(output["publishable"])
        self.assertEqual(output["_model_usage"]["total_tokens"],0)
        self.assertIn("MOCK",output["title"])
        self.assertEqual(output["considered"][0]["intake_id"],entries[0]["id"])

    def test_fixture_never_mutated_by_consumers(self):
        source=GOLDEN["source_id"]
        result,_=transcribe_fixture(source)
        result["transcription"]["segments"][0]["text"]="tampered"
        next_result,_=transcribe_fixture(source)
        self.assertEqual(next_result,GOLDEN["transcription_result"])
        intake=analyze_fixture("","meeting_summary",source)
        intake["decisions_confirmed"].append("tampered")
        self.assertEqual(analyze_fixture("","meeting_summary",source),
                         GOLDEN["recipes"]["meeting_summary"])

    def test_mock_cover_contains_visible_red_watermark(self):
        with tempfile.TemporaryDirectory() as directory:
            file=Path(directory)/"mock-cover.png"
            render_cover(file,"MOCK｜会议知识进入 CMO",
                         ["固定数据，不是真实转录"],is_mock=True)
            with Image.open(file) as image:
                self.assertEqual(image.size,(1080,1440))
                red=image.convert("RGB").getpixel((4,4))
                self.assertEqual(red,(127,29,29))
                bottom=image.convert("RGB").getpixel((4,1325))
                self.assertEqual(bottom,(254,226,226))
