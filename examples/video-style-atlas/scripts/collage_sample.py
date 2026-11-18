"""Create six original geometric cut-outs for film07. No external media needed."""
from pathlib import Path
import argparse,json,shutil,random
from PIL import Image, ImageDraw

def artwork(index):
    ink,cream,orange,green,blue='#283836','#fff3cb','#dd5c38','#488074','#5269a2'
    palette=['#d5b989','#719684','#d49069','#698e8c','#e8aa70','#d9b694']
    im=Image.new('RGB',(600,800),palette[index])
    d=ImageDraw.Draw(im)
    # A repeatable grain and oblique shadow make these flat cut-outs feel printed.
    rng=random.Random(94+index)
    for _ in range(6800):
        x,y=rng.randrange(600),rng.randrange(800)
        r,g,b=im.getpixel((x,y));v=rng.choice((-8,7));d.point((x,y),tuple(max(0,min(255,c+v)) for c in (r,g,b)))
    d.polygon([(0,620),(424,335),(600,423),(600,800),(0,800)],fill='#354a46')
    if index==0: # packed suitcase
        d.rounded_rectangle((226,212,372,321),28,outline=ink,width=18)
        d.rounded_rectangle((95,283,495,579),36,fill=orange,outline=cream,width=9)
        for x in (166,401):d.rectangle((x,282,x+21,577),fill=ink)
        d.polygon([(220,405),(291,368),(319,430),(244,462)],fill=cream)
    elif index==1: # an open door, wedge of daylight
        d.rectangle((145,150,447,640),fill=cream);d.rectangle((171,179,426,635),fill=ink)
        d.polygon([(170,180),(345,250),(345,582),(170,635)],fill=orange);d.ellipse((308,398,326,416),fill=cream)
        d.polygon([(346,582),(426,635),(523,780),(241,781)],fill='#f0c882')
    elif index==2: # shared table, two settings
        d.ellipse((30,233,572,599),fill=orange,outline=cream,width=8)
        for x,y in [(184,374),(418,453)]:
            d.ellipse((x-62,y-48,x+62,y+48),fill=cream);d.ellipse((x-43,y-32,x+43,y+32),outline=green,width=5)
        d.line((127,463,231,482),fill=ink,width=7);d.line((128,473,231,492),fill=ink,width=7)
    elif index==3: # a bowl, steam, two chopsticks
        d.pieslice((90,318,510,608),0,180,fill=cream);d.ellipse((90,405,510,480),fill=orange,outline=cream,width=7)
        for offset in (0,17):d.line((322+offset,430,505+offset,211),fill=ink,width=8)
        for x in (186,238):d.arc((x,303,x+46,389),95,265,fill=cream,width=6)
    elif index==4: # two planes of landscape
        d.ellipse((330,165,483,318),fill=cream)
        d.polygon([(0,420),(206,240),(366,448),(515,301),(600,364),(600,800),(0,800)],fill=green)
        d.polygon([(0,546),(331,354),(600,502),(600,800),(0,800)],fill=ink)
        d.polygon([(295,503),(311,503),(420,800),(126,800)],fill=orange)
    else: # signal and a winding road
        d.polygon([(0,663),(330,443),(387,460),(207,800),(0,800)],fill=blue)
        d.rectangle((277,347,299,647),fill=ink);d.rounded_rectangle((218,159,359,431),49,fill=ink)
        for y,c in [(220,orange),(295,'#796e50'),(369,'#435c51')]:d.ellipse((256,y-29,320,y+29),fill=c)
    return im

def main():
    a=argparse.ArgumentParser();a.add_argument('music',type=Path);a.add_argument('project',type=Path);args=a.parse_args()
    if args.project.exists():a.error('Choose a new output directory')
    if not args.music.is_file():a.error('Pass the generated chamber WAV')
    root=Path(__file__).resolve().parents[1];out=args.project;assets=out/'assets';assets.mkdir(parents=True)
    s=(root/'timeline/scenes/07.tsx').read_text()
    for index,name in enumerate(('pack','leave','table','serve','sunset','redlight')):
        artwork(index).save(assets/f'{name}-still.jpg',quality=92)
    Image.new('RGB',(36,64),'#f7ecd2').save(assets/'generated-paper.png')
    shutil.copyfile(args.music,assets/'07-chamber-picture.wav')
    (out/'index.tsx').write_text(s.replace('export default function Film()', 'function Film()')+'\nexport default function Sample(){return <stage id="sample"><Film/></stage>;}\n')
    config=json.loads((root/'timeline/package.json').read_text());config['diffusion']['export']={'film07':config['diffusion']['export']['film07']}
    (out/'package.json').write_text(json.dumps(config))
if __name__=='__main__':main()
