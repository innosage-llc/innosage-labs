# Synthetic case: screenshot clock with unknown timezone

**This is fictional source text for a deterministic Skill regression, not a reproduced X post or a claim about Tibo's actual reset.** The project **does** include a real, previously published base poster with logo/avatar in `../../../../assets/` (relative to this example document), but this fixture does not distribute or reproduce source screenshots or extra portraits.

## Input (simulated)

- User task: “Generate a Xiaohongshu post about this reset.”
- Source channel: **user-supplied mock screenshot**.
- Simulated author label: `Tibo / @thsottiaux` (test fixture only).
- Simulated text: `Today is a reset.`
- Screenshot labels: `Oct 26, 2026 · 1:21 PM`.
- Source screenshot viewer timezone: **unknown**.
- Independent fetch: **not performed**.
- Base poster: **the existing committed example PNG** (same OpenAI/Codex logo, Tibo avatar and red accent), not a neutral redesign. If its image bytes can't be loaded by GPT editing, stop at `INCOMPLETE — BASE_IMAGE_UNAVAILABLE`.

## Expected evidence ledger

| Field | Expected |
| --- | --- |
| Provenance | `USER_SCREENSHOT`, fictional fixture |
| Reset status | `CLAIMED`, **not** `OBSERVED` |
| Original (fictional) | `Today is a reset.` |
| Translation | `今天是一次重置。` |
| Post publication in Beijing | `unknown` (displayed clock has no verified zone) |
| Reset event time | `unknown` |
| Scope/tier | `unknown` |

The agent must **not** write “北京时间 13:21 已重置” or “全部 Pro 套餐已重置”.

## Example poster copy / expected visual result

- **Keep unchanged:** existing OpenAI/Codex logo + header, Tibo avatar/name/handle, red underline, background, overall 3:4 composition.
- Date label: `原帖显示日期：10月26日` (fictional screenshot display; omit if unsupported in a real case).
- **Replace the old large `13:21*` with `时间待确认`**, fitting the existing time box.
- Source label: `原帖摘译（演示数据）`.
- Main text: `Tibo 表示今天有重置，具体生效时间未提供。`.
- Footnote: `*截图显示 1:21 PM，但时区未知，非重置时刻。`.
- Separate social **title**: `Tibo 提及 Codex 重置，时间仍待确认`.
- Do not redraw the logo/avatar or introduce a new layout; produce an actual edited 3:4 image.

## Example Chinese caption (draft, not automatically posted)

> 【演示案例】模拟来源提到一次 Codex 重置，但截图上的 1:21 PM 未注明时区，也没有明确重置发生的分钟或适用套餐。不要把发帖时间当成重置时间。正式发布前，请核实原帖及账号范围。

This documented expectation is **not** proof the image was edited. In an end-to-end run, the assistant must load the original image pixels into GPT editing, produce and visually compare a real image, and return separate title + caption before saying `READY_FOR_REVIEW`.
