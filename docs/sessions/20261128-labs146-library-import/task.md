# Recorder Library Import

Refs https://github.com/innosage-llc/innosage-labs/issues/146

Dependency: this draft directly descends from build 18 (b4aca59089eeaf519220b80b39e1ceca3a4b9cb7), including Labs main 2ee517327b59e1a7393c97a8765a63f75e382563 and #140 at 62a2b0e09b47222329260cfba7d38610f02f67c5. The first increment extracts shared typed admission and outcomes with native bounded decode and separate picker/storage adapters. Original capture formats and service rollout rules retain their existing owners.

Pending platform evidence and independent review. Owner acceptance is separate for both devices.

The local startup gate now runs focused import observers on its existing Release artifacts. The initial shared-policy build passed Recorder tests and Chromium outcomes. Android exercised the real picker, rejection, failed save, retry and stable ID/bytes; its first playback observer missed the fleeting pause label on a three-second clip. The next observer checks the elapsed endpoint. Fixed generated Gradle output visibility after the gate's clean-tree check caught it. Final qualification is pending.

Independent source review on e948e01 found that a new Metro adapter could bypass the targeted gate, the Web observer's measured export digest was overwritten, and the forged fixture lacked a sample index. The next increment checks resolved adapter ownership and native registration, compares measured Web artifact identity, and exercises a second real-container fixture with damaged AAC payloads. Android version code 11 advances the verified build 18 reference APK (code 10). iOS build 19 follows internal build 18.
