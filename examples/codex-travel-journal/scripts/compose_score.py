"""Original deterministic instrumental bed. No samples or model services."""
import numpy as np, wave, argparse
from pathlib import Path
S=48000; D=76; mix=np.zeros((S*D,2),np.float64); rng=np.random.default_rng(53)
def note(at,midi,length,gain=.1,pan=0,kind='pluck'):
 n=int(length*S); t=np.arange(n)/S; f=440*2**((midi-69)/12)
 if kind=='pad':
  a=(np.sin(2*np.pi*f*t)+.25*np.sin(2*np.pi*f*1.002*t)+.14*np.sin(2*np.pi*f*2*t));env=np.minimum(t/.6,1)*np.minimum((length-t)/.8,1)
 else:
  a=np.sin(2*np.pi*f*t)+.32*np.sin(2*np.pi*2*f*t)*np.exp(-t*4)+.13*np.sin(2*np.pi*3*f*t)*np.exp(-t*7);env=(1-np.exp(-t*200))*np.exp(-t/(.85 if kind=='pluck' else .3))
 a*=np.clip(env,0,1)*gain;start=int(at*S);end=min(start+n,len(mix));
 if end<=start:return
 mix[start:end,0]+=a[:end-start]*np.sqrt((1-pan)/2);mix[start:end,1]+=a[:end-start]*np.sqrt((1+pan)/2)
beat=.625; chords=[[50,57,62,66,69],[47,54,59,62,66],[43,50,55,59,62],[45,52,57,61,64]]
for bar in range(30):
 at=bar*4*beat;c=chords[(bar//2)%4]; intensity=.6 if bar<2 or bar>26 else 1
 for k,m in enumerate(c): note(at,m,3,.018*intensity,(k-2)*.25,'pad')
 note(at,c[0]-12,1.8,.13*intensity,0,'bass')
 for k in range(8): note(at+k*beat/2,c[2+(k%3)]+12,1.2,.044*intensity,(-1)**k*.35)
 if 3<=bar<=25:
  for k in range(4):
   p=int((at+k*beat)*S);n=int(.16*S);t=np.arange(n)/S
   kick=np.sin(2*np.pi*(48*t+3*(1-np.exp(-t*24))))*np.exp(-t*28)*.09
   if p+n<len(mix):mix[p:p+n]+=kick[:,None]
   p=int((at+k*beat+beat*.5)*S);n=int(.05*S);t=np.arange(n)/S;h=rng.normal(0,1,n);h=np.diff(h,prepend=0)*np.exp(-t*100)*.008
   if p+n<len(mix):mix[p:p+n]+=h[:,None]
melody=[(0,74,1),(1.5,78,.8),(2.5,76,1.5),(4,74,1),(6,69,1.5),(8,71,1),(9.5,74,1),(11,73,2),(14,69,2)]
for start in [5,25,45]:
 for off,m,l in melody:note(start+off*beat,m,l*beat+1,.09,.12)
# Stereo echoes, then soft limiting and full fade.
for sec,g in [(.1875,.16),(.375,.1),(.75,.06)]:
 n=int(sec*S);mix[n:]+=mix[:-n,::-1]*g
fade=np.minimum(np.arange(len(mix))/S/1.2,1)*np.clip((D-np.arange(len(mix))/S)/4,0,1)
mix=np.tanh(mix*1.6)*fade[:,None];mix*=.8/max(.8,float(np.max(np.abs(mix))))
parser=argparse.ArgumentParser();parser.add_argument('output',type=Path);args=parser.parse_args();out=args.output
if out.exists():parser.error('output already exists')
out.parent.mkdir(parents=True,exist_ok=True)
with wave.open(str(out),'wb') as w:w.setnchannels(2);w.setsampwidth(2);w.setframerate(S);w.writeframes((mix*32767).astype('<i2').tobytes())
print(out)
