"""Copy the Excel company logo as-is and build app icons from its mark."""
from pathlib import Path
import shutil

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
EXCEL = ROOT / "data" / "pa2600002.files"
LOGO = EXCEL / "image001.png"
SEAL = EXCEL / "image005.png"


def trim_mark(im):
    rgb = im.convert("RGB")
    w, h = rgb.size
    px = rgb.load()
    last = 0
    gap = 0
    for x in range(w):
        ink = any(sum(px[x, y]) < 720 for y in range(h))
        if ink:
            last = x
            gap = 0
        else:
            gap += 1
            if last > 20 and gap >= 12:
                break
    box = (0, 0, min(w, last + 4), h)
    return im.crop(box)


def square_icon(mark, size, pad=0.14):
    canvas = Image.new("RGB", (size, size), (255, 255, 255))
    mw, mh = mark.size
    inner = int(size * (1 - pad * 2))
    scale = min(inner / mw, inner / mh)
    nw, nh = max(1, int(mw * scale)), max(1, int(mh * scale))
    fitted = mark.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas.paste(fitted, ((size - nw) // 2, (size - nh) // 2))
    return canvas


def main():
    if not LOGO.exists():
        raise SystemExit(f"missing Excel logo: {LOGO}")
    ASSETS.mkdir(exist_ok=True)
    shutil.copyfile(LOGO, ASSETS / "dom-logo.png")
    shutil.copyfile(LOGO, ASSETS / "dom-letterhead.png")
    if SEAL.exists():
        shutil.copyfile(SEAL, ASSETS / "dom-seal.png")
    mark = trim_mark(Image.open(LOGO))
    square_icon(mark, 512).save(ASSETS / "icon-512.png")
    square_icon(mark, 192).save(ASSETS / "icon-192.png")
    square_icon(mark, 180).save(ASSETS / "apple-touch-icon.png")
    square_icon(mark, 32).save(ASSETS / "favicon-32.png")
    square_icon(mark, 512, pad=0.22).save(ASSETS / "icon-maskable-512.png")
    fav = square_icon(mark, 32)
    ASSETS.joinpath("favicon.svg").write_text(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">'
        f'<image href="data:image/png;base64,{__import__("base64").b64encode(_png_bytes(fav)).decode()}" '
        'width="32" height="32"/></svg>\n',
        encoding="utf-8",
    )
    print("wrote", ASSETS)
    print("logo", Image.open(ASSETS / "dom-logo.png").size)


def _png_bytes(im):
    from io import BytesIO
    buf = BytesIO()
    im.save(buf, format="PNG")
    return buf.getvalue()


if __name__ == "__main__":
    main()
