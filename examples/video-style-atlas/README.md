# Ten ways to edit one day

Edit the same outing ten ways in Diffusion Studio. The timeline source, music notes and reading exercises are provided. Supply your own footage. The original studies run 32 or 36 seconds. The narrative recuts run 30–38 seconds and export at 1080 × 1920, 30 fps.

Start with the [ten beginner exercises](LEARNING.md) or read the [Chinese field guide](book/TOC.md). Film 02 follows one day in order. Film 08 reverses the order of the memories. Watch both on mute before comparing the music.

## Reproduce an edit

1. Install Diffusion Studio with its CLI, Python 3.10+, uv, FluidSynth and FFmpeg. The production used Diffusion Studio 0.216.0 on macOS.
2. Prepare 12-second portrait clips named pack, coffee, bowl, leave, lift, car, road, table, serve, meal, reach, sunset, redlight, dusk, avenue, palms and cup, with the extension .mp4. Use actual actions, including a hand entering and leaving a frame. The cup can be a held still. Put a 9:16 cream paper PNG named generated-paper.png in the same folder. A flat color works too.
3. Obtain a licensed General MIDI SoundFont. The production used [GeneralUser GS](https://github.com/mrbumpy409/GeneralUser-GS) at revision 684543d5e5efaef08d02be50dcda8d552478fa60. Read its upstream license. The bank is supplied separately.
4. Run these commands from this directory using new output directories. Set CLIPS and SOUNDFONT to local paths. The scripts do not need API keys.

~~~bash
uv run --with mido python scripts/compose_atlas.py ./scores --picture-cues --soundfont "$SOUNDFONT"
python3 scripts/prepare.py "$CLIPS" ./scores ./my-atlas
diffusion open -b ./my-atlas
diffusion check film07
diffusion capture film07 --times 0 13.5 27 28.5 30 35.9
diffusion export film07 ./collage.mp4
uv run --with pillow python scripts/review_export.py ./collage.mp4 ./review-collage
~~~

Choose film01 through film10 to change scenes. Modify the JSX file for the corresponding scene. To isolate one decision, first change only the cut length or only the score. The generated contact sheets sample every 15 frames and include the final frame. Listen separately to the complete track and play through cuts and animation at normal speed.

The private project uses family footage. Reproduce the timing and composition with clips you have permission to share.

## Watch a public example

[Play the 36-second illustrated paper journey](sample/paper-journey.mp4). Six original geometric illustrations stand in for travel photographs. Watch the last nine seconds for the relationship between each new card and the music. The public preview is 432 × 768. The editable master renders at 1080 × 1920.

~~~bash
uv run --with pillow python scripts/collage_sample.py ./scores/07-chamber.wav ./paper-study
diffusion open -b ./paper-study
diffusion check film07
diffusion export film07 ./paper-journey.mp4
~~~

If the editor has just opened and the check reports a missing scene, allow the project to finish loading and run the check again.

## Rebuild a narrative recut

Choose a numbered scene in the [recut catalog](studies/index.json). Each entry lists its lossless original score, the required shots and their minimum lengths. The catalog uses action descriptions, so a reader can substitute a familiar room, meal or journey. The public picture examples use original illustrations.

~~~bash
python3 scripts/build_study.py 05 --list-inputs
python3 scripts/build_study.py 05 --inputs ./clips --output ./my-study
diffusion open -b ./my-study
~~~

Use the scene ID printed by the builder with `diffusion check`, `diffusion capture` and `diffusion export`. The builder checks the length of every replacement shot before creating the project. It decodes the included FLAC into a full-resolution editable WAV. Both versions preserve the same PCM audio samples. The catalog records the original WAV and FLAC file checksums.

### Hear a score being built

Play the [wood and porcelain study](sample/a-bowl-in-transit.mp4) with the sound on. The top panel pauses as the lower panel's chopsticks approach. When the two parts share a single picture, bass and struck tones draw closer in the stereo field. The road, chopsticks and dishes in this public exercise are geometric drawings. Its 1,020 frames contain no source photographs.

~~~bash
uv run --with numpy --with soundfile python scripts/compose_counterpoint.py ./counterpoint.wav
uv run --with pillow python scripts/illustrate_counterpoint.py ./counterpoint.wav ./counterpoint.mp4
~~~

The composer generates 17 bars of 7/8 at 105 quarter-note beats per minute. A damped sinusoid with higher resonances supplies each struck sound. Fixed delay taps and equal-power panning place the sounds in space. FFmpeg sets the final level. This exercise uses local computation and has no music-service charge. The included FLAC tracks for the other styles originate from the music code, FluidSynth and GeneralUser GS, with additional picture-timed gain and percussion. [GeneralUser GS music-creation license](https://github.com/mrbumpy409/GeneralUser-GS/blob/684543d5e5efaef08d02be50dcda8d552478fa60/documentation/LICENSE.txt)

### What to listen and look for

| Two examples | Try this viewing exercise |
|---|---|
| 01 and 03 | Tap where you expect a cut. Keep tapping through the long pause. |
| 02 and 08 | Name the first object you recognize when it returns. Change the order and watch again. |
| 04 and 07 | Pause at the matched object and the frozen photograph. One transition depends on position, the other on recognizing a look. |
| 05 and 09 | Cover one part of the split screen, then follow the single-camera trip. Write down what you know about each physical path. |
| 06 and 10 | Watch once with the text covered. Restore it and decide which words add something the image cannot supply. |

A timeline or loudness check can confirm the length of a pause. An editor still has to judge whether waiting has earned the shot that follows. The case chapters retain the earlier versions so readers can see where a more elaborate edit made a film worse.
