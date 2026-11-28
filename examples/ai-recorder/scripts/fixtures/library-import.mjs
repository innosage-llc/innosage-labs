import assert from 'node:assert/strict';

export function noPlayableSamples(audio) {
  const atom = (type, payload) => {
    const header = Buffer.alloc(8);
    header.writeUInt32BE(8 + payload.length);
    header.write(type, 4);
    return Buffer.concat([header, payload]);
  };
  // A forged positive duration and codec declaration do not supply a playable AAC sample.
  const ftyp = atom('ftyp', Buffer.from('isom0000'));
  const movieHeader = Buffer.alloc(28); movieHeader.writeUInt32BE(1000, 12); movieHeader.writeUInt32BE(3000, 16);
  const handler = atom('hdlr', Buffer.concat([Buffer.alloc(8), Buffer.from('soun')]));
  const codecStart = audio.indexOf('mp4a') - 4;
  assert.ok(codecStart > 0);
  const realAACDeclaration = audio.subarray(codecStart, codecStart + audio.readUInt32BE(codecStart));
  const stsd = atom('stsd', Buffer.concat([Buffer.from([0,0,0,0,0,0,0,1]), realAACDeclaration]));
  const mdia = atom('mdia', Buffer.concat([handler, atom('minf', atom('stbl', stsd))]));
  return Buffer.concat([ftyp, atom('moov', Buffer.concat([atom('mvhd', movieHeader), atom('trak', mdia)])), atom('mdat', Buffer.from([0]))]);
}
