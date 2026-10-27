# Tibo Reset Post Generator

**Evidence in → 3:4 poster image + Chinese caption out.**

A **project-first** InnoSage Labs example for turning a Tibo (@thsottiaux) Codex/ChatGPT reset-related post into a readable social update. It prioritizes **source fidelity, time-zone correctness, and explicit uncertainty**, not engagement bait.

> **Scope:** One supplied X post URL, screenshot, or copied quote at a time. This does **not** monitor Tibo, verify every user's quotas, or publish to Xiaohongshu/WeChat.

## Try it in ChatGPT Web (no installed Skill needed)

1. Prepare a source post **URL, screenshot, or exact pasted quote**; optionally attach a poster you have permission to reuse.
2. Open [Generate a post — Web quick start](workflows/generate-post.md). Follow the copy/paste prompt there and attach the **Skill file plus its two reference files**, or use the direct public file URLs listed in that guide if your chat can read them.
3. Check the evidence summary before treating the content as news. The output must contain a **real rendered 3:4 image and a Chinese caption**, not just an image brief.
4. Review the actual image (Chinese glyphs, margins, attribution, any time claims) before manually posting.

If image generation is unavailable, the agent must report **INCOMPLETE**. It may still supply the factual ledger, caption and rendering instructions; those are **not** a completed poster.

## What is where?

| Part | Purpose |
| --- | --- |
| [Workflow](workflows/generate-post.md) | Human-facing entry point / copyable prompt |
| [Skill](.agents/skills/tibo-reset-post-generator/SKILL.md) | Canonical agent rules: evidence → poster → caption → quality gate |
| [Evidence rules](.agents/skills/tibo-reset-post-generator/references/evidence-rules.md) | Claims, provenance, time zone, ambiguity |
| [Poster rules](.agents/skills/tibo-reset-post-generator/references/poster-style.md) | Visual constraints, reusable layout, asset handling |
| [Synthetic sample](.agents/skills/tibo-reset-post-generator/examples/sample-case.md) | Public-safe case with expected fields and caption |
| [Asset policy](assets/README.md) | What to upload at runtime and what is **not** redistributable |
| [Contract tests](tests/test_contract.py) | Dependency-free structural and sample-fixture checks |

## Across environments

**ChatGPT Web — ordinary chat:** use the workflow and attach the source/screenshot, optional base image, `SKILL.md` and its references. A standalone ChatGPT conversation does **not** automatically discover a Skill from GitHub. Real poster delivery requires an enabled image creation/editing capability. Where file/URL reading is unavailable, upload the files rather than pretending they were loaded.

**ChatGPT Skills (eligible users/workspaces):** the independently portable folder is `.agents/skills/tibo-reset-post-generator/`. Its `SKILL.md` and all runtime reference/example files are self-contained. Install or upload via ChatGPT **Plugins → Skills** if your account supports that UI, then select the skill. Installation, activation and image-tool availability were **not verified for every ChatGPT plan**. See [OpenAI's current Skills guidance](https://help.openai.com/en/articles/20001066-skills-in-chatgpt).

**Codex CLI/Desktop:** clone the repository and start Codex from this project directory:

```sh
cd examples/tibo-reset-post-generator
codex
# Use /skills or $tibo-reset-post-generator if available
```

Codex searches `$CWD/.agents/skills`; starting from the repository **root** does not guarantee discovery of this nested project Skill. Codex has no promised image-generation tool: if none exists, it must accurately report an **incomplete** rendering step.

No plugin packaging, paid service, GitHub Action or extra backend is needed for v1.

## Verification and limitations

Run `python3 -m unittest discover -s examples/tibo-reset-post-generator/tests -v` from the **repository root**. These deterministic tests validate the bundled Skill structure and synthetic fact fixtures; they **do not prove** any LLM follows the instructions or that a real renderer is available. A human end-to-end check of the generated PNG/JPEG remains required.

The original founder-provided posters, social screenshots, brand logo and third-party portrait are **not bundled**, because these examples do not establish redistribution rights. A neutral text-first fallback is provided by the Skill. External users supply their own authorized base image.

[InnoSage Labs](../../README.md) · [Project issue](https://github.com/innosage-llc/innosage-labs/issues/3) · [MIT license](../../LICENSE)
