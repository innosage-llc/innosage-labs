# Agent Coach — what a real OpenClaw trace teaches

## Session versus Run
The existing OpenClaw Session had 232 persisted transcript events.
The selected Run is only a 15-event slice. Session history is NOT the
same thing as one model context window, a business Task, or a Strategy.

## Context versus Memory
Observed context.compiled and prompt.submitted; some tool names and
short prompt fields (36 characters in two event fields) were visible.
The model usage receipt recorded 1,665 fresh input tokens,
18,176 cache-read tokens, 61 output, and 19,902 total tokens.
Do not infer that the 36-character excerpt reconstructs full context.
Memory use and compaction for this Run were NOT OBSERVED.

## Actual Tool Loop
The record shows five real Tool Calls with matching successful results:
browser open, get page title, close, skills_read, web_fetch.
It proves observable model-associated tool execution; it cannot reveal
the model's hidden thoughts or establish its precise motivation.

## Persisted company knowledge
Transcript persistence is OBSERVED. An approved CMO strategy, real
Xiaohongshu publication, audience evidence, and model memory recall
are NOT OBSERVED in this run. These need separate trustworthy
business records and permission boundaries.

## Three questions for Founder
1. What makes this run more meaningful than the seven scripted buttons?
2. Did it retrieve Memory or compact Context? What would count as proof?
3. Where must approved Strategy and audience feedback be stored so a
   different Agent/Session can use them without inventing facts?

## Mapping toward final product
Source-aware Intake -> allowed evidence retrieval -> Agent reasoning/tools
-> source-grounded Decision -> Founder review -> publication handoff ->
actual channel measurement -> next CMO run retrieves prior results ->
adjust or defend the strategy. Existing Agent Harness does tool execution;
InnoSage must own its business trust and learning loop.
