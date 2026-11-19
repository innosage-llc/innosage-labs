// Local #101 diagnostic. It checks the emulator speaker stream, not a saved file.
import { constants, connect } from 'node:http2';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { BUNDLE, requireThat, sha, writeJSON } from '../../../scripts/recorder-gate/core.mjs';
import { git, outDir, runAsync } from '../../../scripts/recorder-gate/host.mjs';
import { xmlControl } from '../../../scripts/recorder-gate/android.mjs';

const rate = 16_000;
const tones = { A: [440, 587, 740, 495], B: [880, 1175, 1480, 990] };
const frequencies = [...tones.A, ...tones.B];
const service = '/android.emulation.control.EmulatorController/';

// The installed emulator_controller.proto uses AudioFormat field 1 for rate,
// field 3 for signed 16-bit samples, and defaults to mono. AudioPacket field 3
// contains little-endian PCM. The other fields carry format and a timestamp.
const monoFormat = Buffer.from([0x08, 0x80, 0x7d, 0x18, 0x01]);
function pcmFromPacket(packet) {
  let offset = 0;
  function varint() {
    let value = 0;
    for (let shift = 0; shift < 56 && offset < packet.length; shift += 7) {
      const byte = packet[offset++];
      value += (byte & 127) * 2 ** shift;
      if (byte < 128) return value;
    }
    throw new Error('Invalid audio packet varint');
  }
  let pcm;
  while (offset < packet.length) {
    const tag = varint();
    if (tag === 16) {
      varint();
    } else {
      requireThat(tag === 10 || tag === 26, 'Unexpected audio packet field');
      const end = varint() + offset;
      requireThat(end <= packet.length, 'Truncated audio packet');
      if (tag === 26) pcm = packet.subarray(offset, end);
      offset = end;
    }
  }
  requireThat(pcm?.length && pcm.length % 2 === 0, 'Missing or invalid PCM frame');
  return pcm;
}

function rpc(session, token, method, message, ms, onPacket) {
  const stream = session.request({
    ':method': 'POST', ':path': service + method, 'content-type': 'application/grpc',
    te: 'trailers', authorization: 'Bearer ' + token,
  });
  let pending = Buffer.alloc(0);
  let status;
  let expired = false;
  const done = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      expired = true;
      stream.close(constants.NGHTTP2_CANCEL);
    }, ms);
    const acceptStatus = headers => {
      if (headers['grpc-status'] !== undefined) status = headers['grpc-status'];
      if (status !== undefined && status !== '0') {
        // Headers can contain the local auth token. Only retain the code.
        reject(new Error(`${method} gRPC code ${status}`));
        stream.close(constants.NGHTTP2_CANCEL);
      }
    };
    stream.on('response', acceptStatus);
    stream.on('trailers', acceptStatus);
    stream.on('data', data => {
      try {
        pending = Buffer.concat([pending, data]);
        while (pending.length >= 5) {
          const size = pending.readUInt32BE(1);
          requireThat(pending[0] === 0 && size <= 65_536, 'Invalid gRPC audio frame');
          if (pending.length < 5 + size) break;
          onPacket(pending.subarray(5, 5 + size));
          pending = pending.subarray(5 + size);
        }
      } catch (error) {
        reject(error);
        stream.close(constants.NGHTTP2_CANCEL);
      }
    });
    stream.on('error', reject);
    stream.on('close', () => {
      clearTimeout(timer);
      if (expired && method === 'streamAudio') resolve();
      else if (status === '0' && !pending.length) resolve();
      else reject(new Error(`${method} closed before a complete response`));
    });
  });
  const frame = Buffer.alloc(5 + message.length);
  frame.writeUInt32BE(message.length, 1);
  message.copy(frame, 5);
  stream.end(frame);
  return done;
}

