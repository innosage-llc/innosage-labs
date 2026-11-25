# Verify a transcript from Recorder to Codex on Android

Use a dedicated test workspace and the two synthetic cases in [transcripts.json](transcripts.json). Record the installed Recorder APK hash, Draft build/URL, Android and browser versions, and which Draft workspace is paired with Codex. Install Draft from that origin in Chrome. An existing installation may need its WebAPK updated before its Android share filters change. A different origin has its own workspace.

1. **Edited meeting.** Prepare the meeting original as the saved transcript. In Recorder change 21 seats to 12 and save. Share Markdown, capture the Android chooser showing Draft and select it. Save the supplied attachment using the workspace paired to Draft MCP D. Record its page title. Confirm both speakers, timestamps, the corrected number and the complete Chinese final line.
2. **Original voice note.** Prepare a separate recording with the note original and no saved edits. Cancel its first share, reopen the source, then share again. Confirm the audio is still playable and Draft imports the correct Spanish final line. Cold-reopen Draft and find both pages. Exercise manual file save/import separately as a recovery path.
3. **Codex with GitHub context.** Open Codex Android alongside Draft. Ask Codex to read the meeting by title using Draft MCP D and to read [the Cedar decision](prior-decision.md) via GitHub at the tested repository revision. Ask for the corrected target, the agreed review day and owner, and any proposed change. Keep the actual tool read receipts. Expect 12 seats, Thursday, Blue Harbor, and Friday marked as a suggestion. The citation should resolve to the decision Codex read. Record whether the summary was useful and any extra steps. Disconnecting the workspace should produce a reconnectable failure. Use a disposable connection to rehearse this.

Keep synthetic evidence for each stage independently. For the export, obtain the actual Markdown attachment. For the reopened page, save its rendered plain text. For MCP, retain the named page tool result and extract its transcript text locally. Keep wrappers and tool metadata in the original receipt. A text match alone establishes only the content of the supplied artifact. Android Sharesheet registration, persistence after reopening, tool provenance, repository citation and founder assessment need their own evidence.

From the Recorder example, run the comparator once per captured artifact:

```sh
node scripts/experiment-a-readback.mjs meeting file /path/to/actual-export.md
node scripts/experiment-a-readback.mjs meeting page /path/to/reopened-page.txt
node scripts/experiment-a-readback.mjs meeting mcp /path/to/named-page-read.txt
node scripts/experiment-a-readback.mjs note file /path/to/actual-note-export.md
node --test scripts/experiment-a-readback.test.mjs
```

Repeat page and MCP comparisons for the voice note. The `file` comparison preserves paragraph spacing. Browser and MCP text comparisons allow a renderer to represent paragraph boundaries with one or more line breaks. The comparator exits nonzero for a mismatch.

Repeat the transfer with networking disabled after both apps are installed and the synthetic transcripts are saved. Check the actual attachment and reopened page while still offline. Reconnect for the explicit MCP and GitHub reads. Record whether the new transfer leg made any content-bearing network request or published a link using local request inspection with synthetic content. Keep full captures private. Report any unchecked steps alongside observed results.
