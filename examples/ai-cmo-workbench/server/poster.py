"""Deterministic original 3:4 Xiaohongshu draft cover. No third-party marks."""
from __future__ import annotations
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

def _font(size: int):
    paths = ("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
             "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")
    for path in paths:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()

def render_cover(target: Path, title: str, lines: list[str]) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    image = Image.new("RGB", (1080, 1440), "#f9fafb")
    draw = ImageDraw.Draw(image)
    orange, ink, grey = "#f97316", "#171717", "#52525b"
    draw.rectangle((72, 74, 180, 87), fill=orange)
    draw.text((72, 130), "INNOSAGE  /  AI GROWTH NOTES", font=_font(28), fill=grey)
    font = _font(86)
    y = 260
    # Word wrap based on glyph width; CJK titles need pixel-aware wrapping.
    remaining = "".join(title.splitlines())[:80]
    while remaining and y < 830:
        take = 1
        for i in range(1, len(remaining) + 1):
            if draw.textbbox((0, 0), remaining[:i], font=font)[2] > 920:
                break
            take = i
        chunk, remaining = remaining[:take], remaining[take:]
        draw.text((72, y), chunk, font=font, fill=ink)
        y += 118
    draw.rectangle((72, 910, 1008, 914), fill=orange)
    y = 960
    small = _font(42)
    for line in lines[:4]:
        item = line.strip()[:45]
        if not item:
            continue
        # Prevent text overflow; truncate visibly.
        while item and draw.textbbox((0, 0), item, font=small)[2] > 930:
            item = item[:-1]
        if item:
            draw.text((72, y), item, font=small, fill=grey)
            y += 83
    draw.text((72, 1370), "Source-aware draft • Human review required",
              font=_font(24), fill=grey)
    # Make the generated media durable and complete before its metadata can be
    # journal-acknowledged; never expose a partially written final PNG path.
    import os
    import uuid
    temporary = target.with_name(target.name + ".tmp-" + uuid.uuid4().hex)
    try:
        image.save(temporary, format="PNG")
        fd = os.open(temporary, os.O_RDONLY)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)
        os.replace(temporary, target)
        directory_fd = os.open(target.parent, os.O_RDONLY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    finally:
        temporary.unlink(missing_ok=True)
