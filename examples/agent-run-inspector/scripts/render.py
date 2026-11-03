#!/usr/bin/env python3
"""Render sanitized OpenClaw trace metadata into a local, no-network HTML page.

The source JSON MUST already be filtered by export-openclaw.cjs.
This renderer additionally uses only explicit allowlisted fields and escapes text.
"""
from __future__ import annotations
import html
import json
import sys
from datetime import datetime
from pathlib import Path


def esc(x: object) -> str:
    return html.escape(str(x if x is not None else "—"), quote=True)


LABEL = {
    "session.started": ("Run started", "Agent runtime began the recorded turn"),
    "context.compiled": ("Context compiled", "Runtime prepared prompt/tool context"),
    "prompt.submitted": ("Prompt submitted", "A model request was dispatched"),
    "tool.call": ("Tool called", "Model-associated run invoked an external capability"),
    "tool.result": ("Tool result", "Runtime received the tool response"),
    "model.completed": ("Model completed", "One model completion and usage receipt recorded"),
    "session.ended": ("Run ended", "Runtime marked the turn terminal"),
}

ALLOWED_TYPES = set(LABEL)
ALLOWED_VERDICTS = {"OBSERVED", "PARTIAL", "NOT OBSERVED", "UNKNOWN"}


def meta_chip(label: str, value: object) -> str:
    return ('<div class="kpi"><span>' + esc(label) + '</span>'
            '<strong>' + esc(value) + '</strong></div>')


def item_view(ev: dict, index: int) -> str:
    kind = str(ev.get("type", ""))
    if kind not in ALLOWED_TYPES:
        return ""
    title, description = LABEL[kind]
    fields: list[tuple[str, object]] = [
        ("Evidence pointer", ev.get("evidence", "NOT OBSERVED")),
        ("Recorded timestamp (UTC)", ev.get("at", "NOT OBSERVED")),
    ]
    if kind == "session.started":
        fields.append(("Advertised tools", ev.get("advertised_tool_count", "UNKNOWN")))
    elif kind == "context.compiled":
        fields += [
            ("Recorded system-prompt characters", ev.get("system_prompt_chars", "UNKNOWN")),
            ("Recorded prompt characters", ev.get("context_prompt_chars", "UNKNOWN")),
            ("Visible tool names", ", ".join(ev.get("tools_advertised", [])[:18]) or "NOT OBSERVED"),
            ("Tool list truncated", str(bool(ev.get("tools_list_truncated", False)))),
            ("Full effective model context", "NOT OBSERVED — trace excerpt is not a token-for-token prompt dump"),
        ]
    elif kind == "prompt.submitted":
        fields.append(("Full input", "WITHHELD for privacy"))
    elif kind == "tool.call":
        fields += [
            ("Tool", ev.get("tool", "UNKNOWN")),
            ("Argument field NAMES only", ", ".join(ev.get("argument_fields", [])[:8]) or "(none)"),
            ("Arguments", "WITHHELD for privacy"),
            ("Call reference (hashed)", ev.get("call_ref", "UNKNOWN")),
        ]
    elif kind == "tool.result":
        fields += [
            ("Tool", ev.get("tool", "UNKNOWN")),
            ("Successful", ev.get("success", "UNKNOWN")),
            ("Result content items", ev.get("result_content_items", "UNKNOWN")),
            ("Result body", "WITHHELD for privacy"),
            ("Call reference (hashed)", ev.get("call_ref", "UNKNOWN")),
        ]
    elif kind == "model.completed":
        fields += [
            ("Assistant text segments", ev.get("assistant_text_segments", "UNKNOWN")),
            ("Assistant text character count", ev.get("assistant_text_chars", "UNKNOWN")),
            ("Assistant actual response", "WITHHELD for privacy"),
        ]
        for key in ("input", "output", "cacheRead", "cacheWrite", "reasoningTokens", "total"):
            if key in ev.get("usage", {}):
                fields.append(("Usage: " + key, ev["usage"][key]))
    elif kind == "session.ended":
        fields.append(("Status", ev.get("status", "UNKNOWN")))

    cls = "tool" if kind in ("tool.call", "tool.result") else "run"
    summary = ('<div class="event-head"><div class="node ' + cls + '">' +
               ("↳" if kind in ("tool.call", "tool.result") else str(index).zfill(2)) +
               '</div><div class="event-main"><div class="event-title">' +
               esc(title) + (" · " + esc(ev.get("tool")) if kind in ("tool.call", "tool.result") else "") +
               '</div><div class="subtext">' + esc(description) +
               '</div></div><div class="seq">seq ' + esc(ev.get("seq", "—")) +
               '</div><span class="chevron">+</span></div>')
    rows = "".join(
        '<div class="fact"><span>' + esc(k) + '</span><strong>' + esc(v) + '</strong></div>'
        for k, v in fields
    )
    return '<details class="event"><summary>' + summary + '</summary><div class="event-body">' + rows + '</div></details>'


