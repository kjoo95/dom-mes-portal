"""Rebuild the company logo as a clean high-res lockup and derive app icons."""
from io import BytesIO
from pathlib import Path
import base64

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
EXCEL = ROOT / "data" / "pa2600001.files"
if not (EXCEL / "image005.png").exists():
    EXCEL = ROOT / "data" / "pa2600002.files"
SEAL_SRC = EXCEL / "image005.png"

RED = (216, 52, 76)
NAVY = (0, 0, 128)
WHITE = (255, 255, 255)
SCALE = 8
FONT_REG = Path(r"C:\Windows\Fonts\malgun.ttf")
FONT_BOLD = Path(r"C:\Windows\Fonts\malgunbd.ttf")


def xy(x, y):
    return int(round(x * SCALE)), int(round(y * SCALE))


def box(x0, y0, x1, y1):
    ax, ay = xy(x0, y0)
    bx, by = xy(x1, y1)
    return (min(ax, bx), min(ay, by), max(ax, bx), max(ay, by))


def disc(draw, cx, cy, r, fill):
    draw.ellipse(box(cx - r, cy - r, cx + r, cy + r), fill=fill)


def pill_v(draw, x, y0, y1, thickness, fill):
    r = thickness / 2
    draw.rounded_rectangle(box(x - r, y0, x + r, y1), radius=max(1, int(round(r * SCALE))), fill=fill)


def pill_h(draw, x0, x1, y, thickness, fill):
    r = thickness / 2
    draw.rounded_rectangle(box(x0, y - r, x1, y + r), radius=max(1, int(round(r * SCALE))), fill=fill)


def ring(draw, cx, cy, outer, inner, fill, hole):
    disc(draw, cx, cy, outer, fill)
    disc(draw, cx, cy, inner, hole)


def n_arch(draw, x_left, cy, outer, inner, base, fill, hole, sw):
    """Top-half ring plus two legs: a rounded n."""
    disc(draw, x_left + outer, cy, outer, fill)
    disc(draw, x_left + outer, cy, inner, hole)
    draw.rectangle(box(x_left - 0.4, cy + 0.2, x_left + outer * 2 + 0.4, cy + outer + 0.4), fill=hole)
    pill_v(draw, x_left, cy - sw * 0.6, base, sw, fill)
    pill_v(draw, x_left + outer * 2, cy - sw * 0.6, base, sw, fill)


def draw_dom_mark(draw, ox, oy):
    """Connected rounded lowercase 'dom' inside the red plate. Units are 360x60 logo space."""
    sw = 6.0
    outer = 9.35
    inner = outer - sw
    cy = oy + 19.2
    top = oy + 5.4
    base = oy + 31.4
    d_cx = ox + 21.6
    o_cx = ox + 46.0
    stem_x = d_cx + outer - sw / 2
    disc(draw, d_cx, cy, outer, WHITE)
    pill_v(draw, stem_x, top, base, sw, WHITE)
    disc(draw, o_cx, cy, outer, WHITE)
    pill_h(draw, d_cx + inner * 0.15, o_cx - inner * 0.15, cy, sw, WHITE)
    m0 = ox + 68.2
    n_arch(draw, m0, cy, outer, inner, base, WHITE, RED, sw)
    n_arch(draw, m0 + outer * 2, cy, outer, inner, base, WHITE, RED, sw)
    pill_h(draw, o_cx + inner * 0.15, m0 + sw / 2, cy, sw, WHITE)
    disc(draw, d_cx, cy, inner, RED)
    disc(draw, o_cx, cy, inner, RED)


def load_font(path, size):
    return ImageFont.truetype(str(path), max(8, int(round(size * SCALE))))


