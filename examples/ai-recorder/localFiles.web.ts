import { transaction } from './browserDatabase.web';

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

export async function storeAudio(blob: Blob, importedName?: string) {
  if (!blob.size) throw new Error('The selected audio is empty.');
  const extension = importedName || blob.type.startsWith('audio/mp4') ? 'm4a'
    : blob.type.startsWith('audio/webm') ? 'webm' : blob.type.startsWith('audio/ogg') ? 'ogg' : undefined;
  if (!extension) throw new Error('Unsupported browser recording format.');
  const name = (importedName ? 'Import' : 'Recording') + '-' + Date.now() + '-' + crypto.randomUUID() + '.' + extension;
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

// IndexedDB commits each sidecar in one transaction. add() keeps the first
// original immutable even if two tabs receive completion at the same time.
export async function saveText(file: File, content: string) {
  const row = { name: file.name, content };
  if (file.name.endsWith('.original.txt')) {
    try {
      await transaction('files', 'readwrite', store => store.add(row, file.name));
    } catch (error) {
      if (!(error instanceof DOMException) || error.name !== 'ConstraintError') throw error;
      const existing: Entry | undefined = await transaction('files', 'readonly', store => store.get(file.name));
      if (existing) entries.set(file.name, existing);
      if (existing?.content !== content) throw new Error('An original transcript is already saved.');
      return;
    }
  } else {
    await transaction('files', 'readwrite', store => store.put(row, file.name));
  }
  entries.set(file.name, row);
}
