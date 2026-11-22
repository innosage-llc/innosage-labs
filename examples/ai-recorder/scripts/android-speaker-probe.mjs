// Local #101 journey and speaker diagnostic for the dedicated Android Emulator.
import { constants, connect } from 'node:http2';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
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
  let format;
  while (offset < packet.length) {
    const tag = varint();
    if (tag === 16) {
      varint();
    } else {
      requireThat(tag === 10 || tag === 26, 'Unexpected audio packet field');
      const end = varint() + offset;
      requireThat(end <= packet.length, 'Truncated audio packet');
      if (tag === 26) pcm = packet.subarray(offset, end);
      else format = packet.subarray(offset, end);
      offset = end;
    }
  }
  requireThat(pcm?.length && pcm.length % 2 === 0, 'Missing or invalid PCM frame');
  // Mono is the protobuf default. Some emulator builds include the explicit zero.
  if (format) requireThat(format.equals(monoFormat) ||
    format.equals(Buffer.from([0x08, 0x80, 0x7d, 0x10, 0, 0x18, 1])), 'Speaker format differs from 16 kHz mono s16le');
  return { pcm, format: Boolean(format) };
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
  function frame(payload) {
    const header = Buffer.alloc(5);
    header.writeUInt32BE(payload.length, 1);
    return Buffer.concat([header, payload]);
  }
  if (Buffer.isBuffer(message)) {
    stream.end(frame(message));
  } else {
    (async () => {
      try {
        for await (const packet of message) {
          if (stream.closed) return;
          stream.write(frame(packet));
        }
        stream.end();
      } catch (error) {
        stream.destroy(error);
      }
    })();
  }
  return done;
}

function makePcm(name, sampleRate, seconds) {
  const pcm = Buffer.alloc(sampleRate * seconds * 2);
  const slotLength = sampleRate * 0.35;
  for (let index = 0; index < sampleRate * seconds && name !== 'silence'; index++) {
    const slot = Math.floor(index / slotLength);
    const phase = (index % slotLength) / slotLength;
    const envelope = Math.min(1, phase / 0.03, (1 - phase) / 0.03);
    const frequency = tones[name][slot % tones[name].length];
    pcm.writeInt16LE(Math.round(14_000 * envelope * Math.sin(2 * Math.PI * frequency * index / sampleRate)), 2 * index);
  }
  return pcm;
}

