"""Build one recut in Diffusion Studio using personally supplied shots and the included score."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]


def video_duration(path):
    data = subprocess.check_output([
        "ffprobe", "-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=duration", "-of", "json", str(path),
    ], text=True)
    return float(json.loads(data)["streams"][0]["duration"])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("case")
    parser.add_argument("--list-inputs", action="store_true")
    parser.add_argument("--inputs", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    library = ROOT / "studies"
    catalog = json.loads((library / "index.json").read_text())
    if args.case not in catalog:
        parser.error("Available cases: " + ", ".join(catalog))
    spec = catalog[args.case]
    if args.list_inputs:
        for item in spec["inputs"]:
            print(item["name"], item.get("minimum_seconds", "still image"), item["brief"], sep="  ")
        return
    if args.inputs is None or args.output is None:
        parser.error("Supply --inputs and --output, or use --list-inputs.")
    if args.output.exists():
        parser.error("Choose a fresh project folder.")
    sources = {}
    for item in spec["inputs"]:
        name = item["name"]
        src = args.inputs / name
        if name == "generated-paper.png" and not src.is_file():
            src = library / "paper.png"
        if not src.is_file():
            parser.error(f"Missing {name}. {item['brief']}")
        if "minimum_seconds" in item and video_duration(src) + 0.00001 < item["minimum_seconds"]:
            parser.error(f"{name} needs {item['minimum_seconds']} seconds of picture.")
        sources[name] = src.resolve()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=args.output.parent) as scratch:
        folder = Path(scratch) / "project"
        media = folder / "assets"
        media.mkdir(parents=True)
        for name, src in sources.items():
            (media / name).symlink_to(src)
        subprocess.run([
            "ffmpeg", "-v", "error", "-nostdin", "-i", str(library / spec["score"]),
            "-map_metadata", "-1", "-c:a", "pcm_s24le", str(media / spec["wav"]),
        ], check=True)
        scene = (library / spec["scene_file"]).read_text()
        (folder / "index.tsx").write_text(
            scene.replace("export default function Film()", "function Film()")
            + '\nexport default function Atlas(){ return <stage id="atlas"><Film/></stage>; }\n'
        )
        template = json.loads((ROOT / "timeline/package.json").read_text())
        template["diffusion"]["export"] = {spec["scene_id"]: template["diffusion"]["export"]["film01"]}
        template["displayName"] = spec["title"]
        (folder / "package.json").write_text(json.dumps(template, ensure_ascii=False, indent=2))
        if args.output.exists():
            parser.error("Output appeared during preparation. Choose a fresh folder.")
        os.rename(folder, args.output)
    print(f"Project ready at {args.output.resolve()}")
    print(f"Open in Diffusion Studio, then run: diffusion check {spec['scene_id']}")


if __name__ == "__main__":
    main()
