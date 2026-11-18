#!/usr/bin/env python3
"""Ten original, deterministic MIDI arrangements. Needs mido, FluidSynth, FFmpeg.
SoundFont is supplied by the operator; no downloads or credentials in this script.
"""
import argparse, hashlib, json, math, random, subprocess
from pathlib import Path
import mido

SPECS = [
 dict(id='01',name='ambient',bpm=60,meter='4/4 (free-feeling)',duration=36,key='D major / suspended',programs=[89,11,48],chords=[[50,57,62,66,69],[47,54,59,62,66],[43,50,57,59,62],[50,57,62,66,69]]),
 dict(id='02',name='acoustic',bpm=100,meter='4/4',duration=36,key='G major',programs=[24,32,73],chords=[[43,55,59,62],[40,55,59,64],[36,55,60,64],[38,54,57,62]]),
 dict(id='03',name='house',bpm=120,meter='4/4',duration=32,key='A minor',programs=[38,81,4],chords=[[45,57,60,64],[41,57,60,65],[48,55,60,64],[43,55,59,62]]),
 dict(id='04',name='funk',bpm=108,meter='4/4',duration=32,key='E Dorian',programs=[33,7,65],chords=[[40,55,59,62],[45,57,60,64],[40,55,59,62],[47,57,62,66]]),
 dict(id='05',name='minimal',bpm=105,meter='7/8',duration=36,key='D pentatonic',programs=[12,98,39],chords=[[50,62,66,69],[47,59,62,66],[43,55,62,66],[50,62,66,69]]),
 dict(id='06',name='lofi',bpm=80,meter='4/4 swung eighths',duration=36,key='F major extended',programs=[4,32,11],chords=[[41,57,60,64,67],[38,53,57,60,64],[43,53,57,62,65],[48,55,58,62,64]]),
 dict(id='07',name='chamber',bpm=120,meter='3/4',duration=36,key='C major',programs=[45,70,10],chords=[[48,60,64,67],[45,60,64,69],[41,60,65,69],[43,59,62,67]]),
 dict(id='08',name='piano',bpm=60,meter='3/4',duration=36,key='D major / B minor',programs=[0,42],chords=[[47,54,59,62],[43,55,59,62],[50,57,62,66],[45,57,61,64]]),
 dict(id='09',name='jazz',bpm=100,meter='4/4 swing',duration=36,key='Bb major',programs=[0,32,11],chords=[[48,58,62,65],[41,57,60,63],[46,57,62,65],[43,58,62,65]]),
 dict(id='10',name='cinematic',bpm=80,meter='4/4',duration=36,key='D minor → F major',programs=[48,60,47],chords=[[38,50,57,62,65],[34,50,58,62,65],[41,53,60,65,69],[36,52,55,60,64]])
]

