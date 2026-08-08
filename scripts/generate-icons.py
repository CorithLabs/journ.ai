#!/usr/bin/env python3
"""Generate the app icon set from one definition.

Run: python scripts/generate-icons.py

The icons are committed, so this only needs running when the mark changes.
Keeping the generator in the repo means the icons are readable and editable
rather than binaries nobody can touch, and every size stays in step: a favicon
redrawn by hand at 16px drifts from the 512px one within two revisions.

No image libraries are used — PNG and ICO are both written directly, so this
runs on a clean checkout with nothing installed.

The mark is a map pin on the app's own dark ground, in the cyan accent
(--color-accent, #06b6d4) taken from index.css. The pin sits inside the middle
60% so it survives the circular crop Android applies to a maskable icon.
"""

import os
import struct
import zlib

OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'public')

# Straight from index.css, so the icon cannot drift from the app.
GROUND_TOP = (0x0F, 0x1B, 0x2E)
GROUND_BOTTOM = (0x0A, 0x0F, 0x1A)
ACCENT = (0x06, 0xB6, 0xD4)
ACCENT_LIGHT = (0x67, 0xE8, 0xF9)

SUPERSAMPLE = 4


def lerp(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def rounded_rect_contains(x, y, radius):
    """x, y in [0,1] against a unit square with corner `radius`."""
    cx = min(max(x, radius), 1 - radius)
    cy = min(max(y, radius), 1 - radius)
    dx, dy = x - cx, y - cy
    return dx * dx + dy * dy <= radius * radius


def pin_contains(x, y):
    """A map pin: a disc with a tail that tapers to a point below it."""
    # Disc
    cx, cy, r = 0.5, 0.42, 0.185
    if (x - cx) ** 2 + (y - cy) ** 2 <= r * r:
        return True
    # Tail — a triangle from the disc's flanks down to the tip.
    tip_y = 0.80
    if cy <= y <= tip_y:
        t = (y - cy) / (tip_y - cy)
        half = r * (1 - t) * 0.95
        if abs(x - cx) <= half:
            return True
    return False


def pin_hole_contains(x, y):
    return (x - 0.5) ** 2 + (y - 0.42) ** 2 <= 0.072 ** 2


def sample(x, y):
    """Colour at a point in [0,1]², or None where the icon is transparent."""
    if not rounded_rect_contains(x, y, 0.22):
        return None
    ground = lerp(GROUND_TOP, GROUND_BOTTOM, y)
    if pin_contains(x, y) and not pin_hole_contains(x, y):
        # Lit from the top left, the way the app's ambient glow rises.
        return lerp(ACCENT_LIGHT, ACCENT, min(1.0, (x + y) / 1.6))
    return ground


def render(size):
    """RGBA rows, supersampled for smooth edges at small sizes."""
    rows = []
    step = 1.0 / (size * SUPERSAMPLE)
    for py in range(size):
        row = bytearray()
        for px in range(size):
            r = g = b = a = 0
            for sy in range(SUPERSAMPLE):
                for sx in range(SUPERSAMPLE):
                    x = (px * SUPERSAMPLE + sx + 0.5) * step
                    y = (py * SUPERSAMPLE + sy + 0.5) * step
                    c = sample(x, y)
                    if c is not None:
                        r += c[0]
                        g += c[1]
                        b += c[2]
                        a += 255
            n = SUPERSAMPLE * SUPERSAMPLE
            covered = a // 255
            if covered:
                row += bytes((r // covered, g // covered, b // covered, a // n))
            else:
                row += b'\x00\x00\x00\x00'
        rows.append(bytes(row))
    return rows


def png(size):
    rows = render(size)
    raw = b''.join(b'\x00' + row for row in rows)

    def chunk(tag, data):
        return (
            struct.pack('>I', len(data))
            + tag
            + data
            + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    return (
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
        + chunk(b'IDAT', zlib.compress(raw, 9))
        + chunk(b'IEND', b'')
    )


def ico(sizes):
    """An ICO wrapping PNG payloads — supported everywhere that still asks for
    a .ico, and far smaller than the uncompressed BMP form."""
    images = [(s, png(s)) for s in sizes]
    header = struct.pack('<HHH', 0, 1, len(images))
    offset = len(header) + 16 * len(images)
    entries = b''
    body = b''
    for size, data in images:
        entries += struct.pack(
            '<BBBBHHII', size if size < 256 else 0, size if size < 256 else 0,
            0, 0, 1, 32, len(data), offset,
        )
        body += data
        offset += len(data)
    return header + entries + body


SVG = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs>
    <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0f1b2e"/>
      <stop offset="1" stop-color="#0a0f1a"/>
    </linearGradient>
    <linearGradient id="pin" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#67e8f9"/>
      <stop offset="1" stop-color="#06b6d4"/>
    </linearGradient>
  </defs>
  <rect width="100" height="100" rx="22" fill="url(#ground)"/>
  <path d="M50 23.5a18.5 18.5 0 0 0-18.5 18.5c0 13.5 18.5 38 18.5 38s18.5-24.5 18.5-38A18.5 18.5 0 0 0 50 23.5z" fill="url(#pin)"/>
  <circle cx="50" cy="42" r="7.2" fill="#0a0f1a"/>
</svg>
'''


def write(path, data):
    full = os.path.join(OUT_DIR, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    mode = 'w' if isinstance(data, str) else 'wb'
    with open(full, mode, **({'encoding': 'utf-8'} if isinstance(data, str) else {})) as f:
        f.write(data)
    print(f'  {path} ({len(data)} bytes)')


if __name__ == '__main__':
    print('Writing icons to public/')
    write('favicon.svg', SVG)
    write('favicon.ico', ico([16, 32, 48]))
    write('apple-touch-icon.png', png(180))
    write('icons/icon-192.png', png(192))
    write('icons/icon-512.png', png(512))
