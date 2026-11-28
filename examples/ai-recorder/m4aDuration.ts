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
          const codec = await atom(read, samples.start + 8, samples.end, 'mp4a') ?? await atom(read, samples.start + 8, samples.end, 'alac');
          if (codec && codec.end - codec.start >= 28) audio = true;
        }
      }
    }
    offset = track.end;
  }
  return false;
}
