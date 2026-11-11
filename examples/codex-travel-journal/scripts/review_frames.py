#!/usr/bin/env python3
"""Create private 2fps review sheets and an exact-export receipt. Requires FFmpeg/Pillow."""
import argparse, hashlib, json, subprocess, tempfile
from pathlib import Path
from PIL import Image, ImageDraw

parser = argparse.ArgumentParser()
parser.add_argument('video', type=Path)
parser.add_argument('output', type=Path)
a = parser.parse_args()
a.output.mkdir(parents=True, exist_ok=True)
if any(a.output.iterdir()):
    parser.error('output must be empty; preserve prior reviews')
r = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration:stream=codec_type,duration', '-of', 'json', str(a.video)], capture_output=True, text=True, check=True)
probe = json.loads(r.stdout)
duration = float(next((s['duration'] for s in probe['streams'] if s['codec_type'] == 'video' and 'duration' in s), probe['format']['duration']))
times = [i / 2 for i in range(int(duration * 2))]
if not times or duration - times[-1] > .04:
    times.append(max(0, duration - .04))
with tempfile.TemporaryDirectory() as tmp:
    sheets = []
    for begin in range(0, len(times), 12):
        canvas = Image.new('RGB', (1080, 3 * 510), '#202020')
        draw = ImageDraw.Draw(canvas)
        for local, t in enumerate(times[begin:begin+12]):
            frame = Path(tmp) / 'frame.png'
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', str(t), '-i', str(a.video), '-frames:v', '1', '-vf', 'scale=270:480:force_original_aspect_ratio=decrease', str(frame)], check=True)
            with Image.open(frame) as im:
                x, y = local % 4 * 270, local // 4 * 510
                canvas.paste(im, (x, y + 30))
                draw.text((x + 8, y + 8), f'{t:07.2f}s', fill='white')
        name = f'sheet-{begin // 12:03}.jpg'
        canvas.save(a.output / name, quality=92)
        sheets.append(name)
receipt = {'sha256': hashlib.file_digest(a.video.open('rb'), 'sha256').hexdigest(), 'video_duration': duration, 'timestamps': times, 'sheets': sheets, 'method': '2fps + near-end frame; not continuous playback', 'audio_review': 'NOT_PERFORMED', 'director_score': None}
(a.output / 'receipt.json').write_text(json.dumps(receipt, indent=2))
print(json.dumps({'frames': len(times), 'sheets': len(sheets), 'duration': duration}))
