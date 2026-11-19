"""Prepare 21:9 hero plates and a seamless silent VP9 loop from original scene plates.

Requires Pillow, NumPy, imageio-ffmpeg. Source PNGs are working images, not bundled.
Usage from the repo root: python scripts/media/build-scenery.py waves.png rain.png nebula.png
"""
import sys
import subprocess
from PIL import Image, ImageOps
import imageio_ffmpeg
import numpy as np

width, height = 1600, 686
out = 'src/assets/scenes/'
for tag, path in zip(['ocean', 'rain', 'nebula'], sys.argv[1:]):
    size = (width, height) if tag == 'ocean' else (1920, 824)
    plate = ImageOps.fit(Image.open(path).convert('RGB'), size, Image.Resampling.LANCZOS)
    plate.save(out + tag + '.webp', quality=88, method=6)
    if tag != 'ocean':
        continue
    swells = np.asarray(plate, dtype=np.float32)
    y, x = np.indices((height, width), dtype=np.float32)
    depth = np.clip((y - height*.33) / (height*.67), 0, 1)
    v = depth ** .9
    a = 6.1*depth + x*.0031
    b = 16*depth + x*.009
    c = 30*depth - x*.022
    halo = .018 * v
    command = [imageio_ffmpeg.get_ffmpeg_exe(), '-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24',
               '-s', f'{width}x{height}', '-r', '24', '-i', '-', '-an', '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '27',
               '-row-mt', '1', '-deadline', 'good', '-cpu-used', '4', '-threads', '5', '-pix_fmt', 'yuv420p', out+'ocean.webm']
    with subprocess.Popen(command, stdin=subprocess.PIPE) as encoder:
        frames = 144
        for i in range(frames):
            t = 2*np.pi*i/frames
            swell = np.sin(a-2*t)
            ripples = np.sin(b-3*t)
            fine = np.sin(c-4*t)
            xx = np.clip(x + v*(swell*12 + ripples*4 + fine*1.7), 0, width-1.01)
            yy = np.clip(y + v*(swell*13 + ripples*5 + fine*1.7), 0, height-1.01)
            col, row = xx.astype('int32'), yy.astype('int32')
            wx, wy = (xx-col)[...,None], (yy-row)[...,None]
            frame = (swells[row, col]*(1-wx) + swells[row, col+1]*wx)*(1-wy) + (swells[row+1, col]*(1-wx) + swells[row+1, col+1]*wx)*wy
            frame *= (1 + halo*np.cos(b-3*t))[...,None]
            encoder.stdin.write(np.clip(frame, 0, 255).astype('uint8').tobytes())
        encoder.stdin.close()
        if encoder.wait():
            raise RuntimeError('VP9 encoding failed')
