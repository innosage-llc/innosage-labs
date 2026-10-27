#!/usr/bin/env python3
"""Bounded text-region update of a founder-approved PNG. Pillow is the only dependency.

The renderer does not fetch X posts or infer facts. Source evidence is supplied
as structured input; protected pixels are verified after rendering.
"""
import argparse
import hashlib
import json
import sys
from datetime import datetime
from pathlib import Path

try:
    from PIL import Image, ImageChops, ImageDraw, ImageFont
except ImportError as exc:
    raise SystemExit("Pillow required: python -m pip install Pillow") from exc

NAME = "codex-10-26极简重置更新公告海报.png"
EXPECTED_BLOB = "44fee2832dd283e8f168a7ca1eee6a71bd3e0416"
HERE = Path(__file__).resolve().parent.parent
DEFAULTS = (HERE / "assets/base-poster.png", HERE.parents[2] / "assets" / NAME)
LAYOUT = HERE / "references/layout.json"
FONTS = (
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/System/Library/Fonts/PingFang.ttc",
    "C:/Windows/Fonts/msyh.ttc",
)

class ValidationError(ValueError):
    pass

def blob_sha(data):
    return hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()

def choose_font(user_font):
    candidates = [user_font] if user_font else FONTS
    for p in candidates:
        if p and Path(p).is_file():
            try:
                ImageFont.truetype(p, 32)
                return str(p)
            except OSError:
                pass
    raise ValidationError("FONT_UNAVAILABLE: provide --font path to an installed CJK font; no fonts bundled")

def rect(base_rect, w, h, rw, rh):
    return tuple(round(coord * (w / rw if i % 2 == 0 else h / rh)) for i, coord in enumerate(base_rect))

def intersection(a, b):
    return max(a[0], b[0]) < min(a[2], b[2]) and max(a[1], b[1]) < min(a[3], b[3])

def flatten_text(value, key, *, max_chars=90):
    if not isinstance(value, str) or not value.strip() or len(value) > max_chars or "\r" in value:
        raise ValidationError("INVALID_TEXT: " + key)
    return value.strip()

def validated_input(obj):
    if not isinstance(obj, dict):
        raise ValidationError("INVALID_INPUT: expected JSON object")
    evidence = obj.get("evidence")
    if not isinstance(evidence, dict):
        raise ValidationError("EVIDENCE_REQUIRED")
    tier = evidence.get("level")
    if tier not in ("DIRECT_SOURCE", "ARCHIVE_CROSSCHECK", "USER_SCREENSHOT", "USER_QUOTE"):
        raise ValidationError("EVIDENCE_UNVERIFIED: unsupported level")
    urls = evidence.get("urls", [])
    if not isinstance(urls, list) or not all(isinstance(s, str) and s.startswith("https://") for s in urls):
        raise ValidationError("EVIDENCE_URLS_INVALID")
    if tier == "ARCHIVE_CROSSCHECK" and len(set(urls)) < 2:
        raise ValidationError("ARCHIVE_CROSSCHECK requires two distinct corroborating source URLs")
    if tier == "DIRECT_SOURCE" and not urls:
        raise ValidationError("DIRECT_SOURCE requires verified original URL")
    claim = obj.get("claim_status")
    if claim not in ("ANNOUNCED", "CLAIMED", "OBSERVED"):
        raise ValidationError("INVALID_CLAIM_STATUS")
    if claim == "OBSERVED" and not evidence.get("independent_observation"):
        raise ValidationError("OBSERVED_REQUIRES_ACCOUNT_EVIDENCE")
    for field in ("post_published_at", "reset_event_at", "deadline_at"):
        value = obj.get(field)
        if value is not None:
            try:
                time = datetime.fromisoformat(value)
                if time.tzinfo is None or time.utcoffset() is None:
                    raise ValueError("timezone missing")
            except (TypeError, ValueError) as exc:
                raise ValidationError("INVALID_TIMEZONE: " + field) from exc
    fields = obj.get("poster")
    if not isinstance(fields, dict):
        raise ValidationError("POSTER_FIELDS_REQUIRED")
    if isinstance(fields.get("quote"), str) and (fields["quote"].count("\n") > 1 or len(fields["quote"]) > 38):
        raise ValidationError("TOO_DENSE: reset copy exceeds two short lines")
    for k in ("date", "hero", "source_label", "quote", "footnote"):
        flatten_text(fields.get(k), k, max_chars=80 if k == "footnote" else 60)
    if fields["source_label"] not in ("原帖摘要", "原帖节选", "原帖摘译"):
        raise ValidationError("INVALID_SOURCE_LABEL")
    if fields["footnote"].count("\n") > 1:
        raise ValidationError("TOO_DENSE: footnote > 2 lines")
    if any(c.isdigit() for c in fields["hero"]) and ":" in fields["hero"] and not (obj.get("reset_event_at") or obj.get("deadline_at")):
        raise ValidationError("UNSOURCED_TIME: hero clock requires event or deadline timestamp")
    if obj.get("deadline_at") and not obj.get("reset_event_at") and "前" not in fields["hero"] and "预计" not in fields["hero"]:
        raise ValidationError("DEADLINE_MUST_BE_LABELLED_AS_FORECAST")
    flatten_text(obj.get("title"), "title", max_chars=100)
    flatten_text(obj.get("caption"), "caption", max_chars=2500)
    if obj.get("render_mode", "text_region_edit") != "text_region_edit":
        raise ValidationError("INVALID_RENDER_MODE")
    return evidence