function fixture(name) {
  const pcm = makePcm(name, rate, 7);
  const header = Buffer.from('524946460000000057415645666d74201000000001000100803e0000007d0000020010006461746100000000', 'hex');
  header.writeUInt32LE(pcm.length + 36, 4);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function score(pcm) {
  requireThat(pcm.length % 2 === 0, 'Expected raw mono s16le');
  let peak = 0;
  for (let offset = 0; offset < pcm.length; offset += 2) peak = Math.max(peak, Math.abs(pcm.readInt16LE(offset)));
  const size = rate / 10;
  // Emulator playback can shift a tone by a few Hz through clock correction
  // and resampling. Search non-overlapping bands around the fixture tones.
  const bands = frequencies.map(frequency => [-20, -15, -10, -5, 0, 5, 10, 15, 20]
    .map(offset => 2 * Math.cos(2 * Math.PI * (frequency + offset) / rate)));
  const hits = Object.fromEntries(frequencies.map(frequency => [frequency, 0]));
  for (let offset = 0; offset + size * 2 <= pcm.length; offset += size * 2) {
    const samples = Array.from({ length: size }, (_, index) => pcm.readInt16LE(offset + 2 * index));
    const energy = samples.reduce((sum, value) => sum + value ** 2, 0);
    for (const [index, band] of bands.entries()) {
      for (const coefficient of band) {
        let s1 = 0;
        let s2 = 0;
        for (const sample of samples) [s1, s2] = [sample + coefficient * s1 - s2, s1];
        const power = 4 * (s1 ** 2 + s2 ** 2 - coefficient * s1 * s2) / size ** 2;
        if (power >= 120 ** 2 && power * size > energy) {
          hits[frequencies[index]]++;
          break;
        }
      }
    }
  }
  const matches = Object.entries(tones).filter(([, frequencies]) => frequencies.every(f => hits[f] >= 2));
  return { samples: pcm.length / 2, peak, hits, marker: matches.length === 1 ? matches[0][0] : null };
}

function target(adbPort, serial, avd, pid) {
  requireThat(process.platform === 'darwin' && /^emulator-\d+$/.test(serial) && /^labs85-[\w-]+$/.test(avd),
    'Use a dedicated labs85- Android Emulator on macOS');
  requireThat(/^\d+$/.test(adbPort) && Number(adbPort) > 1024 && Number(adbPort) <= 65_535 && Number(adbPort) !== 5037,
    'Use a dedicated ADB server port');
  requireThat(/^\d+$/.test(pid) && Number(pid) > 1, 'Explicit emulator PID required');
  const ini = readFileSync(join(homedir(), 'Library/Caches/TemporaryItems/avd/running', `pid_${pid}.ini`), 'utf8');
  const properties = Object.fromEntries(ini.split(/\r?\n/).filter(line => line.includes('='))
    .map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
  const port = Number(properties['grpc.port']);
  requireThat(properties['avd.name'] === avd && properties['port.serial'] === serial.slice(9) &&
    properties['grpc.token'] && Number.isInteger(port) && port > 1024 && port <= 65_535, 'Audio endpoint identity mismatch');
  process.kill(Number(pid), 0);
  const adb = (...args) => runAsync('adb', ['-H', '127.0.0.1', '-P', adbPort, '-s', serial, ...args], { timeout: 20_000 });
  return { adb, port, token: properties['grpc.token'], avd, serial, pid, emulator: properties['emulator.version'] };
}

async function assertTarget({ adb, avd }) {
  requireThat((await adb('shell', 'getprop', 'ro.kernel.qemu')).trim() === '1' &&
    (await adb('emu', 'avd', 'name')).split(/\r?\n/)[0] === avd, 'Wrong Android target');
}

async function assertOffline(adb) {
  requireThat((await adb('shell', 'settings', 'get', 'global', 'airplane_mode_on')).trim() === '1' &&
    /Active default network: none/.test(await adb('shell', 'dumpsys', 'connectivity')),
  'Set the dedicated emulator offline first');
}

async function tree(adb) {
  const path = '/data/local/tmp/labs101.xml';
  const dump = await adb('shell', 'uiautomator', 'dump', '--compressed', path);
  requireThat(dump.includes('dumped to:'), 'Fresh UI hierarchy unavailable');
  return adb('shell', 'cat', path);
}

function press(adb, xml, label) {
  const control = xmlControl(xml, label);
  requireThat(control, `Control missing: ${label}`);
  return adb('shell', 'input', 'tap', String(control.x), String(control.y));
}

async function onAudio({ port, token }, use) {
  const session = connect(`http://127.0.0.1:${port}`);
  session.on('error', () => {}); // Per-stream failure is recorded by rpc().
  try {
    let microphoneOff = false;
    await rpc(session, token, 'getMicrophoneState', Buffer.alloc(0), 3000, frame => {
      microphoneOff = frame.length === 0 || frame.equals(Buffer.from([8, 0]));
    });
    requireThat(microphoneOff, 'Host microphone passthrough is not verified off');
    return await use(session, token);
  } finally {
    session.destroy();
  }
}

async function listen(device, output, label, xml, duration = 10_000) {
  const chunks = [];
  const prefix = [];
  let playing = !label;
  let count = 0;
  let declaredFormat = false;
  const pcmPath = join(output, 'speaker.pcm');
  try {
    await onAudio(device, async (session, token) => {
      const capture = rpc(session, token, 'streamAudio', monoFormat, duration, frame => {
        const packet = pcmFromPacket(frame);
        count += packet.pcm.length;
        requireThat(count <= rate * 2 * 30, 'Speaker capture exceeded expected size');
        declaredFormat ||= packet.format;
        (playing ? chunks : prefix).push(packet.pcm);
      });
      if (label) {
        await Promise.race([capture.then(() => { throw new Error('Speaker stream ended before Play'); }), delay(300)]);
        await press(device.adb, xml, label);
        playing = true;
      }
      await capture;
    });
  } finally {
    writeFileSync(pcmPath, Buffer.concat(chunks));
    if (label) writeFileSync(join(output, 'before-play.pcm'), Buffer.concat(prefix));
  }
  const pcm = Buffer.concat(chunks);
  const before = score(Buffer.concat(prefix));
  requireThat(before.marker === null, 'A marker appeared before Play');
  return { bytes: pcm.length, sha256: sha(pcm), declared_format: declaredFormat,
    before_play_samples: before.samples, ...score(pcm) };
}

function assertMarker(pcm, expected) {
  requireThat(pcm.samples >= rate / 2, 'Missing speaker PCM');
  requireThat(pcm.marker === expected, `Expected audible ${expected}, observed ${pcm.marker ?? 'no marker'}`);
}

async function observe([adbPort, serial, avd, pid, label, expected, output]) {
  requireThat(label?.startsWith('Play ') && ['A', 'B'].includes(expected) && output,
    'Library Play label, expected marker and evidence directory required');
  const device = target(adbPort, serial, avd, pid);
  const { adb } = device;
  const out = outDir(output);
  const receipt = { head: git('rev-parse', 'HEAD'), avd, serial, rate, label, expected, status: 'FAIL' };
  const began = performance.now();
  try {
    await assertTarget(device);
    receipt.api = (await adb('shell', 'getprop', 'ro.build.version.sdk')).trim();
    receipt.emulator = device.emulator;
    const initialPid = (await adb('shell', 'pidof', BUNDLE)).trim();
    requireThat(/^\d+$/.test(initialPid), 'AI Recorder process missing');
    await assertOffline(adb);
    const xml = await tree(adb);
    writeFileSync(join(out, 'library.xml'), xml);
    requireThat(xml.includes(`package="${BUNDLE}"`), 'AI Recorder must be showing Library');
    requireThat(xmlControl(xml, label), 'Library Play control missing');
    receipt.pcm = await listen(device, out, label, xml);
    await assertOffline(adb);
    requireThat((await adb('shell', 'pidof', BUNDLE)).trim() === initialPid, 'AI Recorder process changed');
    assertMarker(receipt.pcm, expected);
    receipt.status = 'PASS';
  } catch (error) {
    receipt.error = error.message;
    throw error;
  } finally {
    receipt.elapsed_ms = Math.round(performance.now() - began);
    writeJSON(join(out, 'result.json'), receipt);
  }
}

async function* microphonePackets(marker, seconds) {
  const pcm = makePcm(marker, 48_000, seconds);
  // AEMU AudioPacket field 1: 48 kHz mono signed 16-bit format.
  // Field 3: 1,920 bytes of audio, or exactly 20 ms.
  const header = Buffer.from([0x0a, 0x06, 0x08, 0x80, 0xf7, 0x02, 0x18, 0x01, 0x1a, 0x80, 0x0f]);
  for (let offset = 0; offset < pcm.length; offset += 1920) {
    yield Buffer.concat([header, pcm.subarray(offset, offset + 1920)]);
    await delay(20);
  }
}

// AppOps confirms the installed app's actual native recorder is active. UI
// hierarchy dumps can take several seconds while the recording timer runs.
async function startRecording(adb) {
  await press(adb, await tree(adb), 'Start recording');
  for (let round = 0; round < 3; round++) {
    for (let i = 0; i < 10; i++) {
      const state = await adb('shell', 'cmd', 'appops', 'get', BUNDLE, 'RECORD_AUDIO');
      if (/\(running\)/.test(state)) {
        await delay(1000);
        const settled = await adb('shell', 'cmd', 'appops', 'get', BUNDLE, 'RECORD_AUDIO');
        requireThat(/\(running\)/.test(settled), 'Recorder did not stay active before injection');
        return settled.trim();
      }
      await delay(200);
    }
    const xml = await tree(adb);
    if (xmlControl(xml, 'While using the app')) await press(adb, xml, 'While using the app');
    else if (xml.includes('send you notifications?')) await press(adb, xml, 'Don’t allow');
    else throw new Error('Native recorder did not start');
  }
  throw new Error('Native recorder app-op never became active');
}

function playLabels(xml) {
  return [...xml.matchAll(/content-desc="(Play [^"]+)"/g)].map(match => match[1]);
}

function captureRows(xml) {
  // This journey creates only new recordings. Their accessible row names start with the displayed time.
  return [...xml.matchAll(/content-desc="((\d{1,2}:\d{2}(?::\d{2})?(?:\s*(?:AM|PM))?)(?:, [^"]+)?)"/gi)]
    .map(([, row, title]) => ({ row, title, bounds: xmlControl(xml, row) }))
    .filter(item => item.bounds)
    .sort((a, b) => a.bounds.y - b.bounds.y);
}

async function journey([adbPort, serial, avd, pid, apk, output], detail = false) {
  requireThat(apk && output, 'Explicit Release APK and new evidence directory required');
  const device = target(adbPort, serial, avd, pid);
  const { adb } = device;
  const out = outDir(output);
  const receipt = {
    head: git('rev-parse', 'HEAD'), avd, serial, emulator: device.emulator,
    apk_sha256: sha(readFileSync(apk)), speaker_rate: rate, injection_rate: 48_000, primer_seconds: 2,
    journey: detail ? 'repeat-capture-detail' : 'library-inline', status: 'FAIL', controls: {},
  };
  const began = performance.now();
  const forceStop = () => adb('shell', 'am', 'force-stop', BUNDLE);
  const pidof = async () => (await adb('shell', 'pidof', BUNDLE)).trim();
  function screenshot(name) {
    if (!detail) return;
    const png = execFileSync('adb', ['-H', '127.0.0.1', '-P', adbPort, '-s', serial, 'exec-out', 'screencap', '-p'],
      { timeout: 15_000, maxBuffer: 12 * 1024 * 1024 });
    requireThat(png.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')), `Missing PNG for ${name}`);
    writeFileSync(join(out, `${name}.png`), png);
    receipt.screenshots ??= {};
    receipt.screenshots[name] = sha(png);
  }
  async function launch() {
    const result = await adb('shell', 'am', 'start', '-W', '-a', 'android.intent.action.MAIN',
      '-c', 'android.intent.category.LAUNCHER', '-n', `${BUNDLE}/.MainActivity`);
    requireThat(result.includes('Status: ok') && result.includes('LaunchState: COLD'), 'Cold launch was not observed');
  }
  async function readLibrary(name) {
    await press(adb, await tree(adb), 'Library');
    const xml = await tree(adb);
    writeFileSync(join(out, `${name}.xml`), xml);
    screenshot(name);
    return xml;
  }
  async function control(kind, label, xml, duration = label ? 15_000 : 2500) {
    const directory = outDir(join(out, kind));
    const pcm = await listen(device, directory, label, xml, duration);
    receipt.controls[kind] = pcm;
    return pcm;
  }
  function rejectB(pcm, description) {
    try {
      assertMarker(pcm, 'B');
    } catch (error) {
      receipt.controls[description].rejection = error.message;
      return;
    }
    throw new Error(`${description} passed the B assertion`);
  }
  try {
    await assertTarget(device);
    const cmd = await runAsync('ps', ['-wwE', '-p', pid, '-o', 'command='], { timeout: 3000 });
    requireThat(/(?:^|\s)QEMU_AUDIO_IN_DRV=none(?:\s|$)/.test(cmd) &&
      /(?:^|\s)-audio none(?:\s|$)/.test(cmd) && !/(?:^|\s)-allow-host-audio(?:\s|$)/.test(cmd) &&
      !/(?:^|\s)QEMU_AUDIO_DRV=/.test(cmd), 'Use the qualified synthetic-only input backend');
    receipt.guest = (await adb('shell', 'getprop', 'ro.build.fingerprint')).trim();
    requireThat((await adb('shell', 'wm', 'size')).trim() === 'Physical size: 1080x2400' &&
      (await adb('shell', 'wm', 'density')).trim() === 'Physical density: 420',
    'Journey requires the task Pixel 8 display profile');
    await assertOffline(adb);
    await adb('install', '-r', apk);
    await forceStop();
    await launch();
    const empty = await readLibrary('initial-library');
    requireThat(empty.includes('Your recordings live here') && !playLabels(empty).length && !captureRows(empty).length,
      'Use an empty task-only Recorder Library');
    await press(adb, empty, 'Record');
    const labels = new Map();
    const startControl = detail ? xmlControl(await tree(adb), 'Start recording') : { x: 540, y: 1525 };
    requireThat(startControl, 'Start recording is missing');
    for (const marker of ['A', 'B']) {
      receipt.stage = `record-${marker}`;
      await assertOffline(adb);
      receipt[`recording_${marker}`] = await startRecording(adb);
      const inject = (name, seconds) => onAudio(device, (session, token) =>
        rpc(session, token, 'injectAudio', microphonePackets(name, seconds), (seconds + 8) * 1000, () => {}));
      // Initialize the virtual input with silence while the same native
      // recording is active. Close that stream before opening the marker feed.
      receipt.stage = `prime-${marker}`;
      await inject('silence', 2);
      receipt.stage = `inject-${marker}`;
      await inject(marker, 8);
      // The input RPC has completed and its connection is closed before save/playback.
      receipt.stage = `stop-${marker}`;
      // The timer can keep UIAutomator from reaching idle. In the redesigned
      // layout the idle center is also inside the active control's hit area.
      await adb('shell', 'input', 'tap', String(startControl.x), String(startControl.y));
      const saved = await tree(adb);
      writeFileSync(join(out, `saved-${marker}.xml`), saved);
      requireThat(saved.includes('Saved on this device'), `Save ${marker} was not confirmed`);
      if (detail) {
        const nextCapture = xmlControl(saved, 'Start recording');
        requireThat(nextCapture && Math.abs(nextCapture.x - startControl.x) <= 4 && Math.abs(nextCapture.y - startControl.y) <= 4,
          'Start recording moved or disappeared after save');
        receipt[`restart_control_${marker}`] = nextCapture;
        screenshot(`saved-${marker}`);
        continue;
      }
      const library = await readLibrary(`library-${marker}`);
      const rows = playLabels(library);
      const added = rows.filter(label => ![...labels.values()].includes(label));
      requireThat(rows.length === labels.size + 1 && added.length === 1 && new Set(rows).size === rows.length,
        `Library did not add exactly one distinct row for ${marker}`);
      labels.set(marker, added[0]);
      if (marker === 'A') await press(adb, library, 'Record');
    }
    if (!detail) receipt.labels = Object.fromEntries(labels);
    receipt.stage = 'restart';
    receipt.before_pid = await pidof();
    requireThat(/^\d+$/.test(receipt.before_pid), 'Recorder PID missing before stop');
    await forceStop();
    const gone = await pidof().then(() => false, error => error.status === 1 && !error.stdout?.trim() && !error.stderr?.trim());
    requireThat(gone, 'Actual app process termination was not confirmed');
    await assertOffline(adb);
    await launch();
    receipt.after_pid = await pidof();
    requireThat(/^\d+$/.test(receipt.after_pid) && receipt.after_pid !== receipt.before_pid, 'New process was not observed');
    const library = await readLibrary('reopened-library');
    if (detail) {
      const rows = captureRows(library);
      requireThat(rows.length === 2 && rows[0].title !== rows[1].title, 'Both distinct saved rows must survive cold reopen');
      requireThat(!playLabels(library).length && !library.includes('content-desc="Share audio') &&
        !library.includes('content-desc="Transcript for '), 'Library exposes per-recording actions');
      receipt.labels = { A: rows[1].title, B: rows[0].title };
      receipt.stage = 'open-earlier';
      const quiet = await control('open-A', rows[1].row, library, 3500);
      requireThat(quiet.samples >= rate / 2 && quiet.peak <= 64 && quiet.marker === null,
        'Opening the earlier row did not stay silent');
      const earlier = await tree(adb);
      writeFileSync(join(out, 'earlier-detail.xml'), earlier);
      screenshot('earlier-detail');
      requireThat(xmlControl(earlier, `Share audio for ${rows[1].title}`) &&
        xmlControl(earlier, `Transcript for ${rows[1].title}`), 'Earlier detail actions are missing');
      receipt.stage = 'play-earlier';
      assertMarker(await control('A', `Play ${rows[1].title}`, earlier), 'A');
      await press(adb, await tree(adb), 'Back to Library');
      const returned = await tree(adb);
      requireThat(captureRows(returned).some(item => item.title === rows[1].title), 'Top Back did not restore Library');
      await press(adb, returned, rows[0].row);
      const later = await tree(adb);
      receipt.stage = 'play-later-control';
      assertMarker(await control('B', `Play ${rows[0].title}`, later), 'B');
      await adb('shell', 'input', 'keyevent', '4');
      requireThat(captureRows(await tree(adb)).length === 2, 'System Back did not restore Library');
    } else {
      requireThat(playLabels(library).length === 2 && [...labels.values()].every(label => xmlControl(library, label)),
        'Both distinct saved rows must survive cold reopen');
      receipt.stage = 'speaker-controls';
      const quiet = await control('silence', null, library);
      requireThat(quiet.samples >= rate / 2 && quiet.peak <= 64 && quiet.marker === null,
        'Speaker silence was not observed before playback');
      rejectB(quiet, 'silence');
      assertMarker(await control('B', labels.get('B'), library), 'B');
      const idle = await tree(adb);
      requireThat(xmlControl(idle, labels.get('B')) && xmlControl(idle, labels.get('A')), 'B playback did not finish');
      const stale = await control('stale-A', labels.get('A'), idle);
      assertMarker(stale, 'A');
      rejectB(stale, 'stale-A');
    }
    await assertOffline(adb);
    requireThat(await pidof() === receipt.after_pid, 'Recorder restarted during playback');
    receipt.stage = 'complete';
    receipt.status = 'PASS';
  } catch (error) {
    receipt.error = error.message;
    throw error;
  } finally {
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
  } else if (['journey', 'journey-detail'].includes(mode) && args.length === 6) {
    await journey(args, mode === 'journey-detail');
  } else {
    throw new Error('Use fixture <A|B|silence> <wav>, score <A|B> <pcm>, observe <adb-port> <serial> <avd> <emulator-pid> <Play label> <A|B> <new-output>, or journey/journey-detail <adb-port> <serial> <avd> <emulator-pid> <release-apk> <new-output>');
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
