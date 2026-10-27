# Tibo Reset Post Generator

**Tibo evidence + committed base poster → minimally edited 3:4 image + separate Chinese title and caption.**

A concrete, **example-first** InnoSage Labs workflow for updating a previously published Tibo (@thsottiaux) reset poster. This is not a generic poster generator: the default image already contains the OpenAI/Codex logo, Tibo profile picture, branding and layout, all of which should be preserved. The Skill prioritizes **source fidelity, minimal visual change, timezone correctness and explicit uncertainty**.

> **Scope:** One supplied X post URL, screenshot, or copied quote at a time. This does **not** monitor Tibo, verify every user's quotas, or publish to Xiaohongshu/WeChat.

## Reproducible deterministic mode (preferred for this example)

The source image remains **one canonical file** in project `assets/`. Run [`build_skill.py`](build_skill.py) from a clean repo checkout to create a portable, hash-verified Skill ZIP **without committing a second image**. The package includes `assets/base-poster.png`, the local Pillow [renderer](.agents/skills/tibo-reset-post-generator/scripts/render_poster.py), its [layout](.agents/skills/tibo-reset-post-generator/references/layout.json) and [example JSON](.agents/skills/tibo-reset-post-generator/examples/deterministic-input.json). No fonts are included.

```sh
python3 -m pip install 'Pillow>=11,<14'
python3 examples/tibo-reset-post-generator/build_skill.py
python3 examples/tibo-reset-post-generator/.agents/skills/tibo-reset-post-generator/scripts/render_poster.py \
  --input examples/tibo-reset-post-generator/.agents/skills/tibo-reset-post-generator/examples/deterministic-input.json \
  --out-dir /tmp/tibo-render
```

The JSON file is a **fictional, synthetic smoke input**. The agent must source-check a real Tibo post and prepare distinct evidence/claim/post-time/deadline fields first. This renderer never fetches X. Validated output includes a real 3:4 PNG, separate social title/caption and machine-readable `qa.json` with exact source-image identity and protected/outside-slot pixel differences. Missing font, original image, inaccurate/unsupported source claim or overflow must fail closed. For portable installation, extract the generated ZIP and execute its `scripts/render_poster.py` using its bundled verified image; no Git required.

See [deterministic mode details](.agents/skills/tibo-reset-post-generator/references/deterministic-render.md).

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

**ChatGPT Web — ordinary chat:** follow the workflow; attach the **actual committed base PNG** and new Tibo evidence, plus `SKILL.md` and references (or verify actual file reads). A ChatGPT conversation does not automatically discover a Skill from GitHub or provide a local Python/Pillow runtime. If Web can't run the deterministic renderer, use an authorized local execution lane; alternatively use GPT image editing with **generative** fidelity claims, never a false deterministic pixel QA result.

**ChatGPT Skills (eligible users/workspaces):** a bare project Skill folder does not contain the base asset, but `build_skill.py` creates a portable ZIP that includes the verified poster copy. Upload/install where supported; do not infer that ChatGPT can execute bundled Python or that the default asset is automatically attached to an image editor. Client entitlement and runtime capabilities must be checked separately. See [OpenAI Skills guidance](https://help.openai.com/en/articles/20001066-skills-in-chatgpt).

**Codex CLI/Desktop:** clone the repository and start Codex from this project directory:

```sh
cd examples/tibo-reset-post-generator
codex
# Use /skills or $tibo-reset-post-generator if available
```

Codex searches `$CWD/.agents/skills`; starting from the repository root does not guarantee discovery of this nested Skill. In a checkout, the deterministic local Python renderer can run if Pillow and CJK fonts are present; otherwise report `INCOMPLETE`. Do not claim Codex provides image editing by default.

No plugin packaging, paid service, GitHub Action or extra backend is needed for v1.

## Verification and limitations

Run `python3 -m unittest discover -s examples/tibo-reset-post-generator/tests -v` from the **repository root**. These deterministic tests validate the bundled Skill structure and synthetic fact fixtures; they **do not prove** any LLM follows the instructions or that a real renderer is available. A human end-to-end check of the generated PNG/JPEG remains required.

The founder has **committed the actual previously published base poster** to `assets/` and selected it for this specific example. Its existing OpenAI/Codex logo and Tibo portrait are preserved during edits, **not** newly generated or separately offered for reuse. The repository's MIT license does **not** by itself grant rights to extract or reuse third-party identity marks. External users may need their own permission to republish a derivative; see [asset policy](assets/README.md).

[InnoSage Labs](../../README.md) · [Project issue](https://github.com/innosage-llc/innosage-labs/issues/3) · [MIT license](../../LICENSE)
