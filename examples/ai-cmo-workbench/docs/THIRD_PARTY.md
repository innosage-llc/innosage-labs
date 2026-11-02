# AI CMO Workbench — third-party inventory (MVP)

This source directory is an original InnoSage Labs example and is published under
the repository MIT license. Third-party software retains its own license and
obligations. This is a reproducibility and provenance inventory, **not** a
redistribution or legal-compliance certification.

| Runtime component | Tested version | Declared license | Source / role |
| --- | --- | --- | --- |
| Python FastAPI | 0.162.0 | MIT | API / single state owner |
| OpenAI Agents SDK | 0.24.0 | MIT | Opt-in LLM Agent execution |
| Uvicorn | 0.54.0 | BSD-3-Clause | Single API worker |
| HTTPX | 0.28.1 | BSD-3-Clause | Private Edge Speech transport |
| Pillow | 12.3.0 | MIT-CMU | Local PNG renderer |
| Pydantic | 2.14.2 | MIT | Typed structured outputs |
| Expo | 58.0.22 | MIT | Shared Web / Android app |
| Expo Audio / Clipboard / Sharing / File System | 58.0.x | MIT | Opt-in native capture and handoff |
| React / React Native / React Native Web | 19.3 / 0.88 / 0.21 | MIT | Shared UI |
| Playwright | 1.64.1 | Apache-2.0 | Development browser smoke only |

Version/license values above are checked against the actual installed Python
distribution metadata and npm package metadata in the Mac Studio test environment.
Exact transitives are recorded in server/requirements.lock and app/package-lock.json.
Build-time platform tools, fonts, Android SDK, base OS components and FFmpeg
retain independent licensing terms; consult their distributed notices before
redistributing container images or APKs beyond the internal pilot.

**References only; no code copied into this demo:**

- [Arnold's Screenshotbot architecture](https://screenshotbot.io/blog/building-a-highly-available-web-service-without-a-database), Screenshotbot OSS MPL-2.0: architectural ideas, no Lisp/BKNR copy or claim of compatibility.
- [AiToEarn](https://github.com/yikart/AiToEarn) MIT and [Easel](https://github.com/ZJU-REAL/Easel) Apache-2.0: UX inspiration only. Do not copy their logos, brand assets or user content.
- Mac-native [InnoSage Edge Speech](https://github.com/innosage-llc/innosage-infra) is a **separately deployed internal service**; neither its model binaries nor private paths are in this public repository.
- OpenAI API calls, when the operator explicitly configures them, are a **remote service** governed by the API terms, not a bundled model.

Public GitHub fixtures use synthetic content. Production recordings, transcripts,
private credentials, LAN CA keys, browser screenshots and runtime data remain under
the ignored operator-owned .data directory.
