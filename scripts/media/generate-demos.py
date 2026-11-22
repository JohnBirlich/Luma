"""Build the five original, procedural Luma demo tracks and their covers.

Requires NumPy, Pillow and imageio-ffmpeg: python -m pip install numpy pillow imageio-ffmpeg
Run from the repository root. No samples or service audio are used.
"""
from math import pi
from pathlib import Path
import subprocess

import imageio_ffmpeg
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

RATE = 44100
DEMOS = [
    ('night-garage', 'Ночной гараж', 'Рок', 116, 16, 4, (225, 87, 56)),
    ('blue-cafe', 'Синее кафе', 'Джаз', 142, 20, 4, (60, 181, 171)),
    ('district-beat', 'Бит квартала', 'Хип-хоп', 86, 12, 4, (210, 111, 211)),
    ('glass-waltz', 'Стеклянный вальс', 'Классика', 104, 19, 3, (224, 182, 103)),
    ('signal-loop', 'Сигнальный контур', 'Синтвейв', 126, 18, 4, (92, 151, 240)),
]
PROGRESSIONS = {
    'night-garage': [(40, 52, 59), (43, 55, 62), (38, 50, 57), (45, 57, 64)],
    'blue-cafe': [(48, 63, 67, 70, 74), (41, 60, 63, 67, 69), (43, 59, 65, 70, 75), (45, 60, 64, 67, 71)],
    'district-beat': [(41, 65, 68, 72), (49, 61, 65, 68), (44, 63, 68, 72), (46, 62, 65, 70)],
    'glass-waltz': [(48, 60, 63, 67), (43, 59, 62, 67), (44, 60, 63, 68), (46, 58, 62, 65)],
    'signal-loop': [(42, 66, 69, 73), (38, 62, 66, 69), (45, 64, 69, 73), (40, 64, 68, 71)],
}


def arrange(slug, bpm, bars, meter):
    beat = 60 / bpm
    duration = bars * meter * beat
    buf = np.zeros((round(duration * RATE), 2), dtype=np.float32)
    rng = np.random.default_rng(bpm)

    def event(at, seconds, amp, kind, pitch=0, pan=0):
        start = round(at * beat * RATE)
        length = min(round(seconds * RATE), len(buf) - start)
        if length <= 0:
            return
        t = np.arange(length) / RATE
        phase = 2 * pi * 440 * 2 ** ((pitch - 69) / 12) * t
        fade = np.minimum(1, t / .007) * np.minimum(1, (t[-1] - t) / .028)
        if kind == 'kick':
            wave = np.sin(2*pi*(49*t + 31*(1-np.exp(-58*t))/58)) * np.exp(-15*t)
        elif kind == 'snare':
            wave = (rng.uniform(-1, 1, length) * .75 + .24*np.sin(2*pi*178*t)) * np.exp(-19*t)
        elif kind == 'hat':
            wave = np.diff(rng.uniform(-.8, .8, length+1)) * np.exp(-38*t)
        elif kind == 'bass':
            wave = (.86*np.sin(phase) + .18*np.sin(phase*2)) * np.exp(-1.9*t)
        elif kind == 'guitar':
            wave = np.tanh(2.7*(.67*np.sin(phase)+.24*np.sin(2*phase)+.13*np.sin(3*phase)*np.exp(-7*t))) * np.exp(-3.8*t)
        elif kind == 'synth':
            wave = sum(np.sin(phase*n + .13*n*np.sin(2*pi*4.6*t))/n**1.32 for n in range(1, 7)) * np.exp(-2.8*t)
        else:
            wave = (.78*np.sin(phase)*np.exp(-2.9*t)+.16*np.sin(phase*2.005)*np.exp(-4.4*t)+.11*np.sin(phase*3.011)*np.exp(-7*t))
        wave *= fade * amp
        buf[start:start+length] += np.column_stack((wave*(1-pan*.45), wave*(1+pan*.45)))

    for bar in range(bars):
        base = bar*meter
        root, *chord = PROGRESSIONS[slug][bar % 4]
        if slug == 'night-garage':
            for offset in [0, .5, 1, 1.75, 2, 2.5, 3.25]:
                event(base+offset, .43*beat, .16, 'bass', root)
                for k, note in enumerate(chord):
                    event(base+offset, .55*beat, .075, 'guitar', note, (-1)**k*.57)
            if bar % 4 > 1:
                for k, offset in enumerate([.5, 1.5, 2.25, 3.25]):
                    event(base+offset, .53*beat, .09, 'guitar', chord[0]+12+[0, 3, 7, 5][k], .47)
        elif slug == 'blue-cafe':
            for k in range(4):
                event(base+k, .89*beat, .16, 'bass', root-12+[0, 7, 12, 10][k])
            for offset in [.66, 1.66, 2.66, 3.66]:
                for k, note in enumerate(chord):
                    event(base+offset+.012*k, .52*beat, .065, 'keys', note, (k-1.5)*.26)
            for k, offset in enumerate([0, 1, 2.66, 3]):
                event(base+offset, .75*beat, .1, 'keys', chord[k%len(chord)]+12, .29)
        elif slug == 'district-beat':
            for k, offset in enumerate([0, 1.5, 2.75, 3.5]):
                event(base+offset, .68*beat, .19, 'bass', root-12+(7 if k==3 else 0))
                event(base+offset+.12, .95*beat, .085, 'keys', chord[(k+bar)%len(chord)], (-1)**k*.57)
            for k, note in enumerate(chord):
                event(base+.02*k, 2.35*beat, .07, 'keys', note, .45*(k-1))
        elif slug == 'glass-waltz':
            event(base, 2.67*beat, .19, 'keys', root, -.33)
            for k in range(6):
                event(base+k*.5, 1.25*beat, .105 if k else .17, 'keys', chord[k%len(chord)] + (12 if k > 2 else 0), .25)
            continue
        else:
            for k in range(8):
                event(base+k*.5, .44*beat, .14, 'bass', root-12+12*(k%2))
                event(base+k*.5+.235, .5*beat, .075, 'synth', chord[(k+bar)%len(chord)]+12, (-1)**k*.38)
            for k, note in enumerate(chord):
                event(base+.12, 3.78*beat, .058, 'synth', note, .42*(k-1))
        hits = [0, 1, 2, 3] if slug == 'signal-loop' else [0, 2.5, 3.25] if slug == 'district-beat' else [0, 2]
        if slug != 'blue-cafe':
            for offset in hits:
                event(base+offset, .29, .31, 'kick')
        for offset in [1, 3]:
            event(base+offset, .23, .13 if slug == 'blue-cafe' else .24, 'snare', pan=.17)
        for k in range(8):
            event(base+k*.5+(.13 if slug == 'blue-cafe' and k % 2 else 0), .12, .067 if k%2 else .09, 'hat', pan=-.36)
    dry = buf.copy()
    for delay, gain in [(0.061, .12), (.117, .09), (.197, .047)]:
        samples = round(delay*RATE)
        buf[samples:] += dry[:-samples, ::-1] * gain
    tail = round(RATE * 1.05)
    buf[-tail:] *= np.linspace(1, 0, tail)[:, None]
    return (np.tanh(1.27 * buf) * 30900).astype('<i2'), duration


