"""A 34-second original 7/8 cue for the split-screen study. No model, sample bank or API."""
import argparse
import math
from pathlib import Path
import subprocess
import tempfile

import numpy as np
import soundfile as sf


def compose():
    rate = 48000
    duration = 34
    eighth = 60 / 105 / 2
    mix = np.zeros((rate * duration, 2), dtype=np.float64)
    rng = np.random.default_rng(940517)

    def place(at, mono, pan, gain):
        start = round(at * rate)
        length = min(len(mono), len(mix) - start)
        if length <= 0:
            return
        stereo = np.array([math.cos(pan * math.pi / 2), math.sin(pan * math.pi / 2)])
        mix[start:start + length] += gain * mono[:length, None] * stereo

    def struck(at, midi, kind, gain, pan):
        frequency = 440 * 2 ** ((midi - 69) / 12)
        t = np.arange(round(1.8 * rate)) / rate
        modes = [(1, 1, .38), (3.99, .19, .14), (9.02, .06, .055)]
        if kind == "porcelain":
            modes = [(1, 1, .52), (2.62, .30, .20), (4.13, .12, .13)]
        tone = sum(level * np.sin(2 * np.pi * frequency * multiple * t)
                   * np.exp(-t / decay) for multiple, level, decay in modes)
        tap = rng.normal(0, .075, len(t)) * np.exp(-t / .008)
        place(at, (tone + tap) * np.minimum(t / .004, 1), pan, gain)

    def bass(at, midi, length, gain):
        t = np.arange(round(length * rate)) / rate
        phase = 2 * np.pi * 440 * 2 ** ((midi - 69) / 12) * t
        envelope = np.minimum(t / .042, 1) * np.minimum((length - t) / .16, 1)
        place(at, (np.sin(phase) + .15 * np.sin(phase * 2)) * envelope, .51, gain)

    roots = [50, 50, 53, 55, 50, 48, 50, 50, 50, 50, 53, 55, 57, 55, 50, 53, 50]
    upper_answers = [69, 67, 64, 62]
    for bar, root in enumerate(roots):
        at = bar * 7 * eighth
        if bar < 7 or 10 <= bar < 14:
            bass(at, root - 12, .83, .18)
            struck(at, root + 12, "wood", .29, .31)
            struck(at + 3 * eighth, root + 19, "wood", .15, .39)
        if bar < 5:
            struck(at + 5 * eighth + .022, upper_answers[bar % 4], "porcelain", .13, .69)
        elif 5 <= bar < 10:
            struck(at + .024, 62, "wood", .15 - (bar - 5) * .024, .34)
        elif 10 <= bar < 14:
            for step, note in ((1, root + 12), (4, root + 16), (6, root + 19)):
                struck(at + step * eighth + .012, note, "porcelain", .12 + (bar - 10) * .025, .67)
        else:
            # At the single table image both registers move toward centre.
            bass(at, root - 12, 1.57, .13)
            struck(at + eighth, root + 12, "wood", .23, .42)
            struck(at + (3 if bar % 2 else 4) * eighth, root + 19, "porcelain", .16, .59)

    dry = mix.copy()
    for delay, amount in ((.039, .095), (.067, .07), (.103, .045)):
        offset = round(delay * rate)
        mix[offset:] += amount * dry[:-offset, ::-1]
    fade = int(rate * .65)
    mix[-fade:] *= np.linspace(1, 0, fade)[:, None]
    return mix, rate


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    with tempfile.TemporaryDirectory() as scratch:
        recording = Path(scratch) / "score.wav"
        samples, rate = compose()
        sf.write(recording, samples, rate, subtype="PCM_24")
        subprocess.run(["ffmpeg", "-v", "error", "-n", "-i", str(recording), "-af",
                        "loudnorm=I=-17:TP=-2:LRA=10", "-ar", str(rate), "-c:a",
                        "pcm_s24le", str(args.output)], check=True)


if __name__ == "__main__":
    main()
