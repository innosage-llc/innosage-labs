import test from 'node:test';
import assert from 'node:assert/strict';
import { m4aDurationMillis } from './m4aDuration.ts';

function atom(type, data, extended = false) {
  const header = Buffer.alloc(extended ? 16 : 8);
  const size = header.length + data.length;
  header.writeUInt32BE(extended ? 1 : size);
  header.write(type, 4);
  if (extended) header.writeBigUInt64BE(BigInt(size), 8);
  return Buffer.concat([header, data]);
}
function duration(data) {
  return m4aDurationMillis(data.length, async (offset, length) => {
    assert.ok(length <= 32 && offset + length <= data.length);
    return data.subarray(offset, offset + length);
  });
}
for (const version of [0, 1]) {
  test('reads recorded duration from version ' + version + ' movie headers after media', async () => {
    const fields = Buffer.alloc(version ? 32 : 20);
    fields[0] = version;
    fields.writeUInt32BE(1000, version ? 20 : 12);
    if (version) fields.writeBigUInt64BE(12500n, 24);
    else fields.writeUInt32BE(12500, 16);
    const file = Buffer.concat([atom('mdat', Buffer.alloc(16000)), atom('moov', atom('mvhd', fields), true)]);
    assert.equal(await duration(file), 12500);
    fields.fill(255, version ? 24 : 16);
    assert.equal(await duration(atom('moov', atom('mvhd', fields))), undefined);
  });
}
test('handles malformed, truncated, and missing movie metadata', async () => {
  for (const invalid of [Buffer.alloc(6), Buffer.from([0,0,0,3,109,111,111,118]),
    atom('free', Buffer.alloc(0)), atom('moov', atom('mvhd', Buffer.alloc(3)))]) {
    assert.equal(await duration(invalid), undefined);
  }
});
