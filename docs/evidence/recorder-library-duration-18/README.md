# iOS Library duration, internal 0.1.9 (18)

Jim selected leading duration metadata for the iOS Library. On a row with a separate time, duration sits immediately after it. On a time-titled recording, duration starts beneath the title. Android remains the comparison surface. The one-file change retains the native Import toolbar action, row action, title, formatter and accessibility labels. [Draft #145](https://github.com/innosage-llc/innosage-labs/pull/145) · [Owner scope on #139](https://github.com/innosage-llc/innosage-labs/issues/139#issuecomment-7236772699).

| Test condition | Android candidate | iOS build 17 source | iOS build 18 source |
|---|---|---|---|
| 375-point or 375-dp viewport, default text | [Library](android-normal.png) | [Library](baseline-normal.png) | [Library](candidate-normal.png) |
| Same viewport, enlarged text | [Library at 1.45×](android-large.png) | [Accessibility Large](baseline-large.png) | [Accessibility Large](candidate-large.png) |

[Standard-text comparison](compared-normal.png) · [Enlarged-text comparison](compared-large.png) · [iOS maximum Dynamic Type](candidate-maximum.png). At maximum Dynamic Type the long duration wrapped to the next line at the same leading edge as the time. The native Files picker and recording row still opened.

The actual Release apps opened Library through the native tab. Both platforms displayed the same synthetic M4As: about four seconds and 65 minutes 17 seconds. A capture-style filename also exercised a row with no separate metadata time. On the final iPhone SE (third generation) Simulator, both text sizes allowed opening and canceling the trailing native Files picker and tapping the long row to open Recording detail. The screenshots retain each runtime's original duration formatting. The saved recording bytes and date/duration logic are outside the two-line presentation change.

Independent V6 review passed the exact commit and restricted Sol High UI artifact. The canonical local premerge passed the gate tests, Recorder tests, typechecking, iOS support tests, Chromium outcomes, platform startups and native Markdown Files gate. A first Android startup check expected an empty Library and encountered the comparison clips. The clean run used the original gate and exact same source with those fixtures moved aside. The final Android comparison then used the APK installed by that successful gate. [Candidate, geometry and gate receipts](verification.json) · [Apple upload and group status](testflight.json).
