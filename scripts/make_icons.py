"""Build DOM app icons from the company wordmark."""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

RED = (196, 30, 58, 255)
WHITE = (255, 255, 255, 255)
ROOT = Path(__file__).resolve().parents[1] / "assets"
FONTS = Path(r"C:\Windows\Fonts")


def load_font(names, size):
    for name in names:
        path = FONTS / name
        if path.exists():
            return ImageFont.truetype(str(path), size)
    return ImageFont.load_default()


def centered(draw, text, font, cy, canvas):
    x0, y0, x1, y1 = draw.textbbox((0, 0), text, font=font)
    x = (canvas - (x1 - x0)) / 2 - x0
    y = cy - (y1 - y0) / 2 - y0
    draw.text((x, y), text, font=font, fill=WHITE)


def paint(size):
    img = Image.new("RGBA", (size, size), RED)
    draw = ImageDraw.Draw(img)
    dom = load_font(["ariblk.ttf", "arialbd.ttf", "segoeuib.ttf"], int(size * 0.28))
    ko = load_font(["malgunbd.ttf", "malgun.ttf", "arialbd.ttf"], int(size * 0.08))
    centered(draw, "DOM", dom, size * 0.45, size)
    centered(draw, "디오엠", ko, size * 0.68, size)
    return img


def main():
    ROOT.mkdir(exist_ok=True)
    paint(512).save(ROOT / "icon-512.png")
    paint(192).save(ROOT / "icon-192.png")
    paint(180).save(ROOT / "apple-touch-icon.png")
    paint(32).save(ROOT / "favicon-32.png")
    mask = Image.new("RGBA", (512, 512), RED)
    inner = paint(320)
    mask.paste(inner, ((512 - 320) // 2, (512 - 320) // 2), inner)
    mask.save(ROOT / "icon-maskable-512.png")
    print("wrote", ROOT)


if __name__ == "__main__":
    main()
