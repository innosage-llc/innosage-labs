# Agent X-Ray — read-only OpenClaw historical Run Inspector

**Issue #29: https://github.com/innosage-llc/innosage-labs/issues/29**

The Founder rejected the synthetic click-through of #27 because it did not
show a real Agent. This small Example reconstructs one ACTUAL historical
OpenClaw run from persisted agent-local SQLite metadata and makes it
browser-viewable. It does not execute an Agent, model API call, Codex,
Codex CLI, or any social platform action.

## Observed run (October 2026)

- One recorded context compilation and model prompt submission
- Five recorded tool calls and results: browser open, get title,
  browser close, skills_read and web_fetch
- One recorded model completion and usage receipt, followed by success
- Existing SQLite transcript persistence, separate from one model turn

**Not observed:** long-term memory retrieval, compaction, approved business
strategy, real social publication or audience growth. Prompt contents,
tool arguments, tool result bodies and assistant messages are withheld.
The trace is incomplete model context, not hidden model reasoning.

## Security & isolation

Only sanitized event names, times, sequence numbers, tool names,
argument FIELD NAMES, success flags, lengths, and numeric usage escape
the OpenClaw read-only inspection. The raw SQLite database never leaves
the OpenClaw container. Report JSON/HTML and screenshot are ignored in
the Example's .local-run directory, never in the public PR.

No service restart, runtime changes, system access expansion, credentials,
new server, public endpoint, or #11/#27 source modification.

## Reproduce as operator on Mac Studio

Use your existing private session/run ID prefixes. This snippet is
read-only and outputs ONLY allowlisted metadata:

    cd examples/agent-run-inspector
    umask 077
    mkdir -p .local-run
    cat scripts/export-openclaw.cjs |
      docker exec -i -e EXPORT_TRACE=1 \
        -e TRACE_SESSION_PREFIX=<SESSION_ID_PREFIX> \
        -e TRACE_RUN_PREFIX=<RUN_ID_PREFIX> \
        innosage-openclaw-openclaw-gateway-1 node - \
      > .local-run/sanitized-run.json

    python3 scripts/render.py .local-run/sanitized-run.json \
      .local-run/agent-run.html

The actual session IDs are omitted from this PUBLIC README. The private
HTML file is fully standalone: it makes no network calls and requires
no browser extension or backend token.

## Open report on authorized MacBook

Copy ONLY the sanitized HTML file with existing authorized Mac Studio
SCP (substitute the SSH host and isolated worktree path):

    scp <MAC_STUDIO_SSH_HOST>:<ISSUE_29_WORKTREE>/examples/agent-run-inspector/.local-run/agent-run.html \
      ~/Downloads/innosage-agent-xray.html
    open ~/Downloads/innosage-agent-xray.html

Click a Tool Call, then its Tool Result; compare the hashed call reference
and actual sequence IDs. Look at model usage and the Evidence Coverage
panel for claims that cannot be made from these traces.

## Run privacy tests

    node --test tests/export.test.cjs
    python3 -m unittest discover -s tests -p 'test_*.py' -v

No extra Python packages. Node must have built-in node:sqlite support.

## Coaching questions

1. Which events prove a real Agent invoked tools, unlike the scripted #27?
2. Why do some context fields show tiny text lengths while usage includes
   thousands of cached and input tokens? Can we claim full context?
3. Does persistence of a Session transcript prove approved strategy or
   learning from a real Xiaohongshu audience? What business records are
   still missing?

This is a learning and observability MVP, not a Social Growth Loop product.