def make_svg(rx, ry, rw, rh, left, width, height, co_x, co_y, name_x, name_y, co_size, name_size):
    ox, oy = rx, ry
    sw = 6.0
    outer = 9.35
    inner = outer - sw
    cy = oy + 19.2
    top = oy + 5.4
    base = oy + 31.4
    d_cx = ox + 21.6
    o_cx = ox + 46.0
    stem_x = d_cx + outer - sw / 2
    m0 = ox + 68.2
    red = "#d8344c"
    navy = "#000080"
    fonts = "Malgun Gothic, Apple SD Gothic Neo, Noto Sans KR, sans-serif"

    def pill(x, y0, y1):
        return (
            f'<rect x="{x - sw / 2:.2f}" y="{y0:.2f}" width="{sw:.2f}" height="{y1 - y0:.2f}" '
            f'rx="{sw / 2:.2f}" fill="#fff"/>'
        )

    def hpill(x0, x1, y):
        return (
            f'<rect x="{x0:.2f}" y="{y - sw / 2:.2f}" width="{x1 - x0:.2f}" height="{sw:.2f}" '
            f'rx="{sw / 2:.2f}" fill="#fff"/>'
        )

    def arch(x_left):
        cx = x_left + outer
        return (
            f'<path fill="#fff" d="M {x_left:.2f},{cy:.2f} '
            f'A {outer:.2f} {outer:.2f} 0 0 0 {x_left + outer * 2:.2f},{cy:.2f} '
            f'L {cx + inner:.2f},{cy:.2f} '
            f'A {inner:.2f} {inner:.2f} 0 0 0 {cx - inner:.2f},{cy:.2f} Z"/>'
            f'{pill(x_left, cy - sw * 0.6, base)}'
            f'{pill(x_left + outer * 2, cy - sw * 0.6, base)}'
        )

    body = (
        f'<rect x="{rx:.2f}" y="{ry:.2f}" width="{rw:.2f}" height="{rh:.2f}" fill="{red}"/>'
        f'<circle cx="{d_cx:.2f}" cy="{cy:.2f}" r="{outer:.2f}" fill="#fff"/>'
        f'{pill(stem_x, top, base)}'
        f'<circle cx="{o_cx:.2f}" cy="{cy:.2f}" r="{outer:.2f}" fill="#fff"/>'
        f'{hpill(d_cx + inner * 0.15, o_cx - inner * 0.15, cy)}'
        f'{arch(m0)}{arch(m0 + outer * 2)}'
        f'{hpill(o_cx + inner * 0.15, m0 + sw / 2, cy)}'
        f'<circle cx="{d_cx:.2f}" cy="{cy:.2f}" r="{inner:.2f}" fill="{red}"/>'
        f'<circle cx="{o_cx:.2f}" cy="{cy:.2f}" r="{inner:.2f}" fill="{red}"/>'
        f'<text x="{co_x:.2f}" y="{co_y:.2f}" fill="{navy}" font-family="{fonts}" '
        f'font-size="{co_size:.2f}" dominant-baseline="middle">주식회사</text>'
        f'<text x="{name_x:.2f}" y="{name_y:.2f}" fill="{navy}" font-family="{fonts}" '
        f'font-size="{name_size:.2f}" font-weight="700" dominant-baseline="middle">디오엠</text>'
    )
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{left:.2f} 0 {width:.2f} {height:.2f}" '
        f'width="{width:.0f}" height="{height:.0f}" role="img" aria-label="주식회사 디오엠">{body}</svg>\n'
    )


def draw_lockup():
    w, h = 360 * SCALE, 60 * SCALE
    im = Image.new("RGB", (w, h), WHITE)
    draw = ImageDraw.Draw(im)

    rx, ry, rw, rh = 8, 12, 128, 36
    draw.rectangle((xy(rx, ry), xy(rx + rw, ry + rh)), fill=RED)
    draw_dom_mark(draw, rx, ry)

    font_co = load_font(FONT_REG, 11.5)
    font_name = load_font(FONT_BOLD, 21.0)
    text_x = (rx + rw + 10) * SCALE
    mid_y = (ry + rh / 2) * SCALE
    co = "주식회사"
    name = "디오엠"
    co_box = font_co.getbbox(co)
    name_box = font_name.getbbox(name)
    co_h = co_box[3] - co_box[1]
    name_h = name_box[3] - name_box[1]
    name_y = mid_y - name_h / 2 - name_box[1]
    co_y = mid_y - co_h / 2 - co_box[1]
    draw.text((text_x, co_y), co, font=font_co, fill=NAVY)
    gap = int(8 * SCALE)
    name_x = text_x + (co_box[2] - co_box[0]) + gap
    draw.text((name_x, name_y), name, font=font_name, fill=NAVY)

    right = name_x + (name_box[2] - name_box[0])
    pad = 6 * SCALE
    left = max(0, int(rx * SCALE - pad))
    cropped = im.crop((left, 0, int(right + pad), h))
    svg = make_svg(
        rx=rx,
        ry=ry,
        rw=rw,
        rh=rh,
        left=left / SCALE,
        width=(right + pad - left) / SCALE,
        height=60,
        co_x=text_x / SCALE,
        co_y=(co_y + co_box[1] + co_h / 2) / SCALE,
        name_x=name_x / SCALE,
        name_y=(name_y + name_box[1] + name_h / 2) / SCALE,
        co_size=11.5,
        name_size=21.0,
    )
    return cropped.convert("RGBA"), cropped.convert("RGBA"), svg


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
    canvas = Image.new("RGB", (size, size), WHITE)
    mw, mh = mark.size
    inner = int(size * (1 - pad * 2))
    scale = min(inner / mw, inner / mh)
    nw, nh = max(1, int(mw * scale)), max(1, int(mh * scale))
    fitted = mark.resize((nw, nh), Image.Resampling.LANCZOS)
    rgb = Image.new("RGB", fitted.size, WHITE)
    rgb.paste(fitted, mask=fitted.split()[-1] if fitted.mode == "RGBA" else None)
    canvas.paste(rgb, ((size - nw) // 2, (size - nh) // 2))
    return canvas


def png_bytes(im):
    buf = BytesIO()
    im.save(buf, format="PNG")
    return buf.getvalue()


def main():
    ASSETS.mkdir(exist_ok=True)
    logo, hi, svg = draw_lockup()
    logo.save(ASSETS / "dom-logo.png")
    hi.save(ASSETS / "dom-letterhead.png")
    ASSETS.joinpath("dom-logo.svg").write_text(svg, encoding="utf-8")
    if SEAL_SRC.exists():
        Image.open(SEAL_SRC).save(ASSETS / "dom-seal.png")
    mark = red_mark(logo)
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
    print("logo", logo.size)


if __name__ == "__main__":
    main()
