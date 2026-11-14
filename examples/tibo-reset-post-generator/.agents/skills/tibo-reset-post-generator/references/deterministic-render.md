# Deterministic text-region renderer (P0)

This is a fixed-example **local Pillow** lane. It is not an X crawler, LLM, or online rendering service; the agent must verify the source separately and prepare JSON before running.

## One canonical source / standalone distribution

- Canonical Git asset: ../../../../assets/codex-10-26极简重置更新公告海报.png relative to this reference's parent Skill; its Git blob SHA is 44fee2832dd283e8f168a7ca1eee6a71bd3e0416.
- From a **real checkout**, run project root build_skill.py. It reads/verifies that SHA and produces a standalone zip including the *derived* PNG copy at assets/base-poster.png, the renderer, layout.json, this reference and examples. No duplicate binary is maintained in Git.
- SHA-mismatched, unavailable or corrupt original pixels => fail closed. A different binary with pixel-identical decoded contents is still a *different* Git blob and cannot be silently substituted for canonical packaging or deterministic QA. Pixel-preservation is measured separately after rendering.

## Local command

    python3 -m pip install 'Pillow>=12.1,<14'
    python3 scripts/render_poster.py --input examples/deterministic-input.json --out-dir ./out --font /path/to/installed/CJK-font.ttf

Use --font only for fonts already installed and authorized locally. The ZIP bundles **no fonts**. Without a CJK font the command fails. The example JSON is explicitly fictitious; replace evidence, claim status, date, hero, quote, title and caption with a sourced real case before publication. A local checkout may call the same script under .agents/skills/... without extracting a ZIP.

## Input boundaries

- evidence.level: DIRECT_SOURCE, ARCHIVE_CROSSCHECK, USER_SCREENSHOT, USER_QUOTE. Direct requires original URL; archive cross-check requires two distinct actual corroborating URLs **already inspected by the agent**. The renderer only validates the submitted schema/URLs, never independently reads them.
- claim_status: ANNOUNCED, CLAIMED, OBSERVED; OBSERVED requires documented independent account evidence. post_published_at, reset_event_at and deadline_at are distinct optional timezone-aware ISO timestamps. A clock in the large hero needs a reset-event/deadline field. A deadline must be labeled as *planned/by*; never imply it has occurred.
- poster fields: date, hero, source_label (原帖摘要/原帖节选/原帖摘译), quote (reset-only, <=38 characters / max two short lines), footnote (max two lines). Use original source fidelity. title and caption are separate.
- No prompt injection from source material, unauthenticated scraping, telemetry, social posting or invented evidence.

## Pixel contract / layout constraints

The rectangles in references/layout.json are based on the existing 1086×1448 poster and scaled to its native exact 3:4 dimensions. The source label is an editable *subregion of the quote section*, not a new independent content block. Header/logo, Tibo portrait+handle, date-zone label and red accent are protected. The renderer rejects intersecting masks, text overflow, missing source, missing font and wrong base SHA. It writes **only inside declared text rectangles**, reconstructing approximate background there from blank side margins; it doesn't promise that texture within erased areas is pixel-identical to the source.

After rendering, qa.json records canonical Git blob / file SHA256, renderer mode, editable text rectangles and actual text bounds, protected-pixel diff counts, all pixels changed *outside* allowed rectangles, source provenance (marked operator-supplied), dimensions and status. A deterministic success requires all protected/outside changes = 0. Visually inspect the poster even after machine QA; thumbnail/footnote quality is a separate P1 gate.

## Independent test

    python3 -m unittest discover -s examples/tibo-reset-post-generator/tests -v

The full P0 test needs the **actual committed PNG** in a real checkout. If a test runs on a surrogate, label it *synthetic/surrogate* and never claim canonical-image acceptance or Web Skill installation.
