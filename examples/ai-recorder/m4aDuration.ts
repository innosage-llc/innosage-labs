// Movie duration, in the file's own time scale. Seek past audio payloads.
type ReadAt = (offset: number, length: number) => Promise<Uint8Array>;

async function atom(read: ReadAt, start: number, end: number, type: string) {
  for (let offset = start, count = 0; offset + 8 <= end && count < 256; count++) {
    const header = await read(offset, Math.min(16, end - offset));
    if (header.length < 8) return;
    const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
    let size = view.getUint32(0);
    const headerSize = size === 1 ? 16 : 8;
    if (size === 1) {
      if (header.length < 16) return;
      size = view.getUint32(8) * 0x100000000 + view.getUint32(12);
    } else if (size === 0) size = end - offset;
    if (!Number.isSafeInteger(size) || size < headerSize || size > end - offset) return;
    if (String.fromCharCode(...header.subarray(4, 8)) === type) {
      return { start: offset + headerSize, end: offset + size };
    }
    offset += size;
  }
}

export async function m4aDurationMillis(size: number, read: ReadAt) {
  const movie = await atom(read, 0, size, 'moov');
  if (!movie) return;
  const header = await atom(read, movie.start, movie.end, 'mvhd');
  if (!header) return;
  const data = await read(header.start, Math.min(32, header.end - header.start));
  const version = data[0];
  if (version !== 0 && version !== 1) return;
  const scaleOffset = version === 0 ? 12 : 20;
  if (data.length < (version === 0 ? 20 : 32)) return;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const scale = view.getUint32(scaleOffset);
  const ticks = version === 0 ? view.getUint32(16) : view.getUint32(24) * 0x100000000 + view.getUint32(28);
  if (scale && Number.isSafeInteger(ticks) && ticks > 0 && !(version === 0 && ticks === 0xffffffff)) {
    return ticks / scale * 1000;
  }
}

// Each MPEG-4 descriptor starts with a tag and a base-128 length (up to four
// bytes). mp4a is a container entry, not by itself an AAC codec declaration.
function descriptor(bytes: Uint8Array, offset: number, end: number, tag: number) {
  if (offset >= end || bytes[offset++] !== tag) return;
  let size = 0;
  for (let n = 0; n < 4 && offset < end; n++) {
    const value = bytes[offset++];
    size = size * 128 + (value & 127);
    if (!(value & 128)) return size <= end - offset ? { start: offset, end: offset + size } : undefined;
  }
}

async function declaresAAC(read: ReadAt, entry: {start: number; end: number}) {
  const header = await read(entry.start, 28);
  if (header.length < 28) return false;
  const version = (header[8] << 8) + header[9];
  if (version > 1) return false;
  const children = entry.start + (version === 1 ? 44 : 28);
  let esds = await atom(read, children, entry.end, 'esds');
  if (!esds) {
    const wave = await atom(read, children, entry.end, 'wave');
    if (wave) esds = await atom(read, wave.start, wave.end, 'esds');
  }
  if (!esds || esds.end - esds.start > 4096) return false;
  const data = await read(esds.start, esds.end - esds.start);
  const stream = descriptor(data, 4, data.length, 3);
  if (!stream || stream.end - stream.start < 3) return false;
  const flags = data[stream.start + 2];
  let offset = stream.start + 3;
  if (flags & 128) offset += 2;
  if (flags & 64) { if (offset >= stream.end) return false; offset += 1 + data[offset]; }
  if (flags & 32) offset += 2;
  const config = descriptor(data, offset, stream.end, 4);
  if (!config || config.end - config.start < 13 || (data[config.start + 1] >> 2) !== 5) return false;
  const objectType = data[config.start];
  if ([0x66, 0x67, 0x68].includes(objectType)) return true; // MPEG-2 AAC profiles.
  if (objectType !== 0x40) return false;
  const asc = descriptor(data, config.start + 13, config.end, 5);
  return !!asc && asc.end - asc.start >= 2 && [1, 2, 3, 4, 5, 17, 23, 29].includes(data[asc.start] >> 3);
}

// A suffix or reported MIME type cannot distinguish renamed WebM, video MP4,
// or arbitrary data. Walk bounded atom headers; never buffer media payloads.
export async function hasMP4AudioTrack(size: number, read: ReadAt) {
  if (!await atom(read, 0, size, 'ftyp')) return false;
  const payload = await atom(read, 0, size, 'mdat');
  if (!payload || payload.end <= payload.start) return false;
  const movie = await atom(read, 0, size, 'moov');
  if (!movie) return false;
  let audio = false;
  let offset = movie.start;
  for (let n = 0; n < 64; n++) {
    const track = await atom(read, offset, movie.end, 'trak');
    if (!track) return audio;
    const media = await atom(read, track.start, track.end, 'mdia');
    const handler = media && await atom(read, media.start, media.end, 'hdlr');
    if (handler && handler.end - handler.start >= 12) {
      const type = String.fromCharCode(...await read(handler.start + 8, 4));
      if (type === 'vide') return false;
      if (type === 'soun' && media) {
        const info = await atom(read, media.start, media.end, 'minf');
        const table = info && await atom(read, info.start, info.end, 'stbl');
        const samples = table && await atom(read, table.start, table.end, 'stsd');
        if (samples && samples.end - samples.start >= 8) {
          const prefix = await read(samples.start, 8);
          if (prefix.length !== 8 || !new DataView(prefix.buffer, prefix.byteOffset, prefix.byteLength).getUint32(4)) return false;
          const aac = await atom(read, samples.start + 8, samples.end, 'mp4a');
          const alac = await atom(read, samples.start + 8, samples.end, 'alac');
          if (aac && aac.end - aac.start >= 28 && await declaresAAC(read, aac)) audio = true;
          if (alac && alac.end - alac.start >= 28 && await atom(read, alac.start + 28, alac.end, 'alac')) audio = true;
        }
      }
    }
    offset = track.end;
  }
  return false;
}