def compose(spec, out):
    rng=random.Random(9400+int(spec['id'])); ev=[]; bpm=spec['bpm']; beat=60/bpm; D=spec['duration']
    def add(ch,n,t,d,v=65,*,cadence=False):
        if t<0 or (not cadence and t>D-3.0):return
        v=max(1,min(116,round(v))); d=min(d,(D-.45 if cadence else D-2.65)-t)
        if d<=0:return
        ev.extend([(t,mido.Message('note_on',channel=ch,note=int(n),velocity=v)),(t+d,mido.Message('note_off',channel=ch,note=int(n),velocity=0))])
    def note(ch,n,b,d,v=65,human=0):
        add(ch,n,b*beat+human,d*beat,v+rng.uniform(-3,3))
    def chord(ch,ns,b,d,v=50,strum=0):
        for j,n in enumerate(ns):note(ch,n,b,d,v, j*strum)
    for ch,pg in enumerate(spec['programs']):
        ev += [(0,mido.Message('program_change',channel=ch,program=pg)),(0,mido.Message('control_change',channel=ch,control=10,value=[45,82,64][ch%3])),(0,mido.Message('control_change',channel=ch,control=91,value=45 if spec['id'] in ['01','08','10'] else 22))]
    # Brush kit for jazz; normal kit elsewhere. MIDI program is zero based.
    ev.append((0,mido.Message('program_change',channel=9,program=40 if spec['id']=='09' else 0)))
    beats=D/beat; bar=3 if spec['id'] in ['07','08'] else 3.5 if spec['id']=='05' else 4
    def drum(n,b,v=60):note(9,n,b,.08,v)
    for k,b in enumerate([x*bar for x in range(math.ceil(beats/bar))]):
        c=spec['chords'][k%4]; root=c[0]; section=b/beats
        # Shape the arc over the whole piece, with a quieter answer every fourth bar.
        expression=round(76+24*math.sin(math.pi*section)-(8 if k%4==3 else 0))
        for channel in range(len(spec['programs'])):
            ev.append((b*beat,mido.Message('control_change',channel=channel,control=11,value=expression)))
        last=b>beats-5; middle=.24<section<.78; sid=spec['id']
        if sid=='01':
            if k%2==0:
                chord(0,c[1:],b,7.5,45); note(2,root,b,7.8,32)
            if k in [1,3,5,6]:
                for q,n in enumerate([c[-1]+12,c[-2]+12,c[2]+12]):note(1,n,b+q*1.3,2.4,48-q*5)
        elif sid=='02':
            # Alternating thumb + voiced finger pattern; melody enters after first phrase.
            for j in range(8):
                n=([root,c[2],c[3],c[1]+12,c[2],c[3],c[2],c[1]+12])[j]
                note(0,n,b+j*.5,.75,68 if j%2==0 else 53,human=rng.uniform(-.008,.008))
            for j in [0,2]:note(1,root,b+j,1.6,48)
            if middle and k%2==0:
                for off,n in zip([0,1.5,2,3],[c[3]+12,c[2]+12,c[1]+12,c[2]+12]):note(2,n,b+off,.8,38)
            if middle:
                drum(37,b+1,33);drum(37,b+3,36)
        elif sid=='03':
            if not last:
                for j in range(4):
                    if not(.5<section<.625):drum(36,b+j,82)
                    drum(42,b+j+.5,44);note(0,root,b+j+.5,.35,66)
                if middle:drum(39,b+1,62);drum(39,b+3,65)
                for off in [0,.75,2,2.75]:chord(2,c[1:],b+off,.35,57)
                if middle:
                    for j,n in enumerate([c[-1]+12,c[-2]+12,c[-1]+12,c[1]+12]):note(1,n,b+j*.75,.22,38)
        elif sid=='04':
            pat=[(0,0),(.75,12),(1.5,0),(2.25,7),(2.75,10),(3.5,12)]
            for off,interval in pat:note(0,root+interval,b+off,.28,72)
            for off in [.5,1.25,2.5,3.25]:chord(1,c[1:],b+off,.18,51)
            for off in [0,1.75,2.5]:drum(36,b+off,65)
            for off in [1,3]:drum(38,b+off,65)
            for j in range(8):drum(42,b+j*.5,36+(j%2)*9)
            if middle and k%2:
                note(2,c[-1]+12,b+2.5,.5,49);note(2,c[-2]+12,b+3.25,.5,46)
        elif sid=='05':
            for j in range(7):
                if (j+k)%4!=3:note(0,c[1+(j%3)],b+j*.5,.4,48+(j in [0,3,5])*12)
            if k%2==0:chord(1,c[1:],b,6.5,36)
            if middle:note(2,root-12,b,2.8,48)
        elif sid=='06':
            chord(0,c[1:],b,3.2,55,.018)
            note(1,root,b,1.4,57);note(1,root+7,b+2.6,.6,48)
            for j in range(4):
                drum(42,b+j,27);drum(42,b+j+.65,38)
            if not last:
                drum(36,b,62);drum(36,b+2.5,48);drum(38,b+1.05,46);drum(38,b+3.05,52)
            if k%2:
                for j,n in enumerate([c[-1]+12,c[-2]+12,c[1]+12]):note(2,n,b+j*.8,.8,38)
        elif sid=='07':
            # Pizzicato waltz, bassoon answer, music-box phrase; no kit.
            note(0,root,b,.4,68)
            for off in [1,2]:chord(0,c[1:],b+off,.28,50)
            if k%2==0:
                for j,n in enumerate([c[1]+12,c[2]+12,c[3]+12,c[2]+12,c[1]+12]):note(2,n,b+j*.5,.38,47)
            elif middle:
                note(1,c[2],b,.9,52);note(1,c[3],b+1.5,.8,49)
        elif sid=='08':
            note(0,root-12,b,2.8,49);note(0,c[1],b+.6,1.8,45)
            for j,n in enumerate([c[2],c[3],c[2]+12,c[1]+12]):note(0,n,b+j*.65+.15,1.3,55-j*3)
            if middle:note(1,root,b,2.8,31)
        elif sid=='09':
            # Walking bass, rootless piano shells, brushes, space for detail shots.
            for j,n in enumerate([root,root+4,root+7,root+11]):note(1,n,b+j,.8,46)
            for off in [.65,2,3.65]:chord(0,c[1:],b+off,.5,42,.014)
            for j in range(4):
                drum(51,b+j,29)
                if j%2:drum(51,b+j+.66,24);drum(38,b+j,25)
            if k%3==1:
                for off,n in zip([0,.66,2,2.66],[c[-1]+12,c[-2]+12,c[1]+12,c[-1]+12]):note(2,n,b+off,.6,35)
        else:
            chord(0,c[1:],b,3.8,44+middle*18);note(0,root,b,3.7,45)
            if .25<section<.82:
                for j in range(8):note(0,c[1+j%3],b+j*.5,.36,53+j%2*10)
                for off in [0,2]:note(2,root,b+off,.7,75)
            if .5<section<.84:chord(1,c[1:4],b,3,45)
    # Authored tonic cadence, stop active rhythms before end and let releases breathe.
    tonic=spec['chords'][0]
    if spec['id']=='08':tonic=[50,57,62,66]
    if spec['id']=='10':tonic=[41,53,60,65,69]
    for n in tonic: add(0,n,D-2.55,1.9,49,cadence=True)
    mf=mido.MidiFile(ticks_per_beat=480);tr=mido.MidiTrack();mf.tracks.append(tr)
    tr.append(mido.MetaMessage('set_tempo',tempo=mido.bpm2tempo(bpm),time=0))
    tr.append(mido.MetaMessage('time_signature',numerator=7 if spec['id']=='05' else 3 if spec['id'] in ['07','08'] else 4,denominator=8 if spec['id']=='05' else 4,time=0))
    prev=0
    for t,msg in sorted(ev,key=lambda p:(p[0],p[1].type=='note_on')):
        tick=max(0,round(t/beat*480));tr.append(msg.copy(time=tick-prev));prev=tick
    tr.append(mido.MetaMessage('end_of_track',time=max(0,round(D/beat*480)-prev)));mf.save(out)
    return len(ev)

