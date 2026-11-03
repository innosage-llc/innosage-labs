"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {sanitizeEvent,safeName}=require("../scripts/export-openclaw.cjs");

test("tool arguments, raw URLs, tokens and outputs never leave sanitizer",()=>{
  const raw={type:"tool.call",ts:"2026-10-13T09:42:01Z",data:{
    name:"web_fetch",toolCallId:"PRIVATE-SESSION-CALL-REF",
    arguments:{url:"https://private.example/path?token=SECRET123",
               Authorization:"Bearer PRIVATE_SECRET",cookie:"private-cookie"}
  }};
  const text=JSON.stringify(sanitizeEvent(raw,19));
  for(const forbidden of ["PRIVATE_SECRET","private.example","SECRET123","private-cookie","PRIVATE-SESSION-CALL-REF"]){
    assert.ok(!text.includes(forbidden),forbidden);
  }
  assert.equal(JSON.parse(text).tool,"web_fetch");
  assert.equal(JSON.parse(text).arguments,"WITHHELD");
});

test("model answer and context content are never exported",()=>{
  const secret="PRIVATE_BUSINESS_STRATEGY_DO_NOT_EXPORT";
  const ctx=sanitizeEvent({type:"context.compiled",ts:"2026-10-13T09:42:00Z",
    data:{systemPrompt:secret,prompt:secret,
          tools:[{name:"skills_read",description:secret},"[Truncated]"]}},20);
  const model=sanitizeEvent({type:"model.completed",ts:"2026-10-13T09:42:07Z",
    data:{assistantTexts:[secret],usage:{input:100,output:23,cacheRead:200,total:323},
          messagesSnapshot:[{content:secret}]}},21);
  assert.ok(!JSON.stringify(ctx).includes(secret));
  assert.ok(!JSON.stringify(model).includes(secret));
  assert.equal(ctx.system_prompt_chars,secret.length);
  assert.equal(model.usage.cacheRead,200);
  assert.equal(model.assistant_text_chars,secret.length);
});

test("unexpected names and unknown event types do not leak",()=>{
  assert.equal(safeName("x<script>"),"redacted");
  assert.equal(sanitizeEvent({type:"private.secret",data:{key:"x"}},2),null);
});
