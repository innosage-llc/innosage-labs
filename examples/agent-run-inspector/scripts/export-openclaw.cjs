"use strict";
/**
 * Extract only allowlisted metadata from an existing OpenClaw SQLite trace.
 * Execute read-only inside its Docker container via stdin, not by installing code
 * or altering the container. NEVER export prompts, results or tool arguments.
 */
const { DatabaseSync } = require("node:sqlite");
const crypto = require("node:crypto");
const DB = "/home/node/.openclaw/agents/main/agent/openclaw-agent.sqlite";
const KINDS = new Set([
  "session.started", "context.compiled", "prompt.submitted", "tool.call",
  "tool.result", "model.completed", "session.ended"
]);
const safeName = (x) => typeof x === "string" && /^[a-z][a-z0-9_]{0,48}$/.test(x)
  ? x : "redacted";
const shortHash = (x) => crypto.createHash("sha256").update(String(x)).digest("hex").slice(0,12);
const asNum = (x) => typeof x === "number" && Number.isFinite(x) && x >= 0 ? x : null;

function sanitizeEvent(raw, sourceSeq) {
  if (!raw || !KINDS.has(raw.type)) return null;
  const d = raw.data && typeof raw.data === "object" ? raw.data : {};
  const item = {
    type: raw.type, seq: sourceSeq,
    at: /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.test(raw.ts || "") ? raw.ts : null,
    evidence: "trajectory_runtime_events:seq=" + sourceSeq,
    observed: true
  };
  switch (raw.type) {
    case "session.started":
      item.advertised_tool_count = asNum(d.toolCount);
      break;
    case "context.compiled":
      item.system_prompt_chars = typeof d.systemPrompt === "string" ? d.systemPrompt.length : null;
      item.context_prompt_chars = typeof d.prompt === "string" ? d.prompt.length : null;
      item.tools_advertised = Array.isArray(d.tools)
        ? d.tools.map(t => safeName(typeof t === "object" && t ? (t.name || t.function?.name) : t)).filter(x=>x!=="redacted").slice(0,18)
        : [];
      item.tools_list_truncated = Array.isArray(d.tools) && d.tools.some(x=>typeof x==="string"&&x.startsWith("[Truncated"));
      break;
    case "prompt.submitted":
      item.input_present = Object.prototype.hasOwnProperty.call(d,"prompt");
      item.prompt_content = "WITHHELD";
      break;
    case "tool.call":
      item.tool = safeName(d.name);
      item.argument_fields = d.arguments && typeof d.arguments === "object"
        ? Object.keys(d.arguments).filter(k=>/^[a-z][a-zA-Z0-9_]{0,24}$/.test(k)).slice(0,8)
        : [];
      item.arguments = "WITHHELD";
      item.call_ref = shortHash(d.toolCallId || sourceSeq);
      break;
    case "tool.result":
      item.tool = safeName(d.name);
      item.success = typeof d.success === "boolean" ? d.success : null;
      item.result_content_items = Array.isArray(d.contentItems) ? d.contentItems.length : null;
      item.result_body = "WITHHELD";
      item.call_ref = shortHash(d.toolCallId || sourceSeq);
      break;
    case "model.completed":
      item.timed_out = !!d.timedOut;
      item.assistant_text_segments = Array.isArray(d.assistantTexts) ? d.assistantTexts.length : null;
      item.assistant_text_chars = Array.isArray(d.assistantTexts)
        ? d.assistantTexts.reduce((n,t)=>n+String(t).length,0) : null;
      item.final_text = "WITHHELD";
      item.usage = {};
      for (const k of ["input","output","cacheRead","cacheWrite","reasoningTokens","total"]) {
        const v = asNum(d.usage?.[k]);if (v !== null) item.usage[k] = v;
      }
      break;
    case "session.ended":
      item.status = ["success","completed","error","failed","cancelled"].includes(d.status)
        ? d.status : "UNKNOWN";
      break;
  }
  return item;
}

