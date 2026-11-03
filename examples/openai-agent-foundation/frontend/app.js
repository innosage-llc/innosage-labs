/* Minimal first-party browser UI. No analytics, external scripts, or credentials in URLs. */
"use strict";

let token=sessionStorage.getItem("foundation_token")||"";
let dashboard=null;
let status=null;
let isBusy=false;
let toastTimer;
const $=id=>document.getElementById(id);
const esc=v=>String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;")
    .replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;");
const asArray=v=>Array.isArray(v)?v:[];
const fmt=v=>Number.isFinite(v)?v.toLocaleString("en-US"):"—";
const at=(arr,id)=>asArray(arr).find(x=>x.id===id);
const ago=t=>t?new Date(t).toLocaleString("zh-CN",{hour12:false}):"";
const tag=(value,kind="")=>'<span class="pill '+(kind==="good"?"pill-green":kind==="warn"?"pill-orange":"pill-muted")+'">'+esc(value)+'</span>';

async function api(path,method="GET",data){
  const opts={method,headers:{"Accept":"application/json"}};
  if(token)opts.headers["Authorization"]="Bearer "+token;
  if(data!==undefined){opts.headers["Content-Type"]="application/json";opts.body=JSON.stringify(data);}
  const response=await fetch(path,opts);
  let payload;
  try{payload=await response.json();}catch{payload={detail:"Unexpected server response"};}
  if(response.status===401){showLogin("Token is missing or invalid");throw Error("Authentication required");}
  if(!response.ok)throw Error(payload.detail||"Request failed");
  return payload;
}
function toast(message,isError=false){
  const el=$("toast");el.textContent=message;el.className="visible"+(isError?" error":"");
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.className="",4400);
}
function showLogin(error=""){$("login").classList.remove("hidden");$("login-error").textContent=error;$("token").focus();}
function hideLogin(){$("login").classList.add("hidden");$("login-error").textContent="";}
async function refresh(){
  status=await api("/api/status");
  dashboard=await api("/api/dashboard");
  $("connection").className="connection online";
  $("connection").textContent="Mac Studio · Connected";
  hideLogin();render();
}
function button(text,action,id="",cls="btn-outline",disabled=false){
  return '<button class="btn '+cls+'" data-action="'+esc(action)+'" data-id="'+esc(id)+'"'+
    (disabled?' disabled aria-disabled="true"':"")+">"+esc(text)+"</button>";
}
function render(){
  const d=dashboard;
  const rounds=asArray(d.rounds).sort((a,b)=>a.number-b.number);
  const tasks=asArray(d.tasks);
  const feedback=asArray(d.feedback);
  const approval1=at(d.approvals,"approval-run-01");
  const publication=at(d.publications,"publication-run-01");
  const proposal=asArray(d.revisions)[0];
  $("m-runs").textContent=fmt(rounds.length);
  $("m-tasks").textContent=fmt(tasks.length);
  $("m-feedback").textContent=fmt(feedback.length);
  const probes=asArray(d.sdk_probes);
  $("m-model").textContent=fmt(probes.reduce((sum,p)=>sum+(p.usage?.requests||0)+(p.resume_usage?.requests||0),0));
  const steps=[
    {num:"01",name:"Load Intake",help:"加载合成经营背景与已批准策略",
     done:!!d.scenario,active:!d.scenario,action:"load",label:"Load sample scenario",enabled:!d.scenario},
    {num:"02",name:"CMO Run 1",help:"记录第一份来源可追溯的 Decision Card",
     done:!!rounds[0],active:!!d.scenario&&!rounds[0],
     action:"round",label:"Start Growth Loop",enabled:!!d.scenario&&!rounds[0]},
    {num:"03",name:"Founder review",help:"CMO 委派 Editor，并批准内部草稿",
     done:approval1?.status==="APPROVED_INTERNAL",
     active:!!approval1&&approval1.status==="PENDING",
     action:"approve",id:"approval-run-01",label:"Approve internal draft",
     enabled:approval1?.status==="PENDING"},
    {num:"04",name:"Simulate publish",help:"只产生 MOCK 回执，不调用真实平台",
     done:!!publication,active:approval1?.status==="APPROVED_INTERNAL"&&!publication,
     action:"publish",id:"run-01",label:"Simulate publication",
     enabled:approval1?.status==="APPROVED_INTERNAL"&&!publication},
    {num:"05",name:"Audience feedback",help:"导入有时间窗和评论的模拟互动记录",
     done:feedback.length>0,active:!!publication&&!feedback.length,
     action:"feedback",label:"Import feedback",enabled:!!publication&&!feedback.length},
    {num:"06",name:"CMO Run 2",help:"比较第一轮预测与反馈，重新做决策",
     done:!!rounds[1],active:feedback.length>0&&!rounds[1],
     action:"round",label:"Run next loop",enabled:feedback.length>0&&!rounds[1]},
    {num:"07",name:"Strategy gate",help:"只有 Founder 可批准对正式策略的修订",
     done:!!proposal&&proposal.status!=="PENDING",
     active:!!proposal&&proposal.status==="PENDING",
     action:"scrollInbox",id:proposal?.id||"",label:"Review proposal",
     enabled:!!proposal&&proposal.status==="PENDING"},
  ];
  $("steps").innerHTML=steps.map(s=>
    '<article class="step '+(s.done?"done":s.active?"current":"")+'">'+
    '<div class="step-number">'+esc(s.num)+(s.done?" · COMPLETE":"")+'</div>'+
    '<div class="step-title">'+esc(s.name)+'</div>'+
    '<p class="step-desc">'+esc(s.help)+'</p>'+
    (s.done?tag("Verified fixture path","good"):button(s.label,s.action,s.id||"",
        s.active?"":"btn-outline",!s.enabled||isBusy))+"</article>").join("");
  $("bots-list").innerHTML=asArray(d.bots).length?asArray(d.bots).map(bot=>
    '<div class="bot"><div class="bot-head"><div class="bot-icon">'+
    (bot.id==="cmo"?"♞":"✎")+'</div><div><div class="bot-title">'+esc(bot.name)+
    '</div><div class="bot-role">'+esc(bot.role)+'</div></div></div>'+
    '<span class="bot-state">'+esc(bot.status)+'</span>'+
    '<div class="mini-note">Own session: '+esc(bot.session_id)+
    '<br>Fixture tools: read-only and internal draft</div></div>').join("")
    :'<div class="empty">Bot identities become available after loading the scenario.</div>';
  $("round-list").innerHTML=rounds.length?rounds.map(run=>{
    const artifact=at(d.artifacts,"artifact-"+run.id);
    const dec=run.decision;
    return '<div class="round-card"><div class="round-top"><strong>RUN '+
      esc(run.number).toString().padStart(2,"0")+' · AI CMO</strong>'+
      tag(dec.outcome,dec.outcome==="ADJUST"?"warn":"good")+'</div>'+
      '<h4>'+esc(dec.next_action)+'</h4>'+
      '<p><strong>Decision basis:</strong> '+esc(dec.reason)+'</p>'+
      '<p><strong>Falsifier:</strong> '+esc(dec.falsifier)+'</p>'+
      (run.baseline_next_action?'<div class="notice-inline"><strong>Previous baseline:</strong> '+
      esc(run.baseline_next_action)+'<br><strong>Changed:</strong> '+
      (run.changed_from_prior?"Yes":"No — evidence-led unchanged")+'</div>':"")+
      '<div class="round-source">'+asArray(dec.source_ids).map(src=>'<span class="source">'+esc(src)+'</span>').join("")+'</div>'+
      (artifact?'<div class="artifact"><div class="eyebrow">EDITOR OUTPUT · SYNTHETIC DRAFT</div>'+
      '<strong>'+esc(artifact.title)+'</strong><p>'+esc(artifact.caption)+'</p>'+
      tag("Never publishable")+'</div>':"")+
      '<div class="run-foot"><small>'+esc(run.mode)+' · '+esc(ago(run.created_at))+
      '</small>'+tag(run.status)+'</div></div>';
  }).join(""):'<div class="empty">First load a synthetic scenario, then start a CMO run.</div>';
  const needs=asArray(d.approvals).filter(a=>a.status==="PENDING");
  const needsStrategy=asArray(d.revisions).filter(r=>r.status==="PENDING");
  const pendingSdk=probes.find(p=>p.status==="WAITING_FOR_HUMAN");
  $("inbox-list").innerHTML=(!needs.length&&!needsStrategy.length&&!pendingSdk)?
    '<div class="empty">No pending decisions. Approved choices are preserved in SQLite.</div>':
    needs.map(a=>
      '<div class="inbox-item"><div class="inbox-title">Editor · '+esc(a.run_id)+'</div>'+
      '<p class="inbox-text">Approve internal simulation draft only. No public platform action.</p>'+
      '<div class="button-row">'+button("Approve","approve",a.id,"btn-success")+
      button("Reject","reject",a.id,"btn-decline")+'</div></div>').join("")+
    needsStrategy.map(p=>
      '<div class="inbox-item"><div class="inbox-title">CMO · Strategy proposal</div>'+
      '<p class="inbox-text">'+esc(p.proposal)+'</p><div class="button-row">'+
      button("Accept","strategyApprove",p.id,"btn-success")+
      button("Reject","strategyReject",p.id,"btn-decline")+'</div></div>').join("")+
    (pendingSdk?'<div class="inbox-item"><div class="inbox-title">LIVE SDK · Delegated Editor</div>'+
      '<p class="inbox-text">Real model only uses synthetic data. Approving runs the gated Editor tool, not a social action.</p><div class="button-row">'+
      button("Approve SDK tool","sdkApprove",pendingSdk.id,"btn-success")+
      button("Reject SDK tool","sdkReject",pendingSdk.id,"btn-decline")+'</div></div>':"");
  $("source-list").innerHTML=!d.scenario?'<div class="empty">No sources loaded.</div>':
      '<div class="detailrow"><span>Experiment</span><strong>'+esc(d.scenario.active_experiment)+'</strong></div>'+
      '<div class="detailrow"><span>Strategy</span><strong>v'+esc(d.strategy.version)+' · Approved</strong></div>'+
      '<div class="detailrow"><span>Intake</span><strong>Candidate · NOT approved</strong></div>'+
      '<div class="detailrow"><span>Audience data</span><strong>'+esc(feedback.length?'Synthetic observation':'Not imported')+'</strong></div>'+
      '<p class="mini-note">The original source, policy and consent status remain separate from agent messages or compacted context.</p>';
  $("events-list").innerHTML=asArray(d.events).length?
    asArray(d.events).slice(0,17).map(ev=>
    '<div class="event"><div class="event-label">'+esc(ev.type)+'</div>'+
    '<div class="event-sub">'+esc(ev.actor)+' · '+esc(ago(ev.timestamp))+
    ' · '+esc(ev.object_id)+'</div></div>').join(""):
    '<div class="empty">No recorded operations yet.</div>';
  let learning;
  if(rounds.length>=2){
    const before=rounds[0].decision;
    const after=rounds[1].decision;
    const used=after.feedback_summary;
    learning='<div class="difference">'+
      '<div><strong>RUN 01 · Before feedback</strong><p>'+esc(before.next_action)+'</p></div>'+
      '<div><strong>RUN 02 · After evidence</strong><p>'+esc(after.next_action)+'</p></div></div>'+
      '<p class="why">'+esc(after.reason)+'</p>'+
      '<div class="detailrow"><span>Evidence used</span><strong>'+esc(used?.id||"NONE")+'</strong></div>'+
      '<div class="detailrow"><span>Save rate</span><strong>'+
        esc(used?.save_rate===null?"UNKNOWN":(used.save_rate*100).toFixed(2)+"%")+
        ' (synthetic)</strong></div>'+
      '<div class="detailrow"><span>Accepted strategy</span><strong>Version '+esc(d.strategy.version)+'</strong></div>';
    if(proposal) learning+='<div class="notice-inline"><strong>PROPOSED, NOT AUTOMATICALLY ACCEPTED</strong><br>'+
      esc(proposal.proposal)+'<br>Review: '+esc(proposal.status)+'</div>';
    if(rounds.length>=3)learning+='<p class="mini-note">Run 3 consumed approved policy v'+
      esc(rounds[2].decision.strategy_version)+'.</p>';
  }else{
    learning='<div class="empty">Import audience feedback and complete Run 2 to inspect the evidence-driven difference.</div>';
  }
  $("learning-content").innerHTML=learning;
  const sdk=status?.sdk||{};
  const diagnostics=[
    ["Execution", "Local Mac Studio (Python)"],
    ["Business DB", "Independent SQLite #27"],
    ["SDK installed", sdk.sdk_installed?"YES":"NO"],
    ["Billable probe",sdk.billable_probe_enabled?"ENABLED":"BLOCKED · approval required"],
    ["API key",sdk.model_key_configured?"Configured":"Not configured"],
    ["Live reasoning",sdk.real_sdk_reasoning_verified?"PASS":"NOT VERIFIED"],
  ];
  $("diagnostics").innerHTML=diagnostics.map(([key,value])=>
    '<div class="diag-item"><span>'+esc(key)+'</span><strong>'+esc(value)+'</strong></div>').join("");
  if(sdk.billable_probe_enabled&&sdk.model_key_configured&&!probes.length&&!$("live-probe-button")){
    $("diagnostics").insertAdjacentHTML("afterend",
      '<div class="toolbar" id="live-probe-button">'+button("Run one authorized SDK probe","probe","","btn-outline")+'</div>');
  }
}
async function action(name,id=""){
  if(isBusy)return;isBusy=true;
  document.body.classList.add("loading");
  try{
    switch(name){
      case "load":await api("/api/scenario/load","POST");break;
      case "round":await api("/api/rounds","POST");break;
      case "approve":await api("/api/approvals/"+encodeURIComponent(id)+"/review","POST",{approve:true});break;
      case "reject":await api("/api/approvals/"+encodeURIComponent(id)+"/review","POST",{approve:false});break;
      case "publish":await api("/api/publications/"+encodeURIComponent(id)+"/simulate","POST");break;
      case "feedback":await api("/api/feedback/import","POST",{run_id:"run-01",fixture:"weak"});break;
      case "scrollInbox":$("inbox").scrollIntoView({behavior:"smooth",block:"start"});return;
      case "strategyApprove":await api("/api/revisions/"+encodeURIComponent(id)+"/review","POST",{approve:true});break;
      case "strategyReject":await api("/api/revisions/"+encodeURIComponent(id)+"/review","POST",{approve:false});break;
      case "counterfactual":showInspection(await api("/api/counterfactual"));break;
      case "projection":showInspection(await api("/api/context/projection"));break;
      case "reset":
        if(!confirm("Reset ONLY the #27 synthetic data? All synthetic runs/approvals will be cleared."))return;
        await api("/api/scenario/reset","POST",{confirmation:"RESET_SYNTHETIC"});break;
      case "probe":showInspection(await api("/api/harness/probe","POST"));await refresh();break;
      case "sdkApprove":await api("/api/harness/probe/"+encodeURIComponent(id)+"/review","POST",{approve:true});break;
      case "sdkReject":await api("/api/harness/probe/"+encodeURIComponent(id)+"/review","POST",{approve:false});break;
      default:throw Error("Unknown action: "+name);
    }
    if(name!=="counterfactual"&&name!=="projection"&&name!=="probe"){
      await refresh();toast("Saved to the independent #27 workspace");
    }
  }catch(error){toast(error.message||String(error),true);}
  finally{isBusy=false;document.body.classList.remove("loading");render();}
}
function showInspection(payload){
  const out=$("inspect-output");out.hidden=false;
  out.textContent=JSON.stringify(payload,null,2);
  out.scrollIntoView({behavior:"smooth",block:"nearest"});
  toast("Inspection is visible below Harness & recovery");
}
async function init(){
  document.addEventListener("click",event=>{
    const btn=event.target.closest("[data-action]");
    if(btn&&!btn.disabled){event.preventDefault();void action(btn.dataset.action,btn.dataset.id||"");}
    if(event.target.closest(".side-nav a")){
      document.querySelectorAll(".side-nav a").forEach(a=>a.classList.remove("active"));
      event.target.closest(".side-nav a").classList.add("active");
    }
  });
  $("login-submit").addEventListener("click",async()=>{
    token=$("token").value.trim();sessionStorage.setItem("foundation_token",token);
    try{await refresh();toast("Connected to Mac Studio");}
    catch(err){$("login-error").textContent=err.message;}
  });
  $("token").addEventListener("keydown",e=>{
    if(e.key==="Enter")$("login-submit").click();
  });
  if(!token){showLogin();return;}
  try{await refresh();}catch(err){showLogin(err.message);}
}
void init();
