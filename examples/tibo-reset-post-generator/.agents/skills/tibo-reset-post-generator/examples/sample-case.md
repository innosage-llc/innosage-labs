# Synthetic case: screenshot clock with unknown timezone

**This is fictional test data for the Skill, not a reproduced X post or a claim about Tibo's actual reset.** No original screenshots, portraits, logos or source account assets are included.

## Input (simulated)

- User task: “Generate a Xiaohongshu post about this reset.”
- Source channel: **user-supplied mock screenshot**.
- Simulated author label: `Tibo / @thsottiaux` (test fixture only).
- Simulated text: `Today is a reset.`
- Screenshot labels: `Oct 26, 2026 · 1:21 PM`.
- Source screenshot viewer timezone: **unknown**.
- Independent fetch: **not performed**.
- Base poster: a blank, owned 3:4 minimal layout, or none.

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

- Small heading: `Codex / 重置动态`
- Date label: `原帖显示日期：10月26日` (or omit date if unsupported in a real case)
- **Large headline: `重置时间待确认`**
- Source label: `原帖摘要（演示数据）`
- Main text: `Tibo 表示今天有重置，具体生效时间未提供。`
- Footnote: `*展示时间 1:21 PM 的时区未知，非重置时刻。`
- Art direction: actual rendered PNG/JPEG, 3:4, white space, black type, muted text and red accent; no third-party photo/logo.

## Example Chinese caption (draft, not automatically posted)

> 【演示案例】模拟来源提到一次 Codex 重置，但截图上的 1:21 PM 未注明时区，也没有明确重置发生的分钟或适用套餐。不要把发帖时间当成重置时间。正式发布前，请核实原帖及账号范围。

This documented expectation is **not** proof the image was rendered. In an end-to-end run, the assistant must produce and inspect a real image before saying `READY_FOR_REVIEW`.
