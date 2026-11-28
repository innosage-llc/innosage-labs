"""Drive the built Release app on the dedicated local startup-gate emulator."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET
import zipfile

serial, app, out, apk = sys.argv[1:]
app, out, apk = map(Path, (app, out, apk))
here = Path(__file__).resolve().parent
package = 'co.innosage.labs.airecorder'

def run(args):
    return subprocess.check_output([str(v) for v in args], timeout=60)

def adb(*args):
    return run(['adb', '-s', serial, *args]).decode().strip()

assert re.fullmatch(r'emulator-[0-9]+', serial)
assert adb('emu', 'avd', 'name').splitlines()[0].startswith('labs85-')
assert adb('shell','getprop','ro.kernel.qemu') == '1'
work = out / 'import-fixture'
work.mkdir()
sdk = Path(os.environ['ANDROID_HOME'])
tools = sdk / 'build-tools/36.0.0'
jar = sdk / 'platforms/android-35/android.jar'
classes = work / 'classes'
classes.mkdir()
run(['javac', '--release', '8', '-cp', jar, '-d', classes, here / 'StorageFixture.java'])
run([tools / 'd8', '--min-api', '28', '--lib', jar, '--output', work, *classes.rglob('*.class')])
unsigned = work / 'unsigned.apk'
run([tools / 'aapt', 'package', '-M', here / 'AndroidManifest.xml', '-I', jar, '-F', unsigned])
with zipfile.ZipFile(unsigned, 'a') as bundle:
    bundle.write(work / 'classes.dex', 'classes.dex')
aligned, helper = work / 'aligned.apk', work / 'fixture.apk'
run([tools / 'zipalign','4',unsigned,aligned])
# The emulator gate uses the example's generated local debug identity for its Release build.
run([tools / 'apksigner','sign','--ks',app/'android/app/debug.keystore','--ks-pass','pass:android','--out',helper,aligned])
def signer(path):
    return re.search(rb'certificate SHA-256 digest: (\w+)', run([tools/'apksigner','verify','--print-certs',path]))[1]
assert signer(apk) == signer(helper)
adb('install','-r',helper)

def storage(mode):
    response = adb('shell','am','instrument','-w','-e','mode',mode,'co.innosage.labs.importfixture/.StorageFixture')
    assert 'INSTRUMENTATION_CODE: -1' in response, response
    return dict(re.findall(r'INSTRUMENTATION_RESULT: (\w+)=(.*)',response))

def nodes():
    adb('shell','uiautomator','dump','--compressed','/sdcard/labs85-import.xml')
    return list(ET.fromstring(adb('shell','cat','/sdcard/labs85-import.xml')).iter('node'))

def find(label, prefix=False):
    deadline = time.monotonic() + 12
    while time.monotonic() < deadline:
        current = nodes()
        for node in current:
            for value in (node.get('text',''), node.get('content-desc','')):
                if value == label or (prefix and value.startswith(label)):
                    return node
    raise RuntimeError('Missing ' + label + ': ' + str([(v.get('text'), v.get('content-desc')) for v in current][-40:]))

def tap(label, prefix=False, repeat=False):
    node = find(label, prefix)
    a,b,c,d = map(int,re.findall(r'\d+',node.get('bounds')))
    point = str((a+c)//2) + ' ' + str((b+d)//2)
    command = 'input tap ' + point
    adb('shell',command + ('; ' + command if repeat else ''))

def launch():
    adb('shell','am','start','-W','-n',package+'/.MainActivity')
    tap('Library')

def select(filename):
    tap('Import audio')
    # DocumentsUI initially shows Recent. Downloads also covers a retained picker location.
    current = nodes()
    if not any(n.get('text') == filename for n in current):
        tap('Show roots')
        tap('Downloads')
    tap(filename)

label, forged = 'Labs146Tone.m4a', 'Labs146Forged.m4a'
valid = app / 'scripts/fixtures/recorder-test-tone.m4a'
for file, name in [(valid,label),(out/'forged.m4a',forged)]:
    adb('push', file, '/sdcard/Download/'+name)
    adb('shell','am','broadcast','-a','android.intent.action.MEDIA_SCANNER_SCAN_FILE','-d','file:///sdcard/Download/'+name)
before = storage('inspect')
assert before.get('count') == '0', before
# Only the emulator's networking is disabled.
adb('shell','cmd','connectivity','airplane-mode','enable')
assert adb('shell','settings','get','global','airplane_mode_on') == '1'
launch()
assert len([n for n in nodes() if n.get('content-desc') == 'Import audio']) == 1
tap('Import audio',repeat=True)
assert any('documentsui' in n.get('package','') for n in nodes())
adb('shell','input','keyevent','4')
find('Import audio')
select(forged)
find('Choose an M4A containing an MP4 audio track.')
assert storage('inspect').get('count') == '0'
# The app must already be mounted when the path becomes unavailable. Instrumentation
# runs before launch so listRecordings must also tolerate the missing directory.
storage('block')
launch()
select(label)
find('Could not import the audio. Check available storage and try again.')
storage('unblock')
assert storage('inspect').get('count') == '0'
launch()
select(label)
find(label,True)
(out/'library-android.png').write_bytes(run(['adb','-s',serial,'exec-out','screencap','-p']))
first = storage('inspect')
expected = hashlib.sha256(valid.read_bytes()).hexdigest()
assert first.get('count') == '2' and first.get('digest') == expected and re.fullmatch(r'Import-.+\.m4a',first['id']),first
launch()
tap(label,True)
tap('Play '+label)
# UIAutomator waits for idle. With the three-second fixture the accessible
# elapsed value may have reached its end before a stable tree is returned.
find('Elapsed 0:03')
assert storage('inspect') == first
(out/'library-android.json').write_text(json.dumps({'id':first['id'],'sha256':expected,'airplaneMode':True,
    'cases':['cancel','repeat','forged','save-failure','retry','offline-playback']}))
