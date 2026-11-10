# /// script
# requires-python = ">=3.10"
# dependencies = ["pillow"]
# ///
"""Draws the Moon Pilot logo: app icons, the wordmark lockup and a presentation sheet.

  uv run tools/make_logo.py [folder-with-Jura-and-DMMono-fonts]
"""
import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT, WWW = ROOT / "brand", ROOT / "www"
FONTS = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.home() / ".claude/skills/canvas-design/canvas-fonts"
INK, DEEP, LINE = (5, 7, 12), (13, 21, 36), (44, 58, 82)
MOON, CRATER, SHADOW = (216, 221, 229), (186, 193, 204), (9, 13, 22)
AMBER, HOT, CYAN, TEXT, DIM = (255, 180, 84), (255, 208, 138), (89, 194, 255), (230, 237, 247), (143, 160, 184)
font = lambda name, size: ImageFont.truetype(str(FONTS / f"{name}.ttf"), size)


def mark(S, plate=True, zoom=1.0):
    """The mark: a moon, an orbit that passes behind and in front of it, the pilot and the ghost.
    zoom > 1 enlarges the drawing inside the plate, for sizes of 48 px and below."""
    N = S * 4                                              # draw 4x larger, shrink at the end for clean edges
    img = Image.new("RGBA", (N, N), (0, 0, 0, 0))
    if plate:
        grad = Image.linear_gradient("L").resize((N, N))
        bg = Image.composite(Image.new("RGB", (N, N), (8, 12, 21)), Image.new("RGB", (N, N), DEEP), grad)
        m = Image.new("L", (N, N), 0)
        ImageDraw.Draw(m).rounded_rectangle([0, 0, N - 1, N - 1], radius=int(.225 * N), fill=255)
        img.paste(bg, (0, 0), m)
        d = ImageDraw.Draw(img)
        d.rounded_rectangle([0, 0, N - 1, N - 1], radius=int(.225 * N), outline=(27, 37, 56), width=max(2, N // 360))
        for x, y, r in () if zoom > 1 else ((.17, .16, 3), (.31, .09, 2), (.63, .13, 2.4), (.88, .56, 2), (.80, .83, 3), (.52, .91, 2), (.12, .40, 2)):
            d.ellipse([x * N - r * N / 1024, y * N - r * N / 1024, x * N + r * N / 1024, y * N + r * N / 1024], fill=(150, 165, 190, 255))
    z = zoom
    cx, cy, phi = (.47 if z == 1 else .485) * N, (.55 if z == 1 else .53) * N, math.radians(-24)
    rm, a, b = .255 * N * z, .40 * N * z, .135 * N * z

    def pt(deg):
        t = math.radians(deg)
        x, y = a * math.cos(t), b * math.sin(t)
        return cx + x * math.cos(phi) - y * math.sin(phi), cy + x * math.sin(phi) + y * math.cos(phi)

    def stroke(color, t0, t1, w0, w1, a0=1.0, a1=1.0, glow=0):
        """A path along the orbit whose width and opacity change from tail (t0) to head (t1)."""
        m = Image.new("L", (N, N), 0)
        d = ImageDraw.Draw(m)
        n = int(abs(t1 - t0) * 12)
        for i in range(n + 1):
            f = i / n
            (x, y), w = pt(t0 + (t1 - t0) * f), (w0 + (w1 - w0) * f) * N * z / 2
            d.ellipse([x - w, y - w, x + w, y + w], fill=int(255 * (a0 + (a1 - a0) * f)))
        if glow:
            img.paste(Image.new("RGB", (N, N), color), (0, 0), m.filter(ImageFilter.GaussianBlur(glow * N)).point(lambda v: v * .35))
        img.paste(Image.new("RGB", (N, N), color), (0, 0), m)

    # behind the moon: the far half of the orbit, and the ghost with its short trail
    stroke(LINE, 180, 360, .011, .011)
    stroke(CYAN, 250, 206, .010, .020, 0.0, .95)
    gx, gy = pt(206)
    ImageDraw.Draw(img).ellipse([gx - .027 * N * z, gy - .027 * N * z, gx + .027 * N * z, gy + .027 * N * z], fill=CYAN)

    # the moon, lit from the upper left
    disc = Image.new("L", (N, N), 0)
    ImageDraw.Draw(disc).ellipse([cx - rm, cy - rm, cx + rm, cy + rm], fill=255)
    face = Image.new("RGB", (N, N), MOON)
    fd = ImageDraw.Draw(face)
    for dx, dy, r in ((-.40, -.30, .17), (.06, -.55, .10), (-.56, .20, .11), (-.06, .04, .21), (-.28, .56, .09)):
        fd.ellipse([cx + (dx - r) * rm, cy + (dy - r) * rm, cx + (dx + r) * rm, cy + (dy + r) * rm], fill=CRATER)
    lit = Image.new("L", (N, N), 0)
    ImageDraw.Draw(lit).ellipse([cx - .44 * rm - 1.27 * rm, cy - .38 * rm - 1.27 * rm, cx - .44 * rm + 1.27 * rm, cy - .38 * rm + 1.27 * rm], fill=255)
    shade = lit.filter(ImageFilter.GaussianBlur(.012 * N)).point(lambda v: int((255 - v) * .78))
    face.paste(Image.new("RGB", (N, N), SHADOW), (0, 0), shade)
    img.paste(face, (0, 0), disc)

    # in front of the moon: the near half of the orbit, the pilot's trail and the pilot
    stroke(LINE, 0, 180, .011, .011)
    stroke(AMBER, 170, -14, .012, .030, 0.0, 1.0, glow=.02)
    (hx, hy), (bx, by) = pt(-14), pt(-12)
    tx, ty = hx - bx, hy - by
    L = math.hypot(tx, ty)
    tx, ty, nx, ny = tx / L, ty / L, -ty / L, tx / L
    Lr, Wr = .115 * N * z, .088 * N * z
    P = lambda f, s: (hx + tx * f * Lr + nx * s * Wr, hy + ty * f * Lr + ny * s * Wr)
    ImageDraw.Draw(img).polygon([P(.72, 0), P(-.30, .5), P(-.08, 0), P(-.30, -.5)], fill=HOT)
    return img.resize((S, S), Image.LANCZOS)


def tracked(d, x, y, text, f, fill, track):
    for ch in text:
        d.text((x, y), ch, font=f, fill=fill)
        x += f.getlength(ch) + track
    return x - track


def lockup(h=400):
    """Icon + wordmark on a transparent background, for dark surfaces."""
    light, medium, mono = font("Jura-Light", int(h * .40)), font("Jura-Medium", int(h * .40)), font("DMMono-Regular", int(h * .075))
    img = Image.new("RGBA", (h * 6, h), (0, 0, 0, 0))
    img.alpha_composite(mark(h), (0, 0))
    d = ImageDraw.Draw(img)
    x0, track = int(h * 1.22), h * .055
    asc = light.getbbox("M")
    y = int(h * .44 - (asc[1] + asc[3]) / 2)                      # optical centre of the capitals
    x = tracked(d, x0, y, "MOON", light, TEXT, track)
    x = tracked(d, x + h * .16, y, "PILOT", medium, AMBER, track)
    tracked(d, x0 + h * .012, int(h * .74), "REAL PHYSICS  /  BEAT THE AI", mono, DIM, h * .022)
    return img.crop((0, 0, int(x + h * .06), h))


def sheet():
    W, H, M = 2400, 1500, 140
    img = Image.new("RGBA", (W, H), INK + (255,))
    d = ImageDraw.Draw(img)
    for gx in range(M, W - M + 1, 53):
        for gy in range(M, H - M + 1, 53):
            d.point((gx, gy), fill=(22, 30, 46))
    mono, small = font("DMMono-Regular", 22), font("DMMono-Regular", 18)
    label = lambda x, y, s, f=mono, c=DIM: tracked(d, x, y, s, f, c, 3)
    right = lambda y, s, f: label(W - M - sum(f.getlength(c) + 3 for c in s) + 3, y, s, f)
    label(M, 96, "MOON PILOT")
    right(96, "IDENTITY  /  FIG. 01-04", mono)
    d.line([M, 150, W - M, 150], fill=LINE, width=1)
    # 01 icon
    img.alpha_composite(mark(720), (M, 300))
    label(M, 1064, "01  APP ICON")
    # 02 lockup
    R = 1010
    label(R, 300, "02  LOCKUP")
    lk = lockup(400)
    lk = lk.resize((1220, int(lk.height * 1220 / lk.width)), Image.LANCZOS)
    img.alpha_composite(lk, (R, 366))
    # 03 scale
    label(R, 742, "03  SCALE")
    x = R
    for s in (192, 96, 48, 32, 16):
        img.alpha_composite(mark(s, zoom=1.0 if s > 48 else 1.2), (x, 1000 - s))
        label(x, 1022, str(s), small)
        x += s + 70
    # 04 palette
    label(R, 1124, "04  PALETTE")
    x = R + 36
    for color, name in ((DEEP, "0D1524"), (MOON, "D8DDE5"), (AMBER, "FFB454"), (CYAN, "59C2FF"), (DIM, "8FA0B8")):
        d.ellipse([x - 36, 1178, x + 36, 1250], fill=color, outline=LINE, width=2)
        label(x - 36, 1270, name, small)
        x += 150
    d.line([M, 1372, W - M, 1372], fill=LINE, width=1)
    label(M, 1394, "ORBIT 40 KM  /  ONE REVOLUTION, THEN HOME", small)
    right(1394, "BALLISTIC CALM", small)
    return img


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    big = mark(1024)
    big.save(OUT / "icon-1024.png")
    for size, path in ((512, WWW / "icon-512.png"), (192, WWW / "icon-192.png")):
        big.resize((size, size), Image.LANCZOS).save(path)
    mark(64, zoom=1.2).save(WWW / "favicon.png")
    lockup().save(OUT / "lockup.png")
    sheet().convert("RGB").save(OUT / "logo-sheet.png")
    print("wrote brand/icon-1024.png, brand/lockup.png, brand/logo-sheet.png, www/icon-512.png, www/icon-192.png, www/favicon.png")
