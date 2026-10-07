"""UI-independent, bounded-memory image pipeline and XTCH writer.
XTH encoding adapted from feeeeeeen/XteinkImageRefiner (MIT).
See licenses/ and docs/DEVELOPMENT.md for format cross-checks.
"""
from dataclasses import dataclass
from pathlib import Path
import hashlib
import os
import re
import struct
import tempfile
import time
import warnings
import numpy as np
from PIL import Image, ImageOps, ImageEnhance

EXTENSIONS = {'.jpg', '.jpeg', '.png'}
Image.MAX_IMAGE_PIXELS = 50_000_000

@dataclass(frozen=True)
class Settings:
    width: int = 528
    height: int = 792
    mode: str = 'fit'
    brightness: int = 0
    contrast: int = 0
    dither: str = 'Floyd-Steinberg'

@dataclass(frozen=True)
class Page:
    path: str
    group: str
    label: str

def natural_key(value):
    return tuple((1, int(s)) if s.isdigit() else (0, s.casefold())
                 for s in re.split(r'(\d+)', str(value)))

def discover(paths):
    pages, seen = [], set()
    for value in paths:
        root = Path(value).resolve()
        candidates = root.rglob('*') if root.is_dir() else [root]
        for p in candidates:
            if p.suffix.lower() not in EXTENSIONS or not p.is_file():
                continue
            resolved = str(p.resolve())
            if resolved in seen:
                continue
            seen.add(resolved)
            group = str(root if root.is_dir() else root.parent)
            label = str(p.relative_to(root)) if root.is_dir() else p.name
            pages.append(Page(resolved, group, label))
    return sorted(pages, key=lambda p: (natural_key(p.group), natural_key(p.label)))

def load_image(path, size):
    with warnings.catch_warnings():
        warnings.simplefilter('error', Image.DecompressionBombWarning)
        with Image.open(path) as src:
            # JPEG draft decoding saves memory; PNG still needs one full image.
            src.draft('RGB', (size[0] * 2, size[1] * 2))
            img = ImageOps.exif_transpose(src)
            img.thumbnail((size[0] * 4, size[1] * 4), Image.Resampling.LANCZOS)
            rgba = img.convert('RGBA')
            white = Image.new('RGBA', rgba.size, 'white')
            white.alpha_composite(rgba)
            return white.convert('RGB')

def process(path, settings=Settings()):
    s = settings
    if s.mode not in ('fit', 'fill') or s.dither not in ('None', 'Floyd-Steinberg', 'Bayer'):
        raise ValueError('Unsupported processing setting')
    size = (s.width, s.height)
    image = load_image(path, size)
    if s.mode == 'fill':
        image = ImageOps.fit(image, size, Image.Resampling.LANCZOS)
    else:
        image = ImageOps.pad(image, size, Image.Resampling.LANCZOS, color='white')
    image = image.convert('L')
    image = ImageEnhance.Brightness(image).enhance(1 + s.brightness / 100)
    image = ImageEnhance.Contrast(image).enhance(1 + s.contrast / 100)
    if s.dither == 'Bayer':
        matrix = np.array([[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]], dtype=np.float32)
        threshold = np.tile((matrix + .5) / 16 - .5, ((s.height+3)//4, (s.width+3)//4))[:s.height,:s.width]
        a = np.clip(np.asarray(image, dtype=np.float32) / 85 + threshold, 0, 3)
        return Image.fromarray((np.floor(a + .5) * 85).astype(np.uint8))
    palette = Image.new('P', (1, 1))
    palette.putpalette([v for n in (0,85,170,255) for v in (n,n,n)] + [255]*756)
    return image.convert('RGB').quantize(palette=palette, dither=(Image.Dither.FLOYDSTEINBERG
        if s.dither == 'Floyd-Steinberg' else Image.Dither.NONE)).convert('L')

def encode_xth(image):
    w, h = image.size
    if not 0 < w <= 65535 or not 0 < h <= 65535:
        raise ValueError('Invalid dimensions')
    a = np.asarray(image.convert('L'))
    # Actual plane bytes: white 00, dark 01, light 10, black 11.
    codes = np.array([3,1,2,0], dtype=np.uint8)[a // 64]
    scan = codes[:, ::-1].T
    payload = np.packbits(scan >> 1, axis=1).tobytes() + np.packbits(scan & 1, axis=1).tobytes()
    return struct.pack('<4sHHBBI8s', b'XTH\0', w, h, 0, 0, len(payload),
                       hashlib.md5(payload).digest()[:8]) + payload

class Cancelled(Exception):
    pass

def export_xtch(pages, destination, settings=Settings(), progress=lambda n,total: None,
                cancelled=lambda: False):
    """One image at a time; atomic replacement only on successful completion."""
    if not 1 <= len(pages) <= 65535:
        raise ValueError('ページ数は1〜65535にしてください。')
    dest = Path(destination)
    data_offset = 312 + 16 * len(pages)
    fd, temp = tempfile.mkstemp(prefix='.' + dest.name + '.', suffix='.partial', dir=dest.parent)
    try:
        with os.fdopen(fd, 'w+b') as out:
            out.write(struct.pack('<4sHHBBBBIQQQQQ', b'XTCH', 0x0001, len(pages),
                                  0,1,0,0,1,56,312,data_offset,0,0))
            meta = bytearray(256)
            title = dest.stem.encode('utf-8')[:127].decode('utf-8', errors='ignore').encode('utf-8')
            meta[:len(title)] = title
            meta[192:200] = b'X3 Batch'
            meta[224:226] = b'ja'
            struct.pack_into('<I', meta, 240, int(time.time()))
            out.write(meta)
            out.write(bytes(16 * len(pages)))
            for i, page in enumerate(pages):
                if cancelled():
                    raise Cancelled('書き出しを中止しました。')
                try:
                    image = process(page.path, settings)
                    blob = encode_xth(image)
                except Exception as exc:
                    raise RuntimeError(f'{page.label}: {exc}') from exc
                position = out.tell()
                out.write(blob)
                end = out.tell()
                out.seek(312 + 16*i)
                out.write(struct.pack('<QIHH', position, len(blob), settings.width, settings.height))
                out.seek(end)
                progress(i+1, len(pages))
            if cancelled():
                raise Cancelled('書き出しを中止しました。')
            out.flush()
            os.fsync(out.fileno())
        os.replace(temp, dest)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)
