#!/usr/bin/env python3
"""Build a self-contained Skill zip from one canonical project poster (no network)."""
import argparse
import hashlib
import json
import shutil
import tempfile
import zipfile
from pathlib import Path

NAME = "tibo-reset-post-generator"
CANONICAL = "codex-10-26极简重置更新公告海报.png"
GIT_SHA = "44fee2832dd283e8f168a7ca1eee6a71bd3e0416"
PROJECT = Path(__file__).resolve().parent
SKILL = PROJECT / ".agents/skills" / NAME
BASE = PROJECT / "assets" / CANONICAL

def git_blob_sha(raw):
    return hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest()

def build(out):
    if not SKILL.joinpath("SKILL.md").is_file() or not SKILL.joinpath("references/layout.json").is_file():
        raise ValueError("SKILL_SOURCE_INCOMPLETE: missing SKILL.md or layout")
    if not BASE.is_file():
        raise ValueError("BASE_IMAGE_UNAVAILABLE: need real repo checkout")
    data = BASE.read_bytes()
    if git_blob_sha(data) != GIT_SHA:
        raise ValueError("BASE_HASH_MISMATCH: refuse to package non-canonical image")
    with tempfile.TemporaryDirectory() as directory:
        dest = Path(directory) / NAME
        shutil.copytree(SKILL, dest)
        assets = dest / "assets"
        assets.mkdir(exist_ok=True)
        (assets / "base-poster.png").write_bytes(data)
        (assets / "asset-manifest.json").write_text(json.dumps({
            "git_blob_sha": GIT_SHA,
            "sha256": hashlib.sha256(data).hexdigest(),
            "size_bytes": len(data),
            "file": "base-poster.png"
        }, indent=2) + "\n", encoding="utf-8")
        out.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for path in sorted(dest.rglob("*")):
                if path.is_file() and not ("__pycache__" in path.parts or path.suffix == ".pyc"):
                    archive.write(path, path.relative_to(dest.parent))
    return out

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=PROJECT / "dist" / f"{NAME}.zip")
    args = parser.parse_args()
    print(build(args.out))