def main():
    ap=argparse.ArgumentParser();ap.add_argument('output',type=Path);ap.add_argument('--soundfont',type=Path,required=True);a=ap.parse_args()
    a.output.mkdir(parents=True,exist_ok=True)
    for s in SPECS:
        stem=a.output/f"{s['id']}-{s['name']}";midi=stem.with_suffix('.mid');raw=stem.with_suffix('.raw.wav');wav=stem.with_suffix('.wav')
        if wav.exists():raise SystemExit(f'Refusing overwrite: {wav}')
        count=compose(s,midi)
        subprocess.run(['fluidsynth','-ni','-r','48000','-g','0.65','-R','1','-C','1','-F',str(raw),str(a.soundfont),str(midi)],check=True,capture_output=True)
        filt=f"atrim=duration={s['duration']},afade=t=in:d=0.025,afade=t=out:st={s['duration']-1.5}:d=1.5,loudnorm=I=-16:TP=-1.5:LRA=9"
        p=subprocess.run(['ffmpeg','-hide_banner','-nostdin','-i',str(raw),'-af',filt,'-ar','48000','-ac','2','-c:a','pcm_s24le',str(wav)],capture_output=True,text=True,check=True)
        s['midi_event_count']=count;s['method']='agent-authored MIDI + local sample synthesis';s['soundfont_sha256']=hashlib.sha256(a.soundfont.read_bytes()).hexdigest();s['wav_sha256']=hashlib.sha256(wav.read_bytes()).hexdigest();s['seed']=9400+int(s['id'])
        stem.with_suffix('.json').write_text(json.dumps(s,ensure_ascii=False,indent=2));stem.with_suffix('.render.log').write_text(p.stderr)
        print(s['id'],s['name'],s['duration'],'seconds',count,'events',flush=True)
    (a.output/'catalog.json').write_text(json.dumps(SPECS,ensure_ascii=False,indent=2))
if __name__=='__main__':main()
