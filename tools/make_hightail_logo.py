"""Generate the hightail wordmark, app icon, favicon and one-color variants.

The wordmark is "hightail" set in Bricolage Grotesque 800 (outlined, so the
SVGs need no font), with the first "i" replaced by a sprinting figure drawn
with the same stroke weight as the letter stems.

Usage:
    python3 tools/make_hightail_logo.py path/to/BricolageGrotesque[opsz,wdth,wght].ttf

The variable font's default instance (opsz 96, wght 800, wdth 100) is used.
Font: https://github.com/google/fonts/tree/main/ofl/bricolagegrotesque (OFL).
Needs: fonttools, uharfbuzz, cairosvg.
"""

import math
import os
import sys

import cairosvg
import uharfbuzz as hb
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

OUT = os.path.join(os.path.dirname(__file__), "..", "branding", "hightail")
RED = "#E5102A"
WHITE = "#FFFFFF"

TEXT = "hightail"
TRACKING = -0.055  # em
STEM = 162         # stem width of "l"/"h" in Bricolage Grotesque 800, font units
ASCENDER = 700     # top of the "h" ascender, font units

# Running figure, font units, y up, baseline at 0. Strokes are STEM thick
# with round caps/joins; the head is a solid circle sitting where an i's dot
# would be (its top level with the h ascender).
HEAD_R = 92
HEAD = (96, ASCENDER - HEAD_R)
NECK = (0, 440)
HIP = (-90, 250)
FRONT_LEG = [HIP, (104, 184), (40, 81)]             # knee driven forward, shin tucked
BACK_LEG = [HIP, (-236, 81), (-420, 176)]           # knee down, foot kicking back
FRONT_ARM = [NECK, (192, 398), (290, 536)]          # forward and up
BACK_ARM = [NECK, (-170, 490), (-318, 354)]         # back


def runner_strokes():
    return [[NECK, HIP], FRONT_LEG, BACK_LEG, FRONT_ARM, BACK_ARM]


def runner_bounds():
    xs, ys = [HEAD[0] - HEAD_R, HEAD[0] + HEAD_R], [HEAD[1] - HEAD_R, HEAD[1] + HEAD_R]
    for line in runner_strokes():
        for x, y in line:
            xs += [x - STEM / 2, x + STEM / 2]
            ys += [y - STEM / 2, y + STEM / 2]
    return min(xs), min(ys), max(xs), max(ys)


def runner_svg(fill, tx=0.0, ty=0.0, scale=1.0, flip=True):
    """Runner as SVG elements. With flip, font coords (y up) map to SVG (y down)."""
    sy = -scale if flip else scale

    def pt(p):
        return f"{tx + p[0] * scale:.1f},{ty + p[1] * sy:.1f}"

    paths = " ".join("M" + " L".join(pt(p) for p in line) for line in runner_strokes())
    return (
        f'<path d="{paths}" fill="none" stroke="{fill}" stroke-width="{STEM * scale:.1f}" '
        f'stroke-linecap="round" stroke-linejoin="round"/>'
        f'<circle cx="{tx + HEAD[0] * scale:.1f}" cy="{ty + HEAD[1] * sy:.1f}" r="{HEAD_R * scale:.1f}" fill="{fill}"/>'
    )


def shape(font_path):
    blob = hb.Blob.from_file_path(font_path)
    font = hb.Font(hb.Face(blob))
    buf = hb.Buffer()
    buf.add_str(TEXT)
    buf.guess_segment_properties()
    hb.shape(font, buf, {"kern": True})
    return [(info.codepoint, pos.x_advance) for info, pos in zip(buf.glyph_infos, buf.glyph_positions)]


def wordmark_svg(font_path, fg, bg=None, pad=90):
    tt = TTFont(font_path)
    glyph_set = tt.getGlyphSet()
    order = tt.getGlyphOrder()
    upm = tt["head"].unitsPerEm
    track = TRACKING * upm

    rx0, _, rx1, _ = runner_bounds()
    runner_side = 26  # side bearing either side of the figure, like the i's

    parts, x = [], 0.0
    first_i_done = False
    for (gid, adv), ch in zip(shape(font_path), TEXT):
        if ch == "i" and not first_i_done:
            first_i_done = True
            ox = x + runner_side - rx0
            parts.append(("runner", ox))
            x += runner_side * 2 + (rx1 - rx0) + track
            continue
        pen = SVGPathPen(glyph_set)
        glyph_set[order[gid]].draw(TransformPen(pen, (1, 0, 0, -1, x, 0)))
        parts.append(("glyph", pen.getCommands()))
        x += adv + track
    width = x - track

    top, bottom = ASCENDER, -158  # ascender / g descender
    vb_w = width + 2 * pad
    vb_h = top - bottom + 2 * pad
    body = []
    if bg:
        body.append(f'<rect width="100%" height="100%" fill="{bg}"/>')
    body.append(f'<g transform="translate({pad},{pad + top})">')
    glyph_d = " ".join(d for kind, d in parts if kind == "glyph")
    body.append(f'<path d="{glyph_d}" fill="{fg}"/>')
    for kind, ox in parts:
        if kind == "runner":
            body.append(runner_svg(fg, tx=ox))
    body.append("</g>")
    return svg(vb_w, vb_h, body, "hightail")


