"""Original private-footage-free illustration of a road pause and a bowl handoff."""
import argparse
from math import cos, pi, sin
from pathlib import Path
import subprocess
from PIL import Image, ImageDraw


def motion(value):
    v = max(0, min(1, value))
    return v * v * (3 - 2 * v)


def lerp(left, right, amount):
    return tuple(a + (b - a) * amount for a, b in zip(left, right))


def frame(t):
    w, h = 432, 768
    im = Image.new("RGB", (w, h), "#19292b")
    p = ImageDraw.Draw(im)
    across = motion((t - 27.6) / .8)
    top = Image.new("RGB", (w, 314), "#e1c991")
    road = ImageDraw.Draw(top)
    road.ellipse((263, 26, 313, 76), fill="#df805c")
    for i in range(13):
        x = i * 35 - 12
        roof = 63 + int(22 * sin(i * 1.41))
        road.rectangle((x, roof, x + 27, 112), fill="#668078")
    road.polygon([(0, 101), (432, 100), (432, 314), (0, 314)], fill="#304b4b")
    road.polygon([(170, 103), (214, 103), (420, 314), (4, 314)], fill="#53655c")
    # A 10-second pause on the very same street; lane markers resume at the serving gesture.
    distance = min(t, 11) * .30 + max(0, t - 21) ** 1.18 * .25
    for n in range(9):
        depth = ((n / 9 + distance * .19) % 1) ** 2.05
        y = 105 + 226 * depth
        half = 1 + depth * 2
        x = 196 - 27 * depth
        road.polygon([(x, y), (x + half, y), (x + half + 1, y + depth * 26), (x - half, y + depth * 26)], fill="#dcc69b")
    for side in (-1, 1):
        for n in range(5):
            depth = ((n / 5 + distance * .12) % 1) ** 1.4
            x = 194 + side * (12 + depth * 246)
            y = 99 + depth * 134
            size = 6 + depth * 44
            road.line((x, y - size * 1.5, x, y), fill="#1d3837", width=max(1, int(size / 10)))
            road.ellipse((x-size*.53,y-size*2,x+size*.57,y-size*.75), fill="#38594e")
    road.line((245, 59, 245, 105), fill="#243e3b", width=4)
    road.rounded_rectangle((237, 46, 251, 66), radius=6, fill="#203633")
    road.ellipse((240, 49, 248, 57), fill="#e77b57" if 11<=t<21 else "#94ac7e")
    im.paste(top, (0, round(36 - 350 * across)))
    meal = Image.new("RGB", (w, 330), "#d8b183")
    m = ImageDraw.Draw(meal)
    for i in range(7):
        y = 22 + i*49
        m.line([(0,y),(144,y+3),(293,y-2),(432,y+1)], fill="#c6a071", width=1)
    def bowl(cx,cy,rx,ry,dish):
        m.ellipse((cx-rx+3,cy-ry+6,cx+rx+3,cy+ry+6), fill="#b89469")
        m.ellipse((cx-rx,cy-ry,cx+rx,cy+ry), fill="#ece4c9", outline="#37585c", width=4)
        m.ellipse((cx-rx+8,cy-ry+8,cx+rx-8,cy+ry-8), outline="#829c8c", width=2)
        if dish:
            for j in range(15):
                x=cx+cos(j*2.4)*(12+j*2.3); y=cy+sin(j*2.4)*(9+j*1.55)
                m.ellipse((x-9,y-4,x+9,y+4), fill=["#849452","#667d49","#9b9c56"][j%3])
        else:
            for j in range(90):
                x=cx+cos(j*2.4)*(j**.5)*3.6; y=cy+sin(j*2.4)*(j**.5)*2.55
                m.line((x-2,y,x+2,y-1), fill="#cabe9d",width=1)
    bowl(103,103,71,54,True);bowl(308,222,70,50,False)
    start,finish=(113,99),(310,216)
    move=motion((t-21)/5.25)
    hand=lerp(start,finish,move)
    lift=sin(pi*move)*29
    x,y=hand[0],hand[1]-lift
    approach=motion((t-12)/7)
    withdraw=motion((t-27)/2.15)
    dx=(1-approach)*160 + withdraw*165
    dy=(1-approach)*-128 + withdraw*-75
    for space in (-3,3):
        m.line((x+dx+space,y+dy,x+dx+space+87, y+dy-125),fill="#634835",width=4)
    if t>=20:
        m.ellipse((x-8,y-3,x+8,y+4),fill="#5d834c")
    offset_y=round(397 - 166*across)
    im.paste(meal, (0,offset_y))
    if across > 0:
        # A second bowl entering this composition supplies a human-scale ending through objects.
        opacity = motion((t-29)/2)
        x = round(-62+108*opacity)
        p.ellipse((x-59,offset_y+235,x+61,offset_y+312),fill="#e6e1c7",outline="#426267",width=3)
        p.arc((x-51,offset_y+241,x+53,offset_y+304),0,360,fill="#84a399",width=2)
    return im


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("score",type=Path)
    parser.add_argument("output",type=Path)
    args=parser.parse_args()
    if args.output.exists():parser.error("Choose a fresh output path")
    command=["ffmpeg","-loglevel","error","-n","-f","rawvideo","-pix_fmt","rgb24","-s","432x768","-r","30","-i","-",
             "-i",str(args.score),"-map","0:v","-map","1:a","-c:v","libx264","-crf","20","-pix_fmt","yuv420p","-c:a","aac",
             "-b:a","160k","-t","34","-movflags","+faststart",str(args.output)]
    proc=subprocess.Popen(command,stdin=subprocess.PIPE)
    try:
        for i in range(1020):proc.stdin.write(frame(i/30).tobytes())
    finally:
        proc.stdin.close()
    if proc.wait():raise SystemExit("Illustration export failed")


if __name__=="__main__":main()
