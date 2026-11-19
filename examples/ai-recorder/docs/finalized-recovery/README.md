# Finalized Android save recovery

Refs [#95](https://github.com/innosage-llc/innosage-labs/issues/95).

Android allocates `Recording-<time>-<UUID>.m4a` before native preparation and
records into app-owned persistent `Audio/`. After native Stop, registration
requires closed, in-bounds M4A boxes including ftyp/moov/mdat and an Android
extractor-readable AAC track with positive duration and sample data. Registration
atomically renames to `recordings/` using that same name. Startup reconciles only
these pending names before another capture can start. Existing Library files,
URIs and transcript/document associations are left unchanged. Invalid/incomplete
pending files remain outside Library; registration failures retain the source
for a later cold-launch retry. This does not recover active capture or migrate
historical cache files. Container admission does not replace actual playback QA.

The ordinary app has no interruption controls. To reproduce precise process
exits, build a **separate, debuggable, embedded-JS Release QA APK** in a dedicated
checkout with Node 24 and the existing offline Android toolchain/cache:

```sh
node scripts/build-interruption-apk.mjs /absolute/new-output/recorder-interruption.apk
```

The script injects a test-only helper at A (native completion before registration)
and B (registration complete, before Saved), builds, then restores source and
generated Gradle settings in `finally`. If the build is forcibly killed, inspect
and restore only its injected helper/import and generated debuggability before
an ordinary build. Do not run ordinary CI concurrently with the injection.
The QA APK uses the generated local development signing key and current package
version; verify installed signer/version compatibility before any in-place install.
It contains only public source; no private Draft editor assets are distributed.

## Android 真机复验提案

工程验证与真机验收分别记录。使用非敏感测试语音；保留已有录音作对照。
先记录安装版本/签名与已有对照的 Library 身份、哈希。只有包名、签名兼容、
版本允许覆盖时才 `adb install -r` 安装交付的 QA APK。**不要卸载、清数据或强制降级**；
不兼容时停止，把版本与证书指纹差异报告到 #95 / draft PR。

使用单独的 localhost ADB server，并用精确设备 serial；不要使用共享 5037。
下列命令中的 `PORT` 和 `SERIAL` 由操作者填写，所有操作只针对该设备。
手机先设为离线。用当前目录 `scripts/interruption-checkpoint.py`：

1. 正常路径：Record → 录入“开始 / 中间 / 结束” → Stop & save → Library。
   点击这条录音的 Play，确认三段完整、顺序正确。也确认旧对照仍可打开。
2. A 点：运行 `python3 scripts/interruption-checkpoint.py --port PORT --serial SERIAL arm-A`，
   然后按正常路径录三段并 Stop & save。
   运行相同参数的 `exit`。helper 只在同一轮 A 回执出现后记录本轮 M4A SHA-256、
   URI、字节数及旧进程身份，再真正终止 app；不需要抢时机滑走。
   用 `launch` 冷开，进入 Library，确认只有同一条新增录音，实际 Play 三段。
   用 `list` 比较本轮 SHA-256 和旧对照；再次 `launch`，核对不同的新进程身份、
   同一条目/哈希、零重复，并再次从 Library Play 三段。
3. B 点：换成 `arm-B`，重复同样录音、Stop、`exit`、两次离线 `launch` 和
   Library 实播。B 是已登记、尚未显示 Saved 的暂停点。完成后 `disarm`。
   可再覆盖安装**同签名普通 APK**，确认正常保存/回放与数据保留；普通包没有测试暂停。

任何缺条目、重复、音频缺段/错序、哈希变化、旧对照变化、未达暂停点或安装不兼容，
都应停止该轮并反馈到 #95 / draft PR：候选提交/APK SHA-256、Android 版本、A/B、
helper 输出和截图即可。不要附私人录音、凭证或原始系统日志。
完整语音实听和真实手机行为由 Founder 验证；模拟器结果不等于真机通过。