STYLE = """
:root{color-scheme:light;--ink:#272727;--muted:#827e78;--line:#e9e7e4;--surface:#fff;--canvas:#faf9f7}
*{box-sizing:border-box}html{font-family:-apple-system,BlinkMacSystemFont,"Inter","Segoe UI",sans-serif}
body{margin:0;background:var(--canvas);color:var(--ink);line-height:1.55;font-size:14px}
main{max-width:1260px;margin:auto;padding:42px 34px 60px}
.top{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line);padding-bottom:20px;margin-bottom:33px;gap:12px}
.brand{font-weight:760;letter-spacing:-.4px;font-size:17px}.brand span{display:inline-grid;place-items:center;width:31px;height:31px;background:#252525;color:#fff;border-radius:8px;margin-right:9px}
.eyebrow{font-size:10px;letter-spacing:1.6px;color:#9b968d;text-transform:uppercase;font-weight:720}
h1{font-size:37px;letter-spacing:-1.3px;margin:9px 0 10px;line-height:1.2}h2{font-size:19px;letter-spacing:-.4px;margin:4px 0 15px}h3{margin:0;font-size:14px}
.lead{max-width:800px;color:#77736e;font-size:15px;margin:0 0 23px}
.chip{display:inline-block;background:#f0ede7;border-radius:20px;padding:5px 10px;color:#766f67;font-size:10px;font-weight:700}
.w{border:1px solid #f0e8d7;background:#fffcf6;border-radius:11px;padding:15px 18px;color:#796c57;font-size:12px;margin-bottom:26px}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--line);border:1px solid var(--line);border-radius:11px;overflow:hidden;margin:24px 0 36px}
.kpi{background:#fff;padding:17px 18px;min-height:87px}.kpi span{font-size:11px;color:var(--muted);display:block}.kpi strong{font-size:23px;letter-spacing:-.6px;display:block;margin-top:4px}
.layout{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(310px,1fr);gap:20px;align-items:start}
.panel{background:#fff;border:1px solid var(--line);border-radius:12px;padding:22px 21px;margin-bottom:18px;box-shadow:0 6px 25px rgba(0,0,0,.02)}
.panelhead{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:20px}
.event{border-top:1px solid var(--line)}.event:last-child{border-bottom:1px solid var(--line)}
.event summary{list-style:none;cursor:pointer;padding:14px 1px}.event summary::-webkit-details-marker{display:none}
.event[open] summary{background:#fcfbfa}.event-head{display:flex;align-items:center;gap:11px}
.node{width:31px;height:31px;flex:0 0 31px;border-radius:9px;background:#f1efed;display:grid;place-items:center;font-size:11px;font-weight:750;color:#706b65}
.node.tool{background:#eaf2ee;color:#45755b}.event-main{flex:1;min-width:0}
.event-title{font-size:12px;font-weight:680}.subtext{font-size:11px;color:#a5a09a}.seq{font-size:10px;color:#a6a19b}.chevron{color:#b0aaa2}
.event[open] .chevron{transform:rotate(45deg)}.event-body{background:#fcfbf9;padding:10px 13px 14px;margin:0 0 8px 41px;border-radius:8px}
.fact{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;padding:7px 0;border-bottom:1px solid #f0eeec}.fact:last-child{border:0}
.fact span{font-size:11px;color:#918b85}.fact strong{font-size:11px;text-align:right;font-weight:560;max-width:65%;overflow-wrap:anywhere}
.judgment{padding:13px 0;border-top:1px solid var(--line)}
.judgment:first-of-type{border-top:0}.judge-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:5px}
.judgment p{font-size:11px;line-height:1.65;color:#88827c;margin:5px 0}
.status{font-size:9px;letter-spacing:.05em;background:#efedea;color:#77716a;border-radius:6px;padding:4px 6px;font-weight:780;white-space:nowrap}
.status.yes{background:#e8f4eb;color:#297546}.status.partial{background:#fff1df;color:#97672f}
.coach{padding:13px 0;border-top:1px solid var(--line)}.coach p{margin:6px 0;color:#817b74;font-size:12px}
.code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;background:#f6f5f2;border-radius:5px;padding:3px 5px;font-size:11px}
footer{border-top:1px solid var(--line);padding-top:20px;color:#a4a09b;font-size:11px;margin-top:30px}
@media(max-width:860px){.layout{grid-template-columns:1fr}main{padding:23px 15px}h1{font-size:29px}.kpis{grid-template-columns:repeat(2,1fr)}}
"""


