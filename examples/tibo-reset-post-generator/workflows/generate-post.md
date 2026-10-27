# Generate a reset post — human-facing entry point

This is a **launch checklist**, not a second Skill specification. The single source of truth for the agent's behavior is [`SKILL.md`](../.agents/skills/tibo-reset-post-generator/SKILL.md), plus the two reference files inside its folder.

## Option A — ChatGPT Web, with no Skill installed

1. Open a new ChatGPT conversation with image-generation/editing capability.
2. Upload **your own** original Tibo post screenshot or paste his exact post text (or give the public X URL); optionally upload a base poster that you can reuse.
3. Make the Skill instructions available:
   - Preferred: attach [`SKILL.md`](../.agents/skills/tibo-reset-post-generator/SKILL.md), [`evidence-rules.md`](../.agents/skills/tibo-reset-post-generator/references/evidence-rules.md), and [`poster-style.md`](../.agents/skills/tibo-reset-post-generator/references/poster-style.md).
   - Or explicitly ask ChatGPT to read these files from the public GitHub project; **verify it actually reads them**. If URL access fails, upload them instead.
4. Paste this request (replace bracketed parts):

```text
Use the attached / successfully read Tibo Reset Post Generator SKILL.md and its
references. Source: [POST LINK, SCREENSHOT, OR EXACT QUOTE].
Base poster: [ATTACHED AUTHORISED IMAGE, OR "none"].
Platform: Xiaohongshu. Language: Simplified Chinese.

Return a short evidence/uncertainty ledger, one ACTUAL 3:4 PNG or JPEG poster,
and a concise Chinese caption. Preserve source-versus-inference distinctions.
Never invent a reset time from the post display clock. If image rendering is
not available, mark the result INCOMPLETE; don't give only a design brief and
claim success. Stop before publishing anywhere.
```

5. Inspect the output. If the model cannot read `SKILL.md` and both references, treat this attempt as **not skill-driven**. Upload the files and retry rather than assuming compliance.

## Option B — Installed ChatGPT Skill (eligible account)

Go to **Plugins → Skills**; install/upload this project's self-contained `.agents/skills/tibo-reset-post-generator/` directory using the supported skill-upload flow. Exact workspace entitlements and upload formats may vary. Confirm the skill is visible before invoking it using `@` or selecting it. Then send the source post and permitted base image. Check that a real image was produced.

## Option C — Codex / agent with a local repo

Run from the project directory, **not** the Labs root. Invoke `$tibo-reset-post-generator` or choose it via `/skills`, supplying the post evidence and an authorized base image. If that agent has no image renderer, stop at `INCOMPLETE` with a handoff for Web; don't claim the required PNG was made.

## Quality gate (manual, before you post)

- Source identified; claim versus independent observation distinguished.
- Original displayed clock was **not** automatically interpreted as Beijing time.
- A rendered **3:4** poster exists, Chinese text is legible, margins not cut off.
- Caption does not claim all users/plans received a reset.
- Source attribution and caveat remain on poster or caption.
- Nothing has been auto-published.

For edge cases and expected behavior see the [synthetic sample](../.agents/skills/tibo-reset-post-generator/examples/sample-case.md).
