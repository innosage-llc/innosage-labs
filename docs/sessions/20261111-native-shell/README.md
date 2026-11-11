# AI Recorder native Android shell

Date: 2026-11-11. Base: 20208b8 (AI Recorder 0.1.9 / Android code 10).

## Goal and scope

Address missing mobile app-shell navigation with framework-native components,
without replacing recording/transcription behavior or inventing destinations.
This is a bounded Android implementation. It does not deploy a service, upgrade
the SDK, enable iOS, or claim production/product acceptance.

The existing Expo 58.0.23 / Expo UI 58.0.27 provides Material 3 NavigationBar,
NavigationBarItem, TopAppBar and IconButton. Official Material Symbols 0.1.1
supplies icons. No router migration or global plugin was needed.

## Reuse manifest

| Journey | Existing API | Chosen behavior | Check |
| --- | --- | --- | --- |
| Capture offline | Expo Audio controller | Remains mounted above root changes | Recording continues in Library |
| Browse/listen/import | FlatList, Expo Audio, DocumentPicker | Library root; import is an action | Playback survives root switch; import cancel restores Library |
| Configure service | Existing ProSettings | Settings detail, fixed native TopAppBar | Top/system Back and keyboard scroll |
| Review transcript | Existing Transcript Modal | Library detail; shared guarded Back, recording identity | Top/system Back; guard unit tests |
| Switch primary tasks | Expo UI NavigationBar/NavigationBarItem | Record / Library / Settings; neutral selected state | Native screenshot and selected semantics |
| System chrome | SafeAreaView, StatusBar, native bar insets | Top/side owned by parent; bottom by native bar | Safe layout, dark status icons |

Root actions that change audio ownership are unchanged. Native shell controls
are composed, not drawn with custom Pressables. Existing theme is reused. A
bounded modal controller remains appropriate to this existing one-detail flow;
a future deeper app should evaluate Expo Router native stacks/tabs rather than
copying this controller indiscriminately.

See [verification](verification.md), [task](task.md), and
[source hashes](source-hashes.json). Images are actual clean-emulator ADB captures,
not mockups. No keys, private recordings or transcript text were included.
