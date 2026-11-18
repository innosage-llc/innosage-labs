#!/usr/bin/env python3
"""Full-decode + measured specs + 2fps sheets; creates evidence, not an art score."""
import argparse,hashlib,json,subprocess,math
from pathlib import Path
from PIL import Image,ImageDraw

def main():
 ap=argparse.ArgumentParser();ap.add_argument('video',type=Path);ap.add_argument('out',type=Path);a=ap.parse_args()
 a.out.mkdir(parents=True,exist_ok=True)
 if any(a.out.iterdir()):raise SystemExit('Use a new empty review folder')
 probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(a.video)]))
 v=next(s for s in probe['streams'] if s['codec_type']=='video');duration=float(v['duration']);fps=eval_fraction(v['avg_frame_rate'])
 frames=a.out/'frames';frames.mkdir()
 if fps!=30 or v['r_frame_rate']!='30/1' or (v['width'],v['height'])!=(1080,1920):
  raise SystemExit('This review recipe expects a 1080x1920, constant-30fps master.')
 total=int(v['nb_frames'])
 indices=sorted(set(range(0,total,15))|{total-1})
 selection=f"select='not(mod(n,15))+eq(n,{total-1})',scale=180:320"
 subprocess.run(['ffmpeg','-v','error','-nostdin','-i',str(a.video),'-vf',selection,'-fps_mode','vfr',str(frames/'%04d.jpg')],check=True)
 files=sorted(frames.glob('*.jpg'));times=[n/30 for n in indices]
 if len(files)!=len(times):raise RuntimeError('Sample count differs from decoded timeline')
 sheets=[]
 for first in range(0,len(files),36):
  chosen=files[first:first+36];canvas=Image.new('RGB',(1080,340*math.ceil(len(chosen)/6)),'#172121');draw=ImageDraw.Draw(canvas)
  for j,path in enumerate(chosen):
   im=Image.open(path);x=j%6*180;y=j//6*340;canvas.paste(im,(x,y+20));draw.text((x+3,y+3),f'{times[first+j]:.2f}s',fill='white')
  name=f'sheet-{first//36:02}.jpg';canvas.save(a.out/name,quality=94);sheets.append(name)
 cmd=['ffmpeg','-hide_banner','-nostdin','-i',str(a.video),'-af','ebur128=peak=true','-f','null','-'];run=subprocess.run(cmd,capture_output=True,text=True)
 (a.out/'decode-loudness.log').write_text(run.stderr)
 sha=hashlib.sha256(a.video.read_bytes()).hexdigest()
 audio_hash=subprocess.check_output(['ffmpeg','-v','error','-i',str(a.video),'-map','0:a:0','-c','copy','-f','hash','-hash','sha256','-'],text=True).strip()
 receipt={'video_sha256':sha,'audio_bitstream_hash':audio_hash,'decode_exit':run.returncode,'specs':probe,'timestamps':times,'sheets':sheets,'visual_review':'PENDING','audio_semantic_review':'SEPARATE_RECEIPT_REQUIRED','score':None,'coverage_method':'2fps + last video frame; not continuous playback'}
 (a.out/'receipt.json').write_text(json.dumps(receipt,indent=2));print(json.dumps({'frames':len(files),'decode_exit':run.returncode,'sha256':sha}))
 if run.returncode:raise SystemExit(run.returncode)
def eval_fraction(s):
 n,d=s.split('/');return float(n)/float(d)
if __name__=='__main__':main()