def measure_lines(text, draw, font, available_width, max_lines):
    result = []
    for paragraph in text.split("\n"):
        line = ""
        for char in paragraph:
            if draw.textlength(line + char, font=font) <= available_width:
                line += char
            else:
                if not line:
                    return None
                result.append(line)
                line = char
        result.append(line)
    return result if len(result) <= max_lines else None

def fit_text(draw, text, font_path, box, max_size, min_size, max_lines):
    width, height = box[2]-box[0], box[3]-box[1]
    for size in range(max_size, min_size-1, -2):
        font = ImageFont.truetype(font_path, size)
        lines = measure_lines(text, draw, font, width-12, max_lines)
        if not lines:
            continue
        line_height = round(size * 1.34)
        if line_height * len(lines) > height - 10:
            continue
        return font, lines, line_height, size
    raise ValidationError("TOO_DENSE: " + text[:32])

def clear_slot(base, output, box):
    """Approximate blank background using the two empty outer margins.

    Only pixels inside the allowed edit rectangle are ever written.
    Background texture reproduction inside the rectangle is not guaranteed.
    """
    x0, y0, x1, y1 = box
    p = base.load()
    d = ImageDraw.Draw(output)
    w = base.width
    for y in range(y0, y1):
        left = p[min(w-1, 30), y][:3]
        right = p[max(0, w-31), y][:3]
        if left == right:
            d.line((x0,y,x1-1,y), fill=left)
        else:
            for x in range(x0, x1):
                t = (x-x0)/max(1,x1-x0-1)
                output.putpixel((x,y),tuple(round(a*(1-t)+b*t) for a,b in zip(left,right)))

def pixel_difference(a, b, box):
    if a.size != b.size:
        return None
    v = ImageChops.difference(a.crop(box).convert("RGB"),b.crop(box).convert("RGB"))
    return sum(1 for rgb in v.get_flattened_data() if rgb != (0,0,0))