function fixture(name) {
  const seconds = 7;
  const pcm = Buffer.alloc(rate * seconds * 2);
  for (let index = 0; index < rate * seconds && name !== 'silence'; index++) {
    const slot = Math.floor(index / 5600);
    const phase = (index % 5600) / 5600;
    const envelope = Math.min(1, phase / 0.03, (1 - phase) / 0.03);
    const frequency = tones[name][slot % tones[name].length];
    pcm.writeInt16LE(Math.round(14_000 * envelope * Math.sin(2 * Math.PI * frequency * index / rate)), 2 * index);
  }
  const header = Buffer.from('524946460000000057415645666d74201000000001000100803e0000007d0000020010006461746100000000', 'hex');
  header.writeUInt32LE(pcm.length + 36, 4);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function score(pcm) {
  requireThat(pcm.length % 2 === 0, 'Expected raw mono s16le');
  const size = rate / 10;
  const coefficients = frequencies.map(frequency => 2 * Math.cos(2 * Math.PI * frequency / rate));
  const hits = Object.fromEntries(frequencies.map(frequency => [frequency, 0]));
  for (let offset = 0; offset + size * 2 <= pcm.length; offset += size * 2) {
    const samples = Array.from({ length: size }, (_, index) => pcm.readInt16LE(offset + 2 * index));
    const energy = samples.reduce((sum, value) => sum + value ** 2, 0);
    for (const [index, coefficient] of coefficients.entries()) {
      let s1 = 0;
      let s2 = 0;
      for (const sample of samples) [s1, s2] = [sample + coefficient * s1 - s2, s1];
      const power = 4 * (s1 ** 2 + s2 ** 2 - coefficient * s1 * s2) / size ** 2;
      if (power >= 120 ** 2 && power * size > energy) hits[frequencies[index]]++;
    }
  }
  const matches = Object.entries(tones).filter(([, frequencies]) => frequencies.every(f => hits[f] >= 2));
  return { samples: pcm.length / 2, hits, marker: matches.length === 1 ? matches[0][0] : null };
}

async function observe([adbPort, serial, avd, pid, label, expected, output]) {
  requireThat(process.platform === 'darwin' && /^emulator-\d+$/.test(serial) && /^labs85-[\w-]+$/.test(avd),
    'Use a dedicated labs85- Android Emulator on macOS');
  requireThat(/^\d+$/.test(adbPort) && Number(adbPort) > 1024 && Number(adbPort) <= 65_535 && Number(adbPort) !== 5037,
    'Use a dedicated ADB server port');
  requireThat(/^\d+$/.test(pid) && Number(pid) > 1 && label?.startsWith('Play ') && ['A', 'B'].includes(expected) && output,
    'Explicit emulator PID, Library Play label, expected marker and evidence directory required');
  const ini = readFileSync(join(homedir(), 'Library/Caches/TemporaryItems/avd/running', `pid_${pid}.ini`), 'utf8');
  const properties = Object.fromEntries(ini.split(/\r?\n/).filter(line => line.includes('='))
    .map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
  const port = Number(properties['grpc.port']);
  requireThat(properties['avd.name'] === avd && properties['port.serial'] === serial.slice(9) &&
    properties['grpc.token'] && Number.isInteger(port) && port > 1024 && port <= 65_535, 'Audio endpoint identity mismatch');
  process.kill(Number(pid), 0);
  const out = outDir(output);
  const receipt = { head: git('rev-parse', 'HEAD'), avd, serial, rate, label, expected, status: 'FAIL' };
  const began = performance.now();
  const adb = (...args) => runAsync('adb', ['-H', 'localhost', '-P', adbPort, '-s', serial, ...args], { timeout: 13_000 });
  let session;
  try {
    requireThat((await adb('shell', 'getprop', 'ro.kernel.qemu')).trim() === '1' &&
      (await adb('emu', 'avd', 'name')).split(/\r?\n/)[0] === avd, 'Wrong Android target');
    receipt.api = (await adb('shell', 'getprop', 'ro.build.version.sdk')).trim();
    receipt.emulator = properties['emulator.version'];
    const initialPid = (await adb('shell', 'pidof', BUNDLE)).trim();
    requireThat(/^\d+$/.test(initialPid), 'AI Recorder process missing');
    async function assertOffline() {
      requireThat((await adb('shell', 'settings', 'get', 'global', 'airplane_mode_on')).trim() === '1' &&
        /Active default network: none/.test(await adb('shell', 'dumpsys', 'connectivity')),
      'Set the dedicated emulator offline first');
    }
    await assertOffline();
    await adb('shell', 'uiautomator', 'dump', '--compressed', '/data/local/tmp/labs101.xml');
    const xml = await adb('shell', 'cat', '/data/local/tmp/labs101.xml');
    writeFileSync(join(out, 'library.xml'), xml);
    requireThat(xml.includes(`package="${BUNDLE}"`), 'AI Recorder must be showing Library');
    const control = xmlControl(xml, label);
    requireThat(control, 'Library Play control missing');
    session = connect(`http://127.0.0.1:${port}`);
    session.on('error', () => {}); // Per-stream failure is recorded by rpc().
    const token = properties['grpc.token'];
    let microphoneOff = false;
    await rpc(session, token, 'getMicrophoneState', Buffer.alloc(0), 3000, frame => {
      microphoneOff = frame.length === 0 || frame.equals(Buffer.from([8, 0]));
    });
    requireThat(microphoneOff, 'Host microphone passthrough is not verified off');
    const chunks = [];
    let count = 0;
    const capture = rpc(session, token, 'streamAudio', monoFormat, 10_000, frame => {
      const pcm = pcmFromPacket(frame);
      count += pcm.length;
      requireThat(count <= rate * 2 * 20, 'Speaker capture exceeded expected size');
      chunks.push(pcm);
    });
    try {
      await Promise.race([capture.then(() => { throw new Error('Speaker stream ended before Play'); }),
        new Promise(resolve => setTimeout(resolve, 300))]);
      await adb('shell', 'input', 'tap', String(control.x), String(control.y));
      await capture;
    } finally {
      const pcm = Buffer.concat(chunks);
      writeFileSync(join(out, 'speaker.pcm'), pcm);
      receipt.pcm = { bytes: pcm.length, sha256: sha(pcm), ...score(pcm) };
    }
    requireThat(receipt.pcm.samples >= rate, 'Missing speaker PCM');
    await assertOffline();
    requireThat((await adb('shell', 'pidof', BUNDLE)).trim() === initialPid, 'AI Recorder process changed');
    requireThat(receipt.pcm.marker === expected, `Expected audible ${expected}, observed ${receipt.pcm.marker ?? 'no marker'}`);
    receipt.status = 'PASS';
  } catch (error) {
    receipt.error = error.message;
    throw error;
  } finally {
    session?.destroy();
    receipt.elapsed_ms = Math.round(performance.now() - began);
    writeJSON(join(out, 'result.json'), receipt);
  }
}

try {
  const [mode, ...args] = process.argv.slice(2);
  if (mode === 'fixture' && args.length === 2 && ['A', 'B', 'silence'].includes(args[0])) {
    writeFileSync(args[1], fixture(args[0]), { flag: 'wx' });
  } else if (mode === 'score' && args.length === 2 && ['A', 'B'].includes(args[0])) {
    const result = score(readFileSync(args[1]));
    console.log(JSON.stringify({ expected: args[0], ...result }));
    process.exitCode = result.marker === args[0] ? 0 : 1;
  } else if (mode === 'observe' && args.length === 7) {
    await observe(args);
  } else {
    throw new Error('Use fixture <A|B|silence> <wav>, score <A|B> <pcm>, or observe <adb-port> <serial> <avd> <emulator-pid> <Play label> <A|B> <new-output>');
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
