"""Prepare 21:9 hero plates and a seamless silent VP9 loop from original scene plates.

Requires Pillow, NumPy, imageio-ffmpeg. Source PNGs are working images, not bundled.
Usage: python scripts/media/build-scenery.py waves.png rain.png nebula.png
       python scripts/media/build-scenery.py --ocean-loop  # reuse the bundled poster
"""
import argparse
import subprocess
from pathlib import Path

from PIL import Image, ImageOps
import imageio_ffmpeg
import numpy as np

out = Path(__file__).resolve().parents[2] / 'src/assets/scenes'
size = (1440, 618)


def build_loop(plate):
    width, height = size
    swells = np.asarray(plate, dtype=np.float32)
    y, x = np.indices((height, width), dtype=np.float32)
    depth = np.clip((y - height*.33) / (height*.67), 0, 1)
    v = depth ** .9
    a = 6.1*depth + (x / width)*4.992
    b = 16*depth + (x / width)*14.4
    c = 30*depth - (x / width)*35.232
    halo = .018 * v
    scale = width / 960
    command = [imageio_ffmpeg.get_ffmpeg_exe(), '-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24',
               '-s', f'{width}x{height}', '-r', '24', '-i', '-', '-an', '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '27',
               '-row-mt', '1', '-deadline', 'good', '-cpu-used', '4', '-threads', '5', '-pix_fmt', 'yuv420p', str(out/'ocean.webm')]
    with subprocess.Popen(command, stdin=subprocess.PIPE) as encoder:
        frames = 144
        for i in range(frames):
            t = 2*np.pi*i/frames
            swell = np.sin(a-2*t)
            ripples = np.sin(b-3*t)
            fine = np.sin(c-4*t)
            xx = np.clip(x + scale * v*(swell*7.2 + ripples*2.4 + fine*1.0), 0, width-1.01)
            yy = np.clip(y + scale * v*(swell*7.8 + ripples*3 + fine*1.0), 0, height-1.01)
            col, row = xx.astype('int32'), yy.astype('int32')
            wx, wy = (xx-col)[...,None], (yy-row)[...,None]
            frame = (swells[row, col]*(1-wx) + swells[row, col+1]*wx)*(1-wy) + (swells[row+1, col]*(1-wx) + swells[row+1, col+1]*wx)*wy
            frame *= (1 + halo*np.cos(b-3*t))[...,None]
            encoder.stdin.write(np.clip(frame, 0, 255).astype('uint8').tobytes())
        encoder.stdin.close()
        if encoder.wait():
            raise RuntimeError('VP9 encoding failed')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('plates', nargs='*')
    parser.add_argument('--ocean-loop', action='store_true')
    args = parser.parse_args()
    if args.ocean_loop and not args.plates:
        build_loop(Image.open(out/'ocean.webp').convert('RGB'))
    elif not args.ocean_loop and len(args.plates) == 3:
        for tag, path in zip(['ocean', 'rain', 'nebula'], args.plates):
            plate = ImageOps.fit(Image.open(path).convert('RGB'), size, Image.Resampling.LANCZOS)
            plate.save(out/f'{tag}.webp', quality=83, method=6)
        build_loop(Image.open(out/'ocean.webp').convert('RGB'))
    else:
        parser.error('supply three source plates or --ocean-loop')
