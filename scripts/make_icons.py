"""Copy the Excel red company logo as-is and build app icons from its mark."""
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
            if a and r <= thresh and g <= thresh and b <= thresh:
                px[x, y] = (0, 0, 0, 0)
    return rgba


def content_box(im, pad=6):
    alpha = im.split()[-1]
    box = alpha.getbbox()
    if not box:
        return im
    l, t, r, b = box
    l = max(0, l - pad)
    t = max(0, t - pad)
    r = min(im.width, r + pad)
    b = min(im.height, b + pad)
    return im.crop((l, t, r, b))


def on_white(im):
    canvas = Image.new("RGB", im.size, (255, 255, 255))
    canvas.paste(im, mask=im.split()[-1])
    return canvas


def red_mark(im):
    px = im.load()
    w, h = im.size
    xs, ys = [], []
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
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


def main():
    if not LOGO_SRC.exists():
        raise SystemExit(f"missing Excel logo: {LOGO_SRC}")
    ASSETS.mkdir(exist_ok=True)
    clean = content_box(knockout_black(Image.open(LOGO_SRC)))
    on_white(clean).save(ASSETS / "dom-logo.png")
    on_white(clean).save(ASSETS / "dom-letterhead.png")
    if SEAL_SRC.exists():
        Image.open(SEAL_SRC).save(ASSETS / "dom-seal.png")
    mark = red_mark(clean)
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
    print("logo", Image.open(ASSETS / "dom-logo.png").size)


if __name__ == "__main__":
    main()