def icon_svg(size=1024, bg=RED, fg=WHITE, rounded=True, speed_lines=True, figure_frac=0.62):
    x0, y0, x1, y1 = runner_bounds()
    fw, fh = x1 - x0, y1 - y0
    lines_w = 0.16 * size if speed_lines else 0
    scale = min(figure_frac * size / fh, (0.84 * size - lines_w) / fw)
    total_w = fw * scale + lines_w
    left = (size - total_w) / 2 + lines_w
    tx = left - x0 * scale
    ty = (size + fh * scale) / 2 + y0 * scale  # vertically centre the figure
    body = []
    if bg:
        r = 0.2237 * size if rounded else 0
        body.append(f'<rect width="{size}" height="{size}" rx="{r:.1f}" fill="{bg}"/>')
    if speed_lines:
        sw = STEM * scale * 0.42
        # three short dashes trailing behind the runner, fading with distance
        for (yf, length, opacity) in [(0.40, 0.70, 0.8), (0.58, 1.00, 0.6), (0.76, 0.55, 0.4)]:
            y = ty - (y0 + yf * fh) * scale
            xe = left - 0.03 * size
            xs = xe - lines_w * length * 0.85
            body.append(
                f'<line x1="{xs:.1f}" y1="{y:.1f}" x2="{xe:.1f}" y2="{y:.1f}" stroke="{fg}" '
                f'stroke-opacity="{opacity}" stroke-width="{sw:.1f}" stroke-linecap="round"/>'
            )
    body.append(runner_svg(fg, tx=tx, ty=ty, scale=scale))
    return svg(size, size, body, "hightail icon")


def favicon_svg(size=64, fg=RED):
    """Runner only, filling the square, no background."""
    x0, y0, x1, y1 = runner_bounds()
    fw, fh = x1 - x0, y1 - y0
    scale = 0.96 * size / max(fw, fh)
    tx = (size - fw * scale) / 2 - x0 * scale
    ty = (size + fh * scale) / 2 + y0 * scale
    return svg(size, size, [runner_svg(fg, tx=tx, ty=ty, scale=scale)], "hightail")


def svg(w, h, body, title):
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.0f} {h:.0f}" '
        f'width="{w:.0f}" height="{h:.0f}" role="img" aria-label="{title}">'
        f"<title>{title}</title>" + "".join(body) + "</svg>\n"
    )


def write(name, data):
    path = os.path.join(OUT, name)
    with open(path, "w") as f:
        f.write(data)
    return path


def png(svg_path, name, width, height=None):
    cairosvg.svg2png(url=svg_path, write_to=os.path.join(OUT, name),
                     output_width=width, output_height=height or width)


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    font = sys.argv[1]
    os.makedirs(OUT, exist_ok=True)

    write("wordmark-white-on-red.svg", wordmark_svg(font, WHITE, RED))
    write("wordmark-red-on-white.svg", wordmark_svg(font, RED, WHITE))
    write("wordmark-white.svg", wordmark_svg(font, WHITE))  # one-color, transparent
    write("wordmark-red.svg", wordmark_svg(font, RED))      # one-color, transparent

    icon = write("icon.svg", icon_svg())
    for px in (180, 192, 512, 1024):
        png(icon, f"icon-{px}.png", px)
    write("icon-white.svg", icon_svg(bg=None, fg=WHITE))  # one-color mark
    write("icon-red.svg", icon_svg(bg=None, fg=RED))

    fav = write("favicon.svg", favicon_svg())
    for px in (16, 32, 48):
        png(fav, f"favicon-{px}.png", px)
    from PIL import Image
    Image.open(os.path.join(OUT, "favicon-48.png")).save(
        os.path.join(OUT, "favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48)])

    for name in ("wordmark-white-on-red", "wordmark-red-on-white"):
        cairosvg.svg2png(url=os.path.join(OUT, name + ".svg"),
                         write_to=os.path.join(OUT, name + ".png"), output_height=480)


if __name__ == "__main__":
    main()