def run(data, output_dir, *, base_path=None, font_path=None):
    evidence = validated_input(data)
    image = Path(base_path) if base_path else next((p for p in DEFAULTS if p.is_file()), None)
    if not image or not image.is_file():
        raise ValidationError("BASE_IMAGE_UNAVAILABLE")
    raw = image.read_bytes()
    observed_sha = blob_sha(raw)
    if observed_sha != EXPECTED_BLOB:
        raise ValidationError("BASE_HASH_MISMATCH: expected canonical Git blob " + EXPECTED_BLOB)
    font_path = choose_font(font_path)
    with Image.open(image) as opened:
        if opened.mode == "RGBA" and opened.getextrema()[3] != (255, 255):
            raise ValidationError("BASE_NONOPAQUE_UNSUPPORTED")
        base = opened.convert("RGB")
    w,h = base.size
    if w*4 != h*3:
        raise ValidationError("INVALID_ASPECT_RATIO: expected 3:4")
    layout = json.loads(LAYOUT.read_text(encoding="utf-8"))
    rw,rh = layout["reference_dimensions"]
    edit = {k:rect(v,w,h,rw,rh) for k,v in layout["editable_regions"].items()}
    protected = {k:rect(v,w,h,rw,rh) for k,v in layout["protected_regions"].items()}
    for k,box in edit.items():
        if not (0 <= box[0] < box[2] <= w and 0 <= box[1] < box[3] <= h):
            raise ValidationError("INVALID_REGION: " + k)
        for name,other in protected.items():
            if intersection(box,other):
                raise ValidationError(f"REGION_OVERLAP: {k} intersects {name}")
    for a,box in edit.items():
        for b,other in edit.items():
            if a < b and intersection(box,other):
                raise ValidationError(f"EDIT_REGION_OVERLAP: {a} {b}")
    out=base.copy()
    slots={"date":(90,52,1,(39,42,52)), "hero":(188,78,1,(8,8,10)),
           "source_label":(32,22,1,(76,83,100)),
           "quote":(49,32,2,(42,47,56)), "footnote":(26,18,2,(93,100,118))}
    bounds={}
    for k,box in edit.items():
        clear_slot(base,out,box)
        d=ImageDraw.Draw(out)
        max_size,min_size,max_lines,color=slots[k]
        font,lines,line_h,size=fit_text(d,data["poster"][k],font_path,box,max_size,min_size,max_lines)
        xx,yy=box[:2]
        text_boxes=[]
        for line in lines:
            bbox=d.textbbox((0,0),line,font=font)
            textw=bbox[2]-bbox[0]
            texth=bbox[3]-bbox[1]
            left=xx+5; top=yy+6+(len(text_boxes)*line_h)
            if left+textw >= box[2]-3 or top+texth >= box[3]-3:
                raise ValidationError("TEXT_OUT_OF_BOUNDS: " + k)
            d.text((left-bbox[0],top-bbox[1]),line,font=font,fill=color)
            text_boxes.append([left,top,left+textw,top+texth])
        bounds[k]={"rectangle":box,"lines":lines,"font_px":size,"text_bounds":text_boxes}
    outside=0
    diff=ImageChops.difference(base,out).convert("RGB")
    pp=diff.load()
    for y in range(h):
        for x in range(w):
            if pp[x,y] != (0,0,0) and not any(z[0]<=x<z[2] and z[1]<=y<z[3] for z in edit.values()):
                outside+=1
    protected_diffs={k:pixel_difference(base,out,box) for k,box in protected.items()}
    if outside != 0 or any(protected_diffs.values()):
        raise ValidationError("PIXEL_PRESERVATION_FAILED")
    output_dir.mkdir(parents=True,exist_ok=True)
    out.save(output_dir/"poster.png")
    (output_dir/"title.txt").write_text(data["title"].strip()+"\n",encoding="utf-8")
    (output_dir/"caption.md").write_text(data["caption"].strip()+"\n",encoding="utf-8")
    return {
        "status":"READY_FOR_REVIEW", "renderer":"text_region_edit", "source_provenance":evidence,
        "provenance_verification":"OPERATOR_SUPPLIED_NOT_FETCHED_BY_RENDERER",
        "claim_status":data["claim_status"],"post_published_at":data.get("post_published_at"),
        "reset_event_at":data.get("reset_event_at"),"deadline_at":data.get("deadline_at"),
        "image":{"width":w,"height":h,"format":"PNG","base_sha256":hashlib.sha256(raw).hexdigest(),
                 "base_git_blob_sha":observed_sha},
        "editable_rectangles":bounds,"protected_pixel_differences":protected_diffs,
        "pixels_changed_outside_editable_regions":outside,"text_bounds_pass":True,
        "thumbnail_360_review":"NOT_RUN (manual P1)"
    }

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input",required=True,type=Path,help="Prepared evidence and layout JSON")
    parser.add_argument("--out-dir",required=True,type=Path)
    parser.add_argument("--base",type=Path,help="Override exact canonical base image path")
    parser.add_argument("--font",help="Installed Chinese font file (.ttc/.ttf); not bundled")
    args=parser.parse_args()
    args.out_dir.mkdir(parents=True,exist_ok=True)
    try:
        spec=json.loads(args.input.read_text(encoding="utf-8"))
        result=run(spec,args.out_dir,base_path=args.base,font_path=args.font)
        code=0
    except (ValidationError,ValueError,FileNotFoundError,OSError,json.JSONDecodeError) as exc:
        result={"status":"INCOMPLETE","renderer":"text_region_edit","reason":str(exc)}
        code=2
    (args.out_dir/"qa.json").write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(result,ensure_ascii=False,indent=2))
    return code

if __name__ == "__main__":
    sys.exit(main())
