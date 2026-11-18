# A camera roll becomes a short film

A Codex + Diffusion Studio workflow for a 9:16 personal journal. The agent inspects footage, chooses a story, prepares deliberate crops, writes an editable JSX timeline, checks frames and exports a movie. Related to #53.

This example is being developed against the locally installed Diffusion Studio desktop documentation. It deliberately keeps personal media outside this public repository.

## Workflow

1. Give Codex a local footage folder, intended audience and duration. Example: “Make a 60–90 second portrait journal. Surprise me. Preserve originals. Keep private media local. Give me a first cut before publishing anything.”
2. Read the installed `docs/skills/editor.md` and tool reference. Confirm `diffusion context` succeeds.
3. Run `diffusion probe <file>` before inspection. Inspect local contact sheets with `diffusion grab` or `filmstrip`. Record a private inventory. Do not infer locations, conversations or events from filenames alone.
4. Write a brief and an edit-decision list: source, in point, duration, framing and reason for inclusion. A director/advisor can critique this read-only while the lead builds the cut.
5. Prepare only selected media with FFmpeg, preserving originals. Strip metadata. Give prepared shots a small tail handle while keeping the desired timeline end explicit.
6. Create a new local project outside cloud-synced folders. Write `<stage><scene active>` JSX. Keep each clip's `start` and `end` explicit. Use sequences; use transitions sparingly.
7. Use `diffusion check <scene>` and `diffusion capture <scene> --times ...` before exporting. Inspect opening, ending, portrait crops, text, and transition-adjacent frames.
8. Export with `diffusion export <scene> <absolute-output.mp4>`. Verify actual duration, dimensions, audio and representative frames. Provide the film for human review.

## Important implementation lessons

- Preserve the app-managed `package.json` fields (`projectId`, `main`, `displayName`, `scripts`) and existing `diffusion` keys. Replacing that file can make the app lose the current project.
- Use unique static JSX IDs. The app writes IDs back into source; IDs are not ordinary component props.
- Source duration can cap a clip before its requested timeline end. A one-frame gap is still a defect; inspect structural output and rendered cuts.
- A successful compile is not visual verification. A successful export is not a good story.
- `listen` uses a model service; inspect privacy/cost before sending private audio. Local probe/grab/capture/check do not require paid generation.
- Do not describe a composition as using a technique or model that was merely considered.

## Public/private boundary

Commit reusable source, synthetic examples, commands and redacted results. Keep source filenames, personal paths, GPS, contact sheets, private screens, family footage, transcripts and personal exports outside Git. A public demo can be rebuilt with synthetic media; personal footage publication is the owner's choice.

## Research

- [Diffusion Studio editor](https://github.com/diffusionstudio/editor)
- [Official open projects](https://github.com/diffusionstudio/open-projects)
- [JSX transitions](https://github.com/diffusionstudio/editor/blob/main/docs/reference/jsx/transitions.md)
- [Adobe: match cuts](https://www.adobe.com/creativecloud/video/discover/match-cut.html)
- [Adobe: J/L cuts](https://helpx.adobe.com/premiere/desktop/edit-projects/trim-clips/perform-j-cuts-and-l-cuts.html)

Legacy Diffusion examples may use older syntax. Installed version docs are the implementation authority. J/L cuts are a reference technique, not a claim that this first cut uses them.

## Status

Five private alternatives passed the approved director-review method (91/91/93/92/92); see RESULTS.md for dimensions, limitations and evidence summary. Founder review and publication clearance remain pending. Reusable helpers below are tested with synthetic inputs.

## Reproduce the review evidence

Generate non-personal sample footage and an editable project:

```sh
python3 scripts/synthetic_demo.py /absolute/new-local-project
 diffusion open --background /absolute/new-local-project
 diffusion check demo
```

Generate private, timestamped 2fps contact sheets (FFmpeg, ffprobe, Python and Pillow required):

```sh
uv run --with pillow python scripts/review_frames.py /absolute/film.mp4 /absolute/new-private-review
```

The output directory must be empty. Inspect EVERY sheet, separately review the ENTIRE audio, and record findings against the receipt SHA256. The script does not listen, judge quality, or award a score. Sampling cannot establish every sub-frame transition or synchronized playback quality; supplement cut boundaries where needed. This project explicitly accepts full-duration 2fps sampling plus full-audio review. Each version requires >90/100 under a fixed seven-dimension rubric; missing evidence is N/A. Do not score backward from the desired threshold.

## Zero-service-fee music route

[Sonic Pi](https://sonic-pi.net/) demonstrates code-based original composition without a music subscription. For this example, the chosen route is a small local numerical synthesizer: original note events, oscillators, envelopes and percussion; no downloaded songs, samples or paid generation endpoint. This avoids making a new model installation a dependency. Local compute still uses electricity and the surrounding assistant service is not claimed free. Generated music is not asserted to have legal exclusivity or guaranteed copyright protection.

[ACE-Step](https://github.com/ACE-Step/ACE-Step-1.5) is an alternative local generative model to investigate separately; verify the exact code AND weight license, hardware and download size before adopting. A third-party free demo is not equivalent to free unrestricted usage. Do not assume model-output rights from the repository code license alone.

Reproduce the original instrumental bed (NumPy only, no model/API):

```sh
uv run --with numpy python scripts/compose_score.py /absolute/new-score.wav
```

It creates a deterministic 76-second stereo WAV. Adapt the composition to the edit, trim and fade in the timeline, then review the complete exported audio. No claim that a generated score automatically meets the director quality threshold.
