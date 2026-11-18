# Ten ways to edit one day

Edit the same outing ten ways in Diffusion Studio. The timeline source, music notes and reading exercises are provided. Supply your own footage. Each scene lasts 32 or 36 seconds and exports at 1080 × 1920, 30 fps.

Start with the [Chinese field guide](book/TOC.md). Film 02 follows one day in order. Film 08 reverses the order of the memories. Watch both on mute before comparing the music.

## Reproduce an edit

1. Install Diffusion Studio with its CLI, Python 3.10+, uv, FluidSynth and FFmpeg. The production used Diffusion Studio 0.216.0 on macOS.
2. Prepare 12-second portrait clips named pack, coffee, bowl, leave, lift, car, road, table, serve, meal, reach, sunset, redlight, dusk, avenue, palms and cup, with the extension .mp4. Use actual actions, including a hand entering and leaving a frame. The cup can be a held still. Put a 9:16 cream paper PNG named generated-paper.png in the same folder. A flat color works too.
3. Obtain a licensed General MIDI SoundFont. The production used [GeneralUser GS](https://github.com/mrbumpy409/GeneralUser-GS) at revision 684543d5e5efaef08d02be50dcda8d552478fa60. Read its upstream license. The bank is supplied separately.
4. Run these commands from this directory using new output directories. Set CLIPS and SOUNDFONT to local paths. The scripts do not need API keys.

~~~bash
uv run --with mido python scripts/compose_atlas.py ./scores --soundfont "$SOUNDFONT"
python3 scripts/prepare.py "$CLIPS" ./scores ./my-atlas
diffusion open -b ./my-atlas
diffusion check film07
diffusion capture film07 --times 0 13.5 27 28.5 30 35.9
diffusion export film07 ./collage.mp4
uv run --with pillow python scripts/review_export.py ./collage.mp4 ./review-collage
~~~

Choose film01 through film10 to change scenes. Modify the JSX file for the corresponding scene. To isolate one decision, first change only the cut length or only the score. The generated contact sheets sample every 15 frames and include the final frame. Listen separately to the complete track and play through cuts and animation at normal speed.

The private project uses family footage. Reproduce the timing and composition with clips you have permission to share.