function select(db, sessionPrefix, runPrefix) {
  if (!/^[a-f0-9-]{6,36}$/i.test(sessionPrefix || ""))
    throw new Error("Specify a nonempty hexadecimal session ID prefix");
  const sessions = db.prepare("SELECT session_id, model_provider, model, status FROM session_windows WHERE session_id LIKE ? LIMIT 2").all(sessionPrefix + "%");
  if (sessions.length !== 1) throw new Error("Session ID prefix is missing or ambiguous");
  const session = sessions[0];
  const rows = db.prepare("SELECT seq, event_json FROM trajectory_runtime_events WHERE session_id=? ORDER BY seq").all(session.session_id);
  const grouped = new Map();
  for (const row of rows) {
    let evt;try{evt=JSON.parse(row.event_json)}catch{continue}
    if (!evt || !evt.runId || !KINDS.has(evt.type)) continue;
    const set = grouped.get(evt.runId) || [];
    set.push({seq:row.seq, evt});
    grouped.set(evt.runId,set);
  }
  const candidates = [...grouped.entries()].filter(([id,events])=>
    (!runPrefix || id.startsWith(runPrefix)) &&
    events.some(x=>x.evt.type==="model.completed") &&
    events.some(x=>x.evt.type==="session.ended"));
  if (!candidates.length) throw new Error("No complete recorded model turn found");
  // Prefer a compact, successful run with several different actual tools.
  candidates.sort((a,b)=>{
    const score=entries=>{
      let count=entries.filter(x=>x.evt.type==="tool.call").length;
      let ok=entries.some(x=>x.evt.type==="session.ended" && x.evt.data?.status==="success");
      return (ok?100:0) + (count>=3&&count<=8?30:0)+Math.min(count,8);
    };
    return score(b[1])-score(a[1]) || a[1][0].seq-b[1][0].seq;
  });
  const [runId,chosen]=candidates[0];
  const events=chosen.map(x=>sanitizeEvent(x.evt,x.seq)).filter(Boolean);
  const getCount=(table,sql)=>{
    try{return Number(db.prepare(sql).get(session.session_id).n)}catch{return null}
  };
  const persisted={
    transcript_events:getCount("transcript_events","SELECT count(*) AS n FROM transcript_events WHERE session_id=?"),
    active_transcript_events:getCount("session_transcript_active_events","SELECT count(*) AS n FROM session_transcript_active_events WHERE session_id=?"),
    runtime_trace_events:getCount("trajectory_runtime_events","SELECT count(*) AS n FROM trajectory_runtime_events WHERE session_id=?"),
  };
  return {
    schema:1,
    metadata:{
      source_kind:"REAL_OPENCLAW_SQLITE",
      source_database:"OpenClaw agent-local SQLite (read-only; host path withheld)",
      session_ref_sha12:shortHash(session.session_id),
      run_ref_sha12:shortHash(runId),
      provider:safeName(session.model_provider),
      model:typeof session.model === "string" && /^[a-zA-Z0-9_.-]{2,32}$/.test(session.model)?session.model:"withheld",
      selected_run_events:events.length,
      tool_calls:events.filter(e=>e.type==="tool.call").length,
      tool_results:events.filter(e=>e.type==="tool.result").length,
      persisted
    },
    evidence:events,
    judgments:[
      {topic:"Model-associated tool execution",state:"OBSERVED",because:"Recorded tool.call + matched tool.result events with sequence IDs."},
      {topic:"Input and compiled context",state:"PARTIAL",because:"Prompt/context events exist, but actual contents are withheld; some tools were truncated and the trace may not include the complete model context."},
      {topic:"Session transcript persistence",state:"OBSERVED",because:"Transcript and runtime event rows exist in persistent agent SQLite."},
      {topic:"Long-term memory actually consulted",state:"NOT OBSERVED",because:"No verified memory retrieval in this selected run."},
      {topic:"Context compaction performed",state:"NOT OBSERVED",because:"No compaction event or before/after state proven for this run."},
      {topic:"Company strategy decision saved",state:"NOT OBSERVED",because:"A completed model response is not a durable approved business decision."}
    ]
  };
}

if (require.main === module || process.env.EXPORT_TRACE === "1") {
  try {
    const db = new DatabaseSync(DB,{readOnly:true});
    const result = select(db,process.env.TRACE_SESSION_PREFIX||"",process.env.TRACE_RUN_PREFIX||"");
    db.close();
    process.stdout.write(JSON.stringify(result)+"\n");
  }catch(err){console.error("SANITIZED_EXPORT_ERROR:",err.message);process.exitCode=2}
}
module.exports={sanitizeEvent,select,safeName};
