"""Restore the Excel company logo as-is and derive app icons from its mark."""
from io import BytesIO
from pathlib import Path
import base64

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
EXCEL = ROOT / "data" / "pa2600001.files"
if not (EXCEL / "image002.png").exists():
    EXCEL = ROOT / "data" / "pa2600002.files"
LOGO_SRC = EXCEL / "image002.png"
SEAL_SRC = EXCEL / "image005.png"


def knockout_black(im, thresh=36):
    rgba = im.convert("RGBA")
    px = rgba.load()
    w, h = rgba.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if not a:
                continue
            if r <= thresh and g <= thresh and b <= thresh:
                px[x, y] = (0, 0, 0, 0)
                continue
            # Excel letterhead leftover: pale gray-blue rules/edges
            if min(r, g, b) >= 180 and max(r, g, b) - min(r, g, b) <= 45:
                px[x, y] = (0, 0, 0, 0)
    return rgba


def wipe_letterhead_rule(im):
    rgb = im.convert("RGB")
    px = rgb.load()
    w, h = rgb.size
    red_right = 0
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            if r > 150 and r > g + 40 and r > b + 40:
                red_right = max(red_right, x)
    for y in range(h):
        for x in range(red_right + 2, w):
            r, g, b = px[x, y]
            if min(r, g, b) >= 140:
                px[x, y] = (255, 255, 255)
            elif max(r, g, b) - min(r, g, b) <= 40 and min(r, g, b) >= 90:
                px[x, y] = (255, 255, 255)
    return rgb


def on_white(im):
    canvas = Image.new("RGB", im.size, (255, 255, 255))
    if im.mode == "RGBA":
        canvas.paste(im, mask=im.split()[-1])
    else:
        canvas.paste(im)
    return canvas


def crop_content(im, pad=6):
    ink = im.convert("L").point(lambda p: 255 if p < 248 else 0)
    box = ink.getbbox()
    if not box:
        return im
    l, t, r, b = box
    return im.crop((
        max(0, l - pad),
        max(0, t - pad),
        min(im.width, r + pad),
        min(im.height, b + pad),
    ))


def red_mark(im):
    px = im.load()
    w, h = im.size
    xs, ys = [], []
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y][:3]
            a = px[x, y][3] if len(px[x, y]) > 3 else 255
            if a > 20 and r > 150 and r > g + 40 and r > b + 40:
                xs.append(x)
                ys.append(y)
    if not xs:
        return im
    pad = 2
    return im.crop((
        max(0, min(xs) - pad),
        max(0, min(ys) - pad),
        min(w, max(xs) + 1 + pad),
        min(h, max(ys) + 1 + pad),
    ))


def square_icon(mark, size, pad=0.12):
    canvas = Image.new("RGB", (size, size), (255, 255, 255))
    mw, mh = mark.size
    inner = int(size * (1 - pad * 2))
    scale = min(inner / mw, inner / mh)
    nw, nh = max(1, int(mw * scale)), max(1, int(mh * scale))
    fitted = mark.resize((nw, nh), Image.Resampling.LANCZOS)
    rgb = Image.new("RGB", fitted.size, (255, 255, 255))
    rgb.paste(fitted, mask=fitted.split()[-1] if fitted.mode == "RGBA" else None)
    canvas.paste(rgb, ((size - nw) // 2, (size - nh) // 2))
    return canvas


def png_bytes(im):
    buf = BytesIO()
    im.save(buf, format="PNG")
    return buf.getvalue()


def restore_logo():
    src = Image.open(LOGO_SRC)
    clean = knockout_black(src)
    logo = wipe_letterhead_rule(on_white(clean))
    logo = crop_content(logo, pad=4)
    logo = logo.resize((logo.width * 2, logo.height * 2), Image.Resampling.LANCZOS)
    return logo


def main():
    if not LOGO_SRC.exists():
        raise SystemExit(f"missing Excel logo: {LOGO_SRC}")
    ASSETS.mkdir(exist_ok=True)
    logo = restore_logo()
    logo.save(ASSETS / "dom-logo.png")
    logo.save(ASSETS / "dom-letterhead.png")
    if SEAL_SRC.exists():
        Image.open(SEAL_SRC).save(ASSETS / "dom-seal.png")
    mark = red_mark(logo.convert("RGBA"))
    square_icon(mark, 512).save(ASSETS / "icon-512.png")
    square_icon(mark, 192).save(ASSETS / "icon-192.png")
    square_icon(mark, 180).save(ASSETS / "apple-touch-icon.png")
    square_icon(mark, 32).save(ASSETS / "favicon-32.png")
    square_icon(mark, 512, pad=0.22).save(ASSETS / "icon-maskable-512.png")
    fav = square_icon(mark, 32)
    ASSETS.joinpath("favicon.svg").write_text(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">'
        f'<image href="data:image/png;base64,{base64.b64encode(png_bytes(fav)).decode()}" '
        'width="32" height="32"/></svg>\n',
        encoding="utf-8",
    )
    print("source", LOGO_SRC)
    print("logo", logo.size)


if __name__ == "__main__":
    main()
