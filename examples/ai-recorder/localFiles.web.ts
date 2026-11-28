import { parseSpeakerResult, type CompletedTranscript, type SpeakerResult } from './transcriptCompletion';
import { recorderDatabase, transaction } from './browserDatabase.web';

// Mirror the Recorder's single local directory. Strings hold small document sidecars;
// IndexedDB supplies Blob handles for audio so Library does not decode or copy media.
const prefix = 'recorder-local:/recordings/';
type Entry = { name: string; content: Blob | string };
const entries = new Map<string, Entry>();
export async function loadFiles() {
  const rows: Entry[] = await transaction('files', 'readonly', store => store.getAll());
  entries.clear();
  for (const row of rows) entries.set(row.name, row);
}

export class Directory {
  readonly uri = prefix;
  readonly exists = true;
  create() {}
  list() { return Array.from(entries.keys(), name => new File(this, name)); }
}

export const recordings = new Directory();
export class File extends Blob {
  readonly name: string;
  readonly uri: string;
  readonly parentDirectory = recordings;
  constructor(directoryOrURI: Directory | string, filename?: string) {
    const name = typeof directoryOrURI === 'string' && directoryOrURI.startsWith(prefix)
      ? decodeURIComponent(directoryOrURI.slice(prefix.length)) : filename;
    if (!name || name.includes('/')) throw new Error('Unknown local recording.');
    const content = entries.get(name)?.content;
    super(content === undefined ? [] : [content], { type: content instanceof Blob ? content.type : 'text/plain' });
    this.name = name;
    this.uri = prefix + encodeURIComponent(name);
  }
  get exists() { return entries.has(this.name); }
  textSync() {
    const value = entries.get(this.name)?.content;
    if (typeof value !== 'string') throw new Error('Local text unavailable.');
    return value;
  }
  async text() {
    const value = entries.get(this.name)?.content;
    if (value === undefined) throw new Error('Local file unavailable.');
    return typeof value === 'string' ? value : value.text();
  }
  async delete() {
    await transaction('files', 'readwrite', store => store.delete(this.name));
    entries.delete(this.name);
  }
}

export async function storeAudio(blob: Blob, importedName?: string, captureName?: string) {
  if (!blob.size) throw new Error('The selected audio is empty.');
  const extension = importedName || blob.type.startsWith('audio/mp4') ? 'm4a'
    : blob.type.startsWith('audio/webm') ? 'webm' : blob.type.startsWith('audio/ogg') ? 'ogg' : undefined;
  if (!extension) throw new Error('Unsupported browser recording format.');
  const name = (captureName ?? ((importedName ? 'Import' : 'Recording') + '-' + Date.now() + '-' + crypto.randomUUID())) + '.' + extension;
  const audio = { name, content: blob };
  const label = importedName ? { name: name + '.name', content: importedName } : undefined;
  await transaction('files', 'readwrite', store => {
    if (label) store.add(label, label.name);
    return store.add(audio, audio.name);
  });
  entries.set(name, audio);
  if (label) entries.set(label.name, label);
  return new File(recordings, name).uri;
}

// Read the disk version when reopening a document. The display index is an
// optimization and another tab can have saved an edit since it was populated.
export async function readSidecar(file: File) {
  const row: Entry | undefined = await transaction('files', 'readonly', store => store.get(file.name));
  if (!row) { entries.delete(file.name); return; }
  if (typeof row.content !== 'string') throw new Error('Local text is unreadable.');
  entries.set(file.name, row);
  return row.content;
}

export async function commitCompletion(recording: string, text: string, speakers?: SpeakerResult): Promise<CompletedTranscript> {
  const original = recording + '.original.txt';
  const metadata = recording + '.speakers.json';
  const db = await recorderDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('files', 'readwrite');
    const files = tx.objectStore('files');
    const read = files.get(original);
    const readMetadata = files.get(metadata);
    let result: CompletedTranscript;
    let failure: Error | undefined;
    readMetadata.onsuccess = () => {
      const previous = read.result as Entry | undefined;
      let saved = text, labels = speakers;
      if (previous) {
        if (typeof previous.content !== 'string' || !previous.content.trim()) {
          failure = new Error('The saved original transcript is unreadable.');
          tx.abort();
          return;
        }
        saved = previous.content;
        try { labels = parseSpeakerResult(JSON.parse(readMetadata.result?.content)); }
        catch { labels = undefined; }
      } else {
        files.add({ name: original, content: text }, original);
        if (speakers) files.put({ name: metadata, content: JSON.stringify(speakers) }, metadata);
        else files.delete(metadata);
      }
      result = { state: 'COMPLETED', transcript: saved, speakerLabeling: labels };
    };
    tx.oncomplete = () => {
      entries.set(original, { name: original, content: result.transcript });
      if (result.speakerLabeling) entries.set(metadata, { name: metadata, content: JSON.stringify(result.speakerLabeling) });
      else entries.delete(metadata);
      resolve(result);
    };
    tx.onabort = () => reject(failure ?? tx.error ?? new Error('Could not save the original.'));
  });
}

export async function saveText(file: File, content: string, expectedRevision?: string) {
  const row = { name: file.name, content };
  if (file.name.endsWith('.revision.txt')) {
    const db = await recorderDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('files', 'readwrite');
      const files = tx.objectStore('files');
      const read = files.get(file.name);
      let conflict = false;
      read.onsuccess = () => {
        if (read.result?.content !== expectedRevision) { conflict = true; tx.abort(); }
        else files.put(row, file.name);
      };
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(conflict
        ? new DOMException('Another tab saved a different revision. Copy your edits, then reopen the transcript to compare.', 'RevisionConflict')
        : tx.error ?? new Error('Could not save the revision.'));
    });
  } else {
    await transaction('files', 'readwrite', store => store.put(row, file.name));
  }
  entries.set(file.name, row);
}
