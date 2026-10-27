# Tibo Reset Post Generator

**Tibo evidence + committed base poster → minimally edited 3:4 image + separate Chinese title and caption.**

A concrete, **example-first** InnoSage Labs workflow for updating a previously published Tibo (@thsottiaux) reset poster. This is not a generic poster generator: the default image already contains the OpenAI/Codex logo, Tibo profile picture, branding and layout, all of which should be preserved. The Skill prioritizes **source fidelity, minimal visual change, timezone correctness and explicit uncertainty**.

> **Scope:** One supplied X post URL, screenshot, or copied quote at a time. This does **not** monitor Tibo, verify every user's quotas, or publish to Xiaohongshu/WeChat.

## Try it in ChatGPT Web (no installed Skill needed)

1. [Open and download the committed example base image](assets/codex-10-26极简重置更新公告海报.png); attach its actual PNG bytes to ChatGPT Web so GPT can **edit that image directly**. The logo/avatar/layout are intentionally part of this example.
2. Prepare a **new Tibo reset post URL, screenshot or exact quote**, then follow [the Web workflow and copy/paste prompt](workflows/generate-post.md). Attach the **Skill and both reference files** or verify the chat read them.
3. Demand an **actual edited 3:4 image plus separate Chinese title and body caption**, not just a new design prompt. If the base image cannot be loaded, the correct state is `INCOMPLETE`.
4. Compare new and original images side by side: logo, profile photo, red rule, layout and styling preserved; only date, evidence-backed time/status, quote translation and footnote may change.

If image generation is unavailable, the agent must report **INCOMPLETE**. It may still supply the factual ledger, caption and rendering instructions; those are **not** a completed poster.

## What is where?

| Part | Purpose |
| --- | --- |
| [Workflow](workflows/generate-post.md) | Human-facing entry point / copyable prompt |
| [Skill](.agents/skills/tibo-reset-post-generator/SKILL.md) | Canonical agent rules: evidence → poster → caption → quality gate |
| [Evidence rules](.agents/skills/tibo-reset-post-generator/references/evidence-rules.md) | Claims, provenance, time zone, ambiguity |
| [Poster rules](.agents/skills/tibo-reset-post-generator/references/poster-style.md) | Visual constraints, reusable layout, asset handling |
| [Synthetic sample](.agents/skills/tibo-reset-post-generator/examples/sample-case.md) | Public-safe case with expected fields and caption |
| [Default base image + asset policy](assets/README.md) | Founder-selected committed poster; preserved identity elements and separate reuse rights |
| [Contract tests](tests/test_contract.py) | Dependency-free structural and sample-fixture checks |

## Across environments

**ChatGPT Web — ordinary chat:** follow the workflow; attach the **actual committed base PNG** and new Tibo post evidence, plus `SKILL.md` and references (or verify GitHub file reads). The logo/profile should remain, with only relevant text edited. A ChatGPT conversation does **not** automatically discover a Skill from GitHub. If the image bytes or editing tool aren't available, report `INCOMPLETE` rather than drawing a lookalike from scratch.

**ChatGPT Skills (eligible users/workspaces):** the instructions live in `.agents/skills/tibo-reset-post-generator/`; they can be installed where supported. The **default PNG is outside this folder**, so attach the base image in Web even when the Skill is installed. Installation, activation and image-tool availability are account-dependent and not verified for every plan. See [OpenAI's current Skills guidance](https://help.openai.com/en/articles/20001066-skills-in-chatgpt).

**Codex CLI/Desktop:** clone the repository and start Codex from this project directory:

```sh
cd examples/tibo-reset-post-generator
codex
# Use /skills or $tibo-reset-post-generator if available
```

Codex searches `$CWD/.agents/skills`; starting from the repository **root** does not guarantee discovery of this nested Skill. In this checkout the default image is `assets/codex-10-26极简重置更新公告海报.png`. Codex has no guaranteed image-editing tool; if absent, it must report `INCOMPLETE` and hand off to ChatGPT Web.

No plugin packaging, paid service, GitHub Action or extra backend is needed for v1.

## Verification and limitations

Run `python3 -m unittest discover -s examples/tibo-reset-post-generator/tests -v` from the **repository root**. These deterministic tests validate the bundled Skill structure and synthetic fact fixtures; they **do not prove** any LLM follows the instructions or that a real renderer is available. A human end-to-end check of the generated PNG/JPEG remains required.

The founder has **committed the actual previously published base poster** to `assets/` and selected it for this specific example. Its existing OpenAI/Codex logo and Tibo portrait are preserved during edits, **not** newly generated or separately offered for reuse. The repository's MIT license does **not** by itself grant rights to extract or reuse third-party identity marks. External users may need their own permission to republish a derivative; see [asset policy](assets/README.md).

[InnoSage Labs](../../README.md) · [Project issue](https://github.com/innosage-llc/innosage-labs/issues/3) · [MIT license](../../LICENSE)
