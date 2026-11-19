# Production record

The production used Diffusion Studio 0.216.0, an Apple M3 Pro and a private collection of road, meal and departure footage. Ten first cuts produced ten second cuts. No family footage is included in this repository.

The first pass produced eight 36-second films and two 32-second films. A complete decode and two frames per second plus the last frame gave 714 samples per edition. The director's first-cut scores ranged from 67 to 83. Nine endings used the same cup in at least one panel. In the revised collage, six previously seen photographs arrive together on one page. In the meal study, serving food brings the film back to the table. In the chronological film a chapter label now ends at the table-to-sunset cut.

The MIDI arranger originally scheduled the cadence 2.55 seconds before the end, but the note filter rejected any attack in the last 2.6 seconds. The corrected script separates the cadence from the preceding pattern. All ten MIDI files have a measured last attack 2.55 seconds before their respective endpoints (within 3 ms), and all ten exported audio tails contain signal. That evidence confirms the notes occur. Their musical effect still needs listening.

A separate local acoustic pilot used ACE-Step 1.5 Turbo, eight steps, seed 940202, 36 seconds and no optional language model. The recorded first run took 363 seconds including initialization. It supplied a same-picture alternate for film 02. An audio critic heard a distracting tick. The original ten scene arrangements therefore remain independently editable MIDI. The local generation used no paid music API. Diffusion Studio semantic audio review is a separate credit-metered operation.

The timeline includes paper and photo treatments on 06 and 07 and character reveals on 10. The paper prompt requested warm ivory fibers with an empty center. It uses no personal input image. For independent reproduction, make a plain paper background or generate a similar texture. The same-paper comparison teaches how a moving image inside a fixed frame differs from accumulated frozen images.

The timings, measured encoder output and hashes for each second cut appear in the [field guide](book/TOC.md). The public example supports personal footage substitution. The aesthetic score is an editorial judgment and is never assigned by the export checker.
## Narrative recuts

These ten selected masters span 91–96 on the independent director rubric. 4/10 cleared the strict >95 threshold. Every film has an editable scene and its own original lossless FLAC soundtrack. All ten masters decoded completely. The full-length visual review comprised 684 half-second and final-frame samples, with extra native-frame checks at disputed cuts. Sound judgments used an offline model's full-track analysis and measurements. Direct continuous soundtrack playback by the director was unavailable.

| Case | Film | Story / pace / image / sound / text / distinction / export | Total | What changed or still limits the film |
|---|---|---|---:|---|
| 01 | 雨刷经过的时候 | 18 / 17 / 14 / 13 / 9 / 10 / 10 | **91** | 局部跟踪让雨刷、刹车灯和车道都清楚可见。12–27 秒停车时几乎没有新的动作，长镜头的张力在这里最弱。 |
| 02 | 开饭以前 | 19 / 18 / 14 / 13 / 9 / 9 / 10 | **92** | 26.4 秒切到筷子，最后用同桌的人收住。盒中物品与饭桌的关系超出画面证据，能读出的是出门到吃饭的顺序。 |
| 03 | 把这一拍留给她 | 18 / 19 / 13 / 14 / 8 / 9 / 10 | **91** | 重拍回来时看到反应，结尾重新取景使人物更大；30.5 秒身侧的家电仍然抢眼，脸接近画面边缘。 |
| 04 | 花的位置 | 20 / 18 / 14 / 14 / 9 / 10 / 10 | **95** | 花垫在 19.8 秒接上，22.47 秒被掀起；37 秒镜头退开后，它又回到眼前。尾声的新重音落在镜头转向沙发时，花到音乐衰减时才重现。 |
| 05 | 一筷之间 | 20 / 19 / 14 / 14 / 9 / 10 / 10 | **96** | 第一帧就看到轮胎在白线旁移动，11 秒出现同样形状的静止车轮，25.2 秒车驶离、菜落入碗。开头的铺垫在结尾得到回应。鱼眼与颗粒仍然可见。 |
| 06 | 给以后看到这一天的人 | 19 / 20 / 14 / 14 / 10 / 9 / 10 | **96** | 26.5–29.5 秒的中位瞬时响度从 −22.4 降到 −28.8 LUFS，最后一页再回到完整伴奏。人物侧过脸的停留成了一次音乐呼吸。前几页仍用了相似的翻页节奏。 |
| 07 | 走到镜头前 | 19 / 18 / 14 / 12 / 9 / 10 / 10 | **92** | 23秒看向镜头，最后一格填上肖像。原片只有约一秒正面目光。 |
| 08 | 往回看，盒盖还在手里 | 19 / 19 / 14 / 14 / 10 / 10 / 10 | **96** | 3–4.5 秒的盒盖一闪而过；27.7 秒的目光让回忆回到人身上。最后一帧，手指还握着已经打开的盖子。棕榈镜头起头稍晃，窗框侵入了部分天空。 |
| 09 | 再添一碗 | 19 / 17 / 13 / 13 / 9 / 10 / 10 | **91** | 从近空的碗出发，到饭勺落米，再回到桌边，6.1 秒后保持连续视角。回到桌边后的放碗动作超出原片，配乐音色变化有限。 |
| 10 | 近一点 | 20 / 20 / 14 / 14 / 9 / 9 / 10 | **96** | 20.867 秒菜落到饭上，20.900 秒切到房间另一头正在走来的人，两段距离一起回答“近一点”。方向盘局部已排除先前的车牌；手背偶尔被画面上沿裁到。 |

### Execution record

1. Opened the original 39-item inventory, including photographs and long dashcam takes. Used local proxy contact sheets to select movement and mark cut times. Additional checks on source angles found the car stopped beside a painted line and the same green mat before and after a table was cleared.
2. Generated original music locally. The wood/porcelain counterpoint uses the included deterministic physical-synthesis script. Other principal scores originate from the MIDI arranger, licensed GeneralUser GS and scene-timed gain or original foley. A second folk score made by a local ACE-Step model remains a separate same-picture comparison.
3. Built editable TSX scenes, then ran `diffusion check <scene>` and `diffusion export <scene> <file.mp4>`. Retained earlier versions privately. Reworked the fifth film after broad road masking softened its focal action. Reframed the steering insert in 10 and cut the family serving scene in 02 before a phone entered.
4. For each exact MP4, decoded the whole file, sampled every 15th video frame plus its final frame, measured loudness, and hashed the complete AAC stream. A director reviewed chronological sheets and requested original-size inspections for a moving hand, wheel, or privacy concern. A fully identical AAC stream can reuse its earlier sound analysis. Picture sync is reviewed again on every new edit.
5. Built ten projects in fresh folders with `scripts/build_study.py`, using the public scenes, lossless scores and the author's matching local shots. Opened, checked and rendered each project in Diffusion Studio. Compared the complete source PCM, complete re-exported AAC stream and sampled RGB pictures to its master. Replacing the pictures with your own clips intentionally changes this comparison. The machine-readable record names all ten scene IDs and hashes. [Verification record](studies/verification.json)
6. Built the ten-case EPUB from these chapters using the InnoSage Ops EPUB builder. Private family exports are available to their owner through the local screening index. The public motion studies use only geometric illustrations, generated paper and original music.

The figure for each film is an editorial judgment of the specified export. A successful reproduction test can reproduce a weakness along with a strength.
