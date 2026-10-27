# Tibo example poster: preservation-first design contract

This **specific example** uses the previously published poster in `../../../assets/codex-10-26极简重置更新公告海报.png` (relative to `SKILL.md`) as the **default edit target**. See the [project asset note](../../../../assets/README.md) for provenance. This is not a generic brand-neutral template.

## Editorial hierarchy and breathing room (MVP quality gate)

**The poster is a one-message teaser, not a full news translation. Negative space is part of the design and must not be filled.**

Priority order:
1. **Hero:** evidence-backed reset **time, deadline or status** (one dominant black/bold visual element). Do not imply a deadline is the actual execution time.
2. **Authority:** existing Tibo photo/name/handle; preserve it, do not turn the quote into a second giant headline.
3. **Reset excerpt or summary:** just **one reset-related idea**, **1–2 short lines** in the original source area. Target concise Chinese rather than a paragraph. Details such as Day counters, Decisions API, OpenResponses, Uber, and unrelated release items belong in the **separate social caption**, if relevant.
4. **Caveat:** **1–2 small legible lines** in muted gray, including only the material uncertainty, not a full explanation of every timezone possibility. Elaborate explanations go to the caption/evidence ledger.

**Typography and color:**
- Keep the original logo/header/photo/red accent as-is; one dominant **black bold** hero only. Secondary quote/summary should be **regular/medium**, **dark slate/charcoal** rather than equally heavy jet black. Tertiary footnote uses **muted gray** with readable contrast.
- Use differences in **font size, weight and tone**, not several equally oversized or equally bold black blocks competing for attention. Keep the vertical gaps of the original template; do **not** scale up the body to fill open space.
- First **delete non-reset content**; second summarize or select a faithful short excerpt; only then adjust line breaks minimally. **Do not use shrink-to-fit as a substitute for editorial judgment.**
- If the source contains multiple announcements and the meaningful reset phrase cannot fit without crowding, use an **accurate reset-only paraphrase** tagged `原帖摘要`. Use `原帖节选` with `…` and quotation marks **only for a faithful omitted passage**; never imply omitted clauses say something different.

**Fail gate:** If the edited image still resembles an all-black/all-bold 4–6-line news recap, has dense lower-body text, or sacrifices the base image's whitespace, report `INCOMPLETE — NEEDS_REVISION (TOO_DENSE)`; not `READY_FOR_REVIEW`.

## Rendering mode and loading gate

- Default: `edit_existing_poster`, **not** text-to-image regeneration. Use GPT's image **editing** capability with the **original PNG bytes** in its image-input context.
- When working from GitHub, navigate to the project asset and download/attach the PNG if the current ChatGPT client cannot pass a repo image directly into editing. A filename/URL or thumbnail screenshot is not proof that full original pixels were loaded.
- A missing/unreadable default image is `INCOMPLETE — BASE_IMAGE_UNAVAILABLE`. Do not silently substitute a newly generated poster. `generate_new_poster` is a separate **explicitly requested** mode outside this example's default behavior.

## Protected regions — preserve as-is

| Region | Preservation objective |
| --- | --- |
| Top left | Existing OpenAI/Codex logo **and** `Codex / ChatGPT ｜ 重置更新` branding, same placement and scale |
| Attribution | Tibo's existing profile photograph, name and `@thsottiaux` — do not replace, stylize or crop |
| Graphic structure | White background, existing red horizontal accent, margins, whitespace, large main time/date hierarchy |
| All other untouched elements | Same visual appearance as the reference; edit only approved text slots |

The owner explicitly authorizes preserving these **already present** image elements in this example. They are not a license grant for independent redistribution or third-party reuse. Do not redraw logos or hallucinate a different face.

## Editable text zones — minimal delta

1. Date label/date text, only if backed by the **new** source evidence. Old `10月26日` is example history, not current fact.
2. Large `13:21*` **time/status text**, only if the actual reset event time is known; otherwise replace with a short accurate status like `时间待确认` within the same visual area. Old clock is not evidence of the new reset.
3. The text in the translated Tibo quote / source-summary block, preserving `原帖摘译` attribution convention and the static avatar/handle.
4. Small bottom footnote/source caveat, changing only what the new evidence requires.

**No other poster changes.** The **social title and body caption** are text deliverables **outside the image**, not new overlay panels. Avoid redesigns, added backgrounds, decorative graphics or extra badges.

## Fit and fidelity rules

- Output a real **3:4 PNG/JPEG** using image edit, preferably matching the original pixel dimensions and content bounding boxes when the tool permits.
- Prefer the original alignment, font weight, line spacing, padding, contrast and scale. Never sacrifice readability to force lengthy translation into the same line count.
- If the source is longer, **shorten it to the reset excerpt/summary first**; rewrap only within its original text zone. Do not use small type or compress the footnote to force unrelated information onto the poster. Do not move logo/avatar/red line.
- If a concise, truthful reset phrase still can't fit cleanly, return `INCOMPLETE — NEEDS_REVISION (TOO_DENSE)` and offer a shorter faithful paraphrase. The original poster's whitespace is an acceptance criterion, not disposable empty space.
- Image editing is generative and may change pixels outside selected text regions. Fidelity must be **checked visually after generation**, not assumed. Compare base and output for logo/avatar/header/red line; if changed, retry a targeted text-only edit.

## Factual labeling and title/caption

- Preserve source identity: `Tibo · @thsottiaux`. Distinguish direct quote, Chinese translation, and summarized meaning.
- Do not carry forward the old poster's `13:21*`, date, old translation or footnote for a different announcement unless the **new evidence** supports them.
- Never conflate source post's display clock with Beijing reset-event time. When unresolved, state the uncertainty in a visible footnote and choose a truthful prominent status.
- Separate **headline/title** (copyable outside image) from **caption** (short factual Chinese post body, concise source link, one uncertainty note); no clickbait or unsupported all-account quota promises.

## Final compare checklist

- [ ] The **original committed PNG** (or its exact user-attached copy) was provided to GPT image editing, not just viewed as a GitHub web page.
- [ ] OpenAI/Codex logo, `Codex / ChatGPT` header, Tibo portrait/name/handle, red rule, background and overall layout are visually preserved.
- [ ] Only the four approved text zones changed; no extraneous objects/panels.
- [ ] **Reset-only information** under source attribution, at most **1–2 short lines**, not a full mixed-topic article recap; non-reset details moved into separate caption.
- [ ] **One bold hero only**; secondary source text visibly lighter/softer in weight and tone; footnote muted gray, **1–2 readable lines**. Original whitespace remains generous.
- [ ] Accurate `原帖节选` vs `原帖摘要` label; no misleading quotation marks or omission.
- [ ] Correct simplified Chinese, no overlaps, no clipping and **3:4** proportions.
- [ ] Every new date/time is evidence-backed; unknown reset time does not leave `13:21*` from the old poster.
- [ ] Separate social title and caption are both present, with correct source/caveat.
- [ ] Differences and limitations are reported honestly; no auto-publication.

A renderer cannot guarantee a perfect pixel match. Failed preservation => `INCOMPLETE — NEEDS_REVISION`, not `READY_FOR_REVIEW`.