def cover(slug, rgb, seed):
    sz = 450
    canvas = Image.new('RGB', (sz, sz), '#10131d')
    light = Image.new('RGB', canvas.size)
    g = ImageDraw.Draw(light)
    g.ellipse((124, 40, 495, 377), fill=tuple(v//2 for v in rgb))
    canvas = Image.blend(canvas, light.filter(ImageFilter.GaussianBlur(65)), .63)
    d = ImageDraw.Draw(canvas)
    for radius in range(22, 215, 12):
        depth = radius / 215
        color = tuple(round(22+v*(1-depth)*.85) for v in rgb)
        bounds = (225-radius, 225-radius, 225+radius, 225+radius)
        d.arc(bounds, (seed+radius*2)%360, (seed+radius*2)%360+174, fill=color, width=3)
        d.arc(bounds, (seed-radius)%360, (seed-radius)%360+86, fill=color, width=1)
    d.ellipse((189, 189, 261, 261), outline=rgb, width=3)
    d.ellipse((213, 213, 237, 237), fill=rgb)
    canvas.save(Path('public/artwork') / f'{slug}.webp', quality=87, method=6)


if __name__ == '__main__':
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    for slug, title, genre, bpm, bars, meter, rgb in DEMOS:
        samples, duration = arrange(slug, bpm, bars, meter)
        subprocess.run([ffmpeg, '-hide_banner', '-loglevel', 'error', '-y', '-f', 's16le', '-ar', str(RATE), '-ac', '2', '-i', '-',
                        '-c:a', 'libmp3lame', '-b:a', '96k', '-id3v2_version', '3', '-metadata', f'title={title}', '-metadata', 'artist=Luma Sessions',
                        '-metadata', 'album=Демо · Жанры', '-metadata', f'genre={genre}', f'public/demo/{slug}.mp3'], input=samples.tobytes(), check=True)
        cover(slug, rgb, bpm)
        print(slug, f'{duration:.2f}s')
