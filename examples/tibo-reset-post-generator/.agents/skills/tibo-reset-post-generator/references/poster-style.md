# Tibo example poster: preservation-first design contract

This **specific example** uses the previously published poster in `../../../assets/codex-10-26极简重置更新公告海报.png` (relative to `SKILL.md`) as the **default edit target**. See the [project asset note](../../../../assets/README.md) for provenance. This is not a generic brand-neutral template.

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
- If new quote is longer, rewrap **only its text zone**; minimally reduce that text's size if required. Do not crowd the lower footnote, move the logo or avatar, or shift the red line.
- If source text can't fit without substantial layout drift, return `INCOMPLETE — NEEDS_REVISION` with a concise proposed shorter faithful paraphrase for the user, instead of claiming it is done.
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
- [ ] Correct simplified Chinese, no overlaps, no clipping and **3:4** proportions.
- [ ] Every new date/time is evidence-backed; unknown reset time does not leave `13:21*` from the old poster.
- [ ] Separate social title and caption are both present, with correct source/caveat.
- [ ] Differences and limitations are reported honestly; no auto-publication.

A renderer cannot guarantee a perfect pixel match. Failed preservation => `INCOMPLETE — NEEDS_REVISION`, not `READY_FOR_REVIEW`.
