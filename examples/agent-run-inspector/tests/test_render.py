"""Offline standard-library tests; no raw OpenClaw data or model requests."""
import importlib.util
import unittest
from pathlib import Path

SOURCE=Path(__file__).resolve().parents[1]/"scripts"/"render.py"
spec=importlib.util.spec_from_file_location("agent_xray_render",SOURCE)
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


class HtmlSafety(unittest.TestCase):
    def setUp(self):
        self.base={
            "schema":1,"metadata":{
                "source_kind":"REAL_OPENCLAW_SQLITE","tool_calls":1,
                "tool_results":1,"model":"gpt-6-luna",
                "persisted":{"transcript_events":12},
            },
            "evidence":[{"type":"tool.call","seq":9,"tool":"web_fetch",
                         "at":"2026-10-13T09:42:00Z","argument_fields":["url"],
                         "arguments":"WITHHELD","evidence":"trajectory_runtime_events:seq=9"}],
            "judgments":[{"topic":"Actual calls","state":"OBSERVED","because":"matched"}],
        }

    def test_html_escapes_content_and_does_not_render_unknown_fields(self):
        self.base["evidence"][0]["other_private"]="SUPER_SECRET_42"
        self.base["evidence"][0]["tool"]="<script>alert(1)</script>"
        self.base["judgments"][0]["because"]="<img src=x onerror=alert(1)>"
        out=mod.render(self.base)
        self.assertIn("&lt;script&gt;",out)
        self.assertNotIn("SUPER_SECRET_42",out)
        self.assertNotIn("<script>",out)
        self.assertNotIn("<img src=x",out)
        self.assertIn("WITHHELD for privacy",out)

    def test_rejects_non_real_or_empty_trace(self):
        self.base["metadata"]["source_kind"]="FAKE_DATA"
        with self.assertRaises(ValueError):
            mod.render(self.base)
        self.base["metadata"]["source_kind"]="REAL_OPENCLAW_SQLITE"
        self.base["evidence"]=[]
        with self.assertRaises(ValueError):
            mod.render(self.base)


if __name__=="__main__":
    unittest.main()