def render(data: dict) -> str:
    if data.get("schema") != 1 or data.get("metadata", {}).get("source_kind") != "REAL_OPENCLAW_SQLITE":
        raise ValueError("Only allowlisted real-trace metadata can be rendered")
    m = data["metadata"]
    events = data.get("evidence", [])
    if not isinstance(events, list) or not events:
        raise ValueError("Trace events missing")

    kpis = (
        meta_chip("Tool calls actually recorded", m.get("tool_calls", 0)) +
        meta_chip("Matched tool results", m.get("tool_results", 0)) +
        meta_chip("Session transcript rows", m.get("persisted", {}).get("transcript_events", "UNKNOWN")) +
        meta_chip("Model", m.get("model", "UNKNOWN"))
    )
    timeline = "".join(item_view(e,i+1) for i,e in enumerate(events))
    judgment_html = ""
    for verdict in data.get("judgments", []):
        state=verdict.get("state","UNKNOWN")
        if state not in ALLOWED_VERDICTS: state="UNKNOWN"
        cls="yes" if state=="OBSERVED" else "partial" if state=="PARTIAL" else ""
        judgment_html += (
            '<div class="judgment"><div class="judge-head"><strong>' +
            esc(verdict.get("topic","Evidence")) + '</strong><span class="status ' +
            cls+'">'+esc(state)+'</span></div><p>'+esc(verdict.get("because",""))+'</p></div>'
        )
    coach = (
        ("**What counted as an actual Agent loop?**",
         "Recorded context submission, five tool calls, five tool results, and model completion. "
         "This is an observed execution, not a Python if/else that generates a draft."),
        ("**What was visible to the model?**",
         "We can see prompt/context compilation events and advertised tool names. The actual "
         "full prompt was not exported; the visible context field may be truncated. "
         "Tool calls demonstrate access to tools, not proof of a particular memory being loaded."),
        ("**What persists into the next run?**",
         "SQLite stores session transcript and event rows. A saved Session is not automatically "
         "a company-approved Strategy. We have no proof this run used long-term memory or compaction."),
        ("**What does InnoSage still need?**",
         "Verified Intake and channel metrics, permissioned Tool adapters, durable approved "
         "Decisions, and source-linked audience feedback. Those are product responsibilities above the Agent loop."),
    )
    coaches = "".join(
        '<div class="coach"><h3>'+esc(t.replace("**",""))+'</h3><p>'+esc(v)+'</p></div>'
        for t,v in coach
    )
    t0=events[0].get("at")
    t1=events[-1].get("at")
    duration = "UNKNOWN"
    try:
        duration = f"{(datetime.fromisoformat(t1.replace('Z','+00:00'))-datetime.fromisoformat(t0.replace('Z','+00:00'))).total_seconds():.1f} s"
    except (TypeError,ValueError,AttributeError):
        pass
    subtitle = ("Recorded run " + esc(m.get("run_ref_sha12")) +
                " · Session " + esc(m.get("session_ref_sha12")) +
                " · Elapsed " + duration)
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'none'">
<title>InnoSage · Agent X-Ray</title><style>{STYLE}</style></head>
<body><main><div class="top"><div class="brand"><span>I.</span> InnoSage Agent X-Ray</div>
<div><span class="chip">REAL HISTORICAL TRACE</span> <span class="chip">PRIVATE REPORT</span></div></div>
<div class="eyebrow">ISSUE #29 · READ-ONLY OPENCLAW EXECUTION</div>
<h1>See what an Agent actually did.</h1>
<p class="lead">{subtitle}. This page is generated from sanitized historical OpenClaw SQLite
events. Raw user prompts, tool arguments, results, and assistant messages are intentionally withheld.</p>
<div class="w"><strong>Evidence boundary:</strong> Not a Social Growth Loop run. This real
Agent trace shows execution mechanics, but does <strong>not</strong> establish persistent CMO strategy,
audience growth, actual memory retrieval, or context compaction. No live Agent ran to build this page.</div>
<div class="kpis">{kpis}</div><div class="layout"><div>
<section class="panel"><div class="panelhead"><div><div class="eyebrow">LIVE EXECUTION HISTORY</div>
<h2>Observed event timeline</h2></div><span class="chip">Click to expand each event</span></div>
{timeline}</section></div>
<aside><section class="panel"><div class="eyebrow">EVIDENCE COVERAGE</div>
<h2>What we can actually claim</h2>{judgment_html}</section>
<section class="panel"><div class="eyebrow">AGENT COACH</div>
<h2>Four things to understand</h2>{coaches}</section>
<section class="panel"><div class="eyebrow">PROVENANCE</div><h2>Reproducible, without raw data</h2>
<div class="fact"><span>Source</span><strong>{esc(m.get("source_database"))}</strong></div>
<div class="fact"><span>Session ref (SHA prefix)</span><strong>{esc(m.get("session_ref_sha12"))}</strong></div>
<div class="fact"><span>Run ref (SHA prefix)</span><strong>{esc(m.get("run_ref_sha12"))}</strong></div>
<div class="fact"><span>Provider</span><strong>{esc(m.get("provider"))}</strong></div>
<div class="fact"><span>Transcript events</span><strong>{esc(m.get("persisted",{}).get("transcript_events"))}</strong></div>
<p class="subtext">Event evidence pointers are DB sequence numbers. Hash prefixes are not source credentials.</p>
</section></aside></div>
<footer>InnoSage Labs · P0 Agent X-Ray · Model calls: NONE during this inspection ·
No raw private sessions copied to public GitHub · No Codex or Codex CLI executed</footer></main></body></html>"""


def main():
    if len(sys.argv) != 3:
        raise SystemExit("usage: python3 render.py SANITIZED_JSON OUTPUT_HTML")
    src, output = map(Path, sys.argv[1:])
    data=json.loads(src.read_text(encoding="utf-8"))
    output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(render(data),encoding="utf-8")
    output.chmod(0o600)
    print("PRIVATE_HTML_WRITTEN",output,"bytes",output.stat().st_size)


if __name__=="__main__":
    main()
