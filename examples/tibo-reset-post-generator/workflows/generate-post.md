# Generate a Tibo reset post — edit the existing example

**Default:** use the [published example base poster](../assets/codex-10-26极简重置更新公告海报.png), preserve its original OpenAI/Codex logo, Tibo profile photo, handle, layout and red rule, and change only factual text. The single canonical execution contract is [`SKILL.md`](../.agents/skills/tibo-reset-post-generator/SKILL.md) with its [evidence](../.agents/skills/tibo-reset-post-generator/references/evidence-rules.md) and [poster](../.agents/skills/tibo-reset-post-generator/references/poster-style.md) references.

## Preferred reproducible path (local Python, no backend)

From a clean Git checkout with Python 3, Pillow and an installed CJK font:

```sh
python3 examples/tibo-reset-post-generator/build_skill.py --out /tmp/tibo-reset-post-generator.zip
python3 examples/tibo-reset-post-generator/.agents/skills/tibo-reset-post-generator/scripts/render_poster.py \
  --input examples/tibo-reset-post-generator/.agents/skills/tibo-reset-post-generator/examples/deterministic-input.json \
  --out-dir /tmp/tibo-render
python3 -m unittest discover -s examples/tibo-reset-post-generator/tests -v
```

Use the fictional JSON only as a smoke test. For an actual post, **replace it with separately verified evidence and concise poster/title/caption fields**. The renderer does not read X and does not generate facts. Output: `poster.png`, `title.txt`, `caption.md`, `qa.json`. Packaged ZIP can be extracted and used outside the repository because it includes the verified canonical poster at `assets/base-poster.png`. See [deterministic renderer contract](../.agents/skills/tibo-reset-post-generator/references/deterministic-render.md).

If this is ordinary ChatGPT Web without Python execution access, this local lane cannot be assumed available. Prefer handoff to a local runner; use optional GPT image editing only where available and report its actual fidelity limitations.

## ChatGPT Web (works without installing a Skill)

1. Open [the actual default PNG](../assets/codex-10-26极简重置更新公告海报.png) on GitHub and **download/attach the full image file** to your ChatGPT conversation. If ChatGPT's image editor can read the source image directly from the repo, verify that it actually loaded the original PNG. A link/filename or browser screenshot alone isn't equivalent.
2. Supply a Tibo reset X URL, original post screenshot, or exact quote. Link-only evidence might be inaccessible: provide a screenshot or pasted text if needed. Keep your input post distinct from the **old poster's text**.
3. Make the Skill available to ChatGPT: upload [`SKILL.md`](../.agents/skills/tibo-reset-post-generator/SKILL.md), [`evidence-rules.md`](../.agents/skills/tibo-reset-post-generator/references/evidence-rules.md) and [`poster-style.md`](../.agents/skills/tibo-reset-post-generator/references/poster-style.md), or have ChatGPT explicitly fetch/read all three before invoking. GitHub being linked is **not** automatic Skill loading.
4. Paste this task, replacing the bracketed source and platform:

```text
Use the Tibo Reset Post Generator Skill and its two references.
Source evidence: [TIBO ORIGINAL POST URL / SCREENSHOT / EXACT QUOTE]
Platform: [XIAOHONGSHU, WECHAT OR GENERIC]; language: zh-CN.
Base image: the actual attached original file
  codex-10-26极简重置更新公告海报.png.

If a local Python/Pillow renderer is available, prefer the deterministic
text_region_edit path with canonical original PNG and qa.json.
Otherwise use optional GPT image EDITING, not fresh generation. In either
case preserve the existing
OpenAI/Codex logo and header, Tibo profile photo/handle, red accent,
white background and 3:4 composition.

BEFORE image editing, prepare a tiny reset-only POSTER_COPY:
keep Tibo as authority, just ONE faithful reset excerpt or labeled
summary (target 1-2 short Chinese lines) and the supported reset
time/status. DO NOT put unrelated Day-18 releases (Decisions API,
OpenResponses, Uber etc.), a full article, or technical recaps on
the poster: move those into the separate BODY caption instead.
Use 原帖节选 for faithful abbreviated quotation, 原帖摘要 for paraphrase;
do not wrap paraphrases in quotation marks.

Preserve the original wide whitespace. Make only the large time/status
black and bold; use lighter, charcoal/gray normal-weight quote text
and a short muted footnote (target <=2 readable lines).
NEVER shrink-to-fit a long paragraph, make all text bold/black, or
fill empty space. Change ONLY date, evidence-backed reset time/status,
short translated reset excerpt/summary and essential footer caveat.
Never reuse the old "13:21*" or date as facts about a new post.
If exact reset time is unknown use a truthful "时间待确认".
Return (1) short evidence ledger, (2) ACTUAL edited 3:4 poster image,
(3) separate concise Chinese social TITLE, (4) Chinese BODY caption.
Compare with the base at mobile-feed size. If body text is longer
than 2 short lines, lower area is crowded, the poster has multiple
competing black/bold paragraphs or whitespace is lost, shorten
poster copy and retry. If still crowded, report
INCOMPLETE — NEEDS_REVISION (TOO_DENSE), never READY_FOR_REVIEW.
If base pixels were unavailable or protected graphics drift,
return INCOMPLETE with a precise reason. Do not post automatically.
```

5. Inspect image against original before manually posting. Check unchanged logo/avatar/header/red line, only intended text changes, time-source correctness, fit, title and caption.

## Using a locally discovered Skill in Codex

From a checkout, run `cd examples/tibo-reset-post-generator`, then use `$tibo-reset-post-generator` or `/skills` where supported. The default PNG is under `assets/`, and the Skill is under `.agents/skills/`. No image editor is guaranteed in Codex: when absent, return `INCOMPLETE — RENDERER_UNAVAILABLE` and hand off original PNG + evidence to ChatGPT Web.

## Installed ChatGPT Skill (when supported)

The Skill folder can be installed where your workspace supports it. **The default PNG lives in the example project, outside the installable Skill folder.** In ChatGPT Web, independently attach that PNG to each generation; an installed Skill doesn't imply image assets from GitHub have been mounted.

## Pass/fail checklist

- Real original image bytes were loaded into the image-edit tool.
- No changes to logo, avatar, identity labels, red accent, 3:4 composition except best-effort generative drift corrected through comparison.
- Only four factual text areas were changed; no invented timestamp from the old image.
- Poster has ONE bold time/status hero, softer normal-weight reset-only copy (1–2 short lines), muted short footnote and obvious original whitespace; no unrelated releases on the poster.
- Source excerpt is faithful or is labeled `原帖摘要`, without misleading quotation marks.
- Social title and caption were returned **separately**.
- Actual rendered image exists, readable and inspected.
- No auto-posting, unverified scope claims or false `READY_FOR_REVIEW`.

See the [synthetic example](../.agents/skills/tibo-reset-post-generator/examples/sample-case.md) for an unknown-time regression.
