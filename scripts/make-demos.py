"""Render the original Luma demo cues. Only needed to regenerate the shipped MP3 files.

Usage: python scripts/make-demos.py [path-to-ffmpeg]
"""
from array import array
from math import exp, pi, sin, tanh
from pathlib import Path
from tempfile import TemporaryDirectory
import random
import subprocess
import sys
import wave

TRACKS = [
    ("afterimage", "Afterimage", "Arden Vale", "Midnight Signals", 32, 82, [45, 41, 48, 43], 0),
    ("low-tide", "Low Tide", "Mira Cove", "Saltwater Tapes", 28, 94, [38, 45, 36, 43], 1),
    ("violet-hour", "Violet Hour", "Arden Vale", "Midnight Signals", 34, 73, [49, 45, 52, 47], 2),
    ("paper-satellites", "Paper Satellites", "Halden", "In Soft Focus", 30, 106, [43, 38, 46, 41], 3),
    ("blue-meridian", "Blue Meridian", "North Relay", "Polar Drift", 36, 67, [40, 36, 43, 38], 4),
]
RATE = 44100
TAU = 2 * pi


def note(number):
    return 440 * 2 ** ((number - 69) / 12)


def synth(seconds, bpm, roots, style):
    rng = random.Random(715 + style)
    beat = 60 / bpm
    chords = [(note(root), [note(root + i) for i in (12, 15, 19, 22 if style % 2 else 26)]) for root in roots]
    arpeggio = [0, 2, 1, 3, 2, 0, 3, 1]
    pcm = array('h')
    for sample in range(seconds * RATE):
        t = sample / RATE
        measure = int(t / (beat * 4))
        chord_pos = (t / beat) % 4
        root, tones = chords[measure % len(chords)]
        old_root, old_tones = chords[(measure - 1) % len(chords)]
        mix = min(1, chord_pos * 2)
        pad = 0
        for gain, chord in ((mix, tones), (1 - mix, old_tones)):
            if gain:
                for voice, hz in enumerate(chord):
                    pad += gain * (sin(TAU * hz * t + 0.6 * sin((0.71 + voice * 0.2) * t))
                                   + 0.25 * sin(TAU * hz * 2.003 * t))
        idx = int(t / beat * 2) % len(arpeggio)
        pluck_t = t % (beat / 2)
        hz = tones[arpeggio[(idx + style) % len(arpeggio)]] * (2 if style != 2 else 1)
        pluck = (sin(TAU * hz * pluck_t) + 0.26 * sin(TAU * hz * 2.01 * pluck_t)) * exp(-pluck_t * (6 + style)) * min(1, pluck_t * 160)
        beat_t = t % beat
        kick = sin(TAU * (48 * beat_t + 3.8 * (1 - exp(-beat_t * 21)))) * exp(-beat_t * 18) * min(1, beat_t * 250)
        step_t = t % (beat / 2)
        hat = (rng.random() * 2 - 1) * exp(-step_t * 72) * min(1, step_t * 800)
        bass = (mix * sin(TAU * root * t) + (1 - mix) * sin(TAU * old_root * t)) * (0.66 + 0.34 * sin(TAU * chord_pos / 2) ** 2)
        fade = min(1, t / 0.6, (seconds - t) / 2.1)
        value = tanh(pad * (0.043 + style * 0.003) + 0.135 * pluck + 0.18 * bass + (0.2 if style in (1, 3) else 0.11) * kick + 0.045 * hat)
        pcm.append(round(value * fade * 29500))
    if sys.byteorder != 'little':
        pcm.byteswap()
    return pcm


def main():
    ffmpeg = sys.argv[1] if len(sys.argv) > 1 else 'ffmpeg'
    dest = Path(__file__).resolve().parents[1] / 'public' / 'demo'
    dest.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory() as tmp:
        source = Path(tmp) / 'cue.wav'
        for slug, title, artist, album, seconds, bpm, roots, style in TRACKS:
            with wave.open(str(source), 'wb') as wav:
                wav.setparams((1, 2, RATE, 0, 'NONE', 'not compressed'))
                wav.writeframes(synth(seconds, bpm, roots, style).tobytes())
            subprocess.run([ffmpeg, '-v', 'error', '-y', '-i', str(source), '-c:a', 'libmp3lame', '-b:a', '64k',
                            '-metadata', f'title={title}', '-metadata', f'artist={artist}', '-metadata', f'album={album}',
                            str(dest / f'{slug}.mp3')], check=True)


if __name__ == '__main__':
    main()
