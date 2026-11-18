"""Prepare a disposable Diffusion project with your own portrait rushes and original music."""
from pathlib import Path
import argparse
import json
import re
import shutil
import subprocess

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for key in ('clips','music','output'):
        parser.add_argument(key,type=Path)
    args = parser.parse_args()
    root=Path(__file__).resolve().parents[1] / 'timeline'
    names=set(re.findall(r'src="([^"]+)"', ''.join(p.read_text() for p in (root/'scenes').glob('*.tsx'))))
    videos={name: args.clips/name for name in names if name.endswith('.mp4')}
    audio={name: args.music/name.replace('-phrased','').replace('-picture','') for name in names if name.endswith('.wav')}
    source={**videos,**audio,'generated-paper.png':args.clips/'generated-paper.png'}
    missing=[str(p) for p in source.values() if not p.is_file()]
    if missing: parser.error('Missing inputs:\n'+'\n'.join(missing))
    if args.output.exists():parser.error('Choose a new project directory')
    shutil.copytree(root,args.output)
    assets=args.output/'assets'
    assets.mkdir()
    for name,path in source.items():
        (assets/name).symlink_to(path.resolve())
    for name in sorted(names):
        if name.endswith('-still.jpg'):
            video=args.clips/(name.removesuffix('-still.jpg')+'.mp4')
            subprocess.run(['ffmpeg','-loglevel','error','-i',str(video),'-frames:v','1',str(assets/name)],check=True)
    print(args.output.resolve())

if __name__=='__main__':
    main()
