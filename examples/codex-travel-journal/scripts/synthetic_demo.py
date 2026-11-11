#!/usr/bin/env python3
"""Generate a small, shareable Diffusion project without personal footage."""
import argparse, json, subprocess
from pathlib import Path
p = argparse.ArgumentParser()
p.add_argument('output', type=Path)
a = p.parse_args()
if a.output.exists():
    p.error('choose a new directory')
(a.output / 'assets').mkdir(parents=True)
subprocess.run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=540x960:rate=30', '-t', '4.2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', str(a.output / 'assets/synthetic.mp4')], check=True)
(a.output / 'package.json').write_text(json.dumps({'name': 'synthetic-travel-example', 'private': True, 'main': 'index.tsx'}))
(a.output / 'index.tsx').write_text('''export default function Project() {
 return <stage><scene id="demo" active width={540} height={960} workarea={[0,4]}>
 <sequence id="shots"><video id="sample" src="synthetic.mp4" start={0} end={4} muted /></sequence>
 <text id="label" x={30} y={40} width={480} height={100} fontSize={32} color="#ffffff">Synthetic media · no private footage</text>
 </scene></stage>;
}
''')
print(a.output)
