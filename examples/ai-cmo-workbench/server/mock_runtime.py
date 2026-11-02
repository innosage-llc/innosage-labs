"""Versioned, file-driven deterministic demo fixtures.

No API/model/transcription calls, no analysis of recorded audio bytes. The entire
scenario lives in contracts/fixtures/mock-cmo-v1.json and is suitable for
network-denied CI. Treat outputs as fake and never promote/publish them.
"""
from __future__ import annotations

from copy import deepcopy
from hashlib import sha256
import json
from pathlib import Path

_FIXTURE_FILE = (
    Path(__file__).resolve().parents[1] / "contracts/fixtures/mock-cmo-v1.json"
)
_FIXTURE_BYTES = _FIXTURE_FILE.read_bytes()
_FIXTURE = json.loads(_FIXTURE_BYTES)
if _FIXTURE.get("schema_version") != "ai-cmo-fixture/v1":
    raise RuntimeError("Invalid or unsupported mock scenario fixture")
if set(_FIXTURE["recipes"]) != {"meeting_summary", "cmo_business_intake"}:
    raise RuntimeError("Unrecognized recipe scenario")
if not _FIXTURE["transcription_segments"]:
    raise RuntimeError("Mock transcription fixture cannot be empty")

MOCK_MARK = "[MOCK — 仅供流程验证，不可发布]"
MOCK_SEGMENTS = deepcopy(_FIXTURE["transcription_segments"])
FIXTURE_ID = _FIXTURE["scenario_id"]
FIXTURE_SHA256 = sha256(_FIXTURE_BYTES).hexdigest()

_ZERO_COST = {
    "requests": 0, "input_tokens": 0, "output_tokens": 0,
    "total_tokens": 0, "dollar_cost": "0.00", "provider": "MOCK_NO_API",
}


def transcribe_fixture(source_id: str) -> tuple[dict, str]:
    """Always the same known synthetic transcript regardless of input audio."""
    transcript = "\n".join(
        [f"# {MOCK_MARK}", "**下面不是真实录音的转录，不可引用为公司事实。**"]
        + [
            f"[{seg['start_ms']//60000:02d}:{seg['start_ms']//1000%60:02d}.000 - "
            f"{seg['end_ms']//60000:02d}:{seg['end_ms']//1000%60:02d}.000] {seg['text']}"
            for seg in MOCK_SEGMENTS
        ]
    )
    result = {
        "schema_version": "mock-transcription/v1",
        "transcription": {"segments": deepcopy(MOCK_SEGMENTS)},
        "_adapter_cleanup": "NOT_APPLICABLE_MOCK",
        "fixture_source_id": source_id,
        "fixture_id": FIXTURE_ID,
        "fixture_sha256": FIXTURE_SHA256,
        "fixture_is_actual_audio_transcription": False,
    }
    return result, transcript


def analyze_fixture(text: str, recipe: str, source_id: str) -> dict:
    """Template-driven recipe output; text is deliberately NEVER interpreted."""
    if recipe not in _FIXTURE["recipes"]:
        raise ValueError("unsupported mock recipe")
    body = deepcopy(_FIXTURE["recipes"][recipe])
    body["summary"] = body["summary"].replace("__SOURCE_ID__", source_id)
    body.update(
        _model_usage=deepcopy(_ZERO_COST),
        _mock_fixture=True,
        _fixture_id=FIXTURE_ID,
        _fixture_sha256=FIXTURE_SHA256,
    )
    return body


def decide_fixture(objective: str, sources: list[dict]) -> dict:
    """Deterministically select the first fixture intake and account for all."""
    considered = []
    chosen = None
    for source in sources[:12]:
        if source.get("execution_mode") == "mock" and source.get("summary"):
            disposition = "considered_and_used" if chosen is None else "considered_irrelevant"
            reason = ("选择最新模拟 Intake 验证内容流程"
                      if chosen is None else "本次只测试单一素材")
            if chosen is None:
                chosen = source["id"]
        else:
            disposition, reason = "blocked", "来源无模拟摘要或授权状态不允许使用"
        considered.append(
            {"intake_id":source["id"], "disposition":disposition, "reason":reason}
        )
    output = deepcopy(_FIXTURE["cmo"])
    output.update(
        outcome="ADJUST" if chosen else "SKIP",
        next_action=(
            output["next_action"] if chosen else "[MOCK] 先采集并完成一份模拟 Intake"
        ),
        rationale=(
            f"{MOCK_MARK} 已检查 {len(considered)} 份资料。"
            "此处验证的是工作流与权限边界，不是模型营销判断。"
        ),
        considered=considered,
        publishable=False,
        _model_usage=deepcopy(_ZERO_COST),
        _mock_fixture=True,
        _fixture_id=FIXTURE_ID,
        _fixture_sha256=FIXTURE_SHA256,
    )
    return output
