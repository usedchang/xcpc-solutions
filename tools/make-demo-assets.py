"""Generate the two demo diagrams and embed them as a JS asset module."""
from __future__ import annotations

import base64
import io
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "assets"
OUT_JS = ROOT / "js" / "demo-assets.js"

NAVY = "#122b43"
BLUE = "#1f5f8f"
BLUE_MID = "#3f7fae"
BLUE_LIGHT = "#dceaf4"
GREEN = "#2e8b57"
GREEN_LIGHT = "#dff0e6"
RED = "#d34a3c"
AMBER = "#c99124"
MUTED = "#6c7d8b"
WHITE = "#ffffff"

FONT_REGULAR = "C:/Windows/Fonts/msyh.ttc"
FONT_BOLD = "C:/Windows/Fonts/msyhbd.ttc"
FONT_MONO = "C:/Windows/Fonts/consola.ttf"


def font(size: int, bold: bool = False, mono: bool = False) -> ImageFont.FreeTypeFont:
    path = FONT_MONO if mono else (FONT_BOLD if bold else FONT_REGULAR)
    return ImageFont.truetype(path, size)


def rounded(draw: ImageDraw.ImageDraw, box, radius, fill=None, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def arrow(draw: ImageDraw.ImageDraw, start, end, fill, width=3, head=10):
    draw.line([start, end], fill=fill, width=width)
    x1, y1 = start
    x2, y2 = end
    angle = math.atan2(y2 - y1, x2 - x1)
    for delta in (math.pi * 5 / 6, -math.pi * 5 / 6):
        x = x2 + head * math.cos(angle + delta)
        y = y2 + head * math.sin(angle + delta)
        draw.line([(x2, y2), (x, y)], fill=fill, width=width)


def interval_diagram() -> Image.Image:
    width, height = 1200, 820
    image = Image.new("RGB", (width, height), WHITE)
    draw = ImageDraw.Draw(image)

    draw.text((55, 36), "扫描与合并", font=font(48, True), fill=NAVY)
    draw.text((55, 100), "排序后，只需维护最后一个合并区间。", font=font(31), fill=MUTED)

    left, right = 90, 1130
    scale = (right - left) / 12.5
    axis_y = 420

    def x(value: float) -> float:
        return left + (value + 0.4) * scale

    draw.text((55, 158), "输入区间", font=font(31, True), fill=BLUE)
    inputs = [(1, 3), (2, 6), (8, 10), (9, 11)]
    colors = [BLUE, BLUE_MID, BLUE, BLUE_MID]
    for index, ((a, b), color) in enumerate(zip(inputs, colors)):
        y = 200 + index * 40
        rounded(draw, (x(a), y, x(b), y + 24), 10, fill=color)
        draw.text((x(b) + 12, y + 1), f"[{a},{b}]", font=font(28, mono=True), fill=MUTED)

    draw.line([(left, axis_y), (right, axis_y)], fill="#7c8b97", width=3)
    for value in range(0, 13):
        px = x(value)
        draw.line([(px, axis_y - 8), (px, axis_y + 8)], fill="#9aabb6", width=2)
        draw.text((px - 10, axis_y + 16), str(value), font=font(28, mono=True), fill=MUTED)
    draw.text((right + 8, axis_y - 26), "x", font=font(26, True), fill=MUTED)

    merged = [(1, 6), (8, 11)]
    draw.text((55, 466), "合并结果", font=font(31, True), fill=GREEN)
    for index, (a, b) in enumerate(merged):
        y = 505 + index * 48
        rounded(draw, (x(a), y, x(b), y + 30), 14, fill=GREEN_LIGHT, outline=GREEN, width=3)
        label = f"[{a},{b}]"
        box = draw.textbbox((0, 0), label, font=font(29, True, mono=True))
        center = (x(a) + x(b)) / 2
        draw.text((center - (box[2] - box[0]) / 2, y + 3), label, font=font(29, True, mono=True), fill=GREEN)

    # Arrows from inputs to merged rows.
    for index, (a, b) in enumerate(inputs):
        target = merged[0] if b <= 6 else merged[1]
        target_index = 0 if b <= 6 else 1
        start = ((x(a) + x(b)) / 2, 224 + index * 40)
        end = ((x(target[0]) + x(target[1])) / 2, 505 + target_index * 48 - 10)
        draw.line([start, (start[0], start[1] + 12), (end[0], end[1] - 12), end], fill="#b5c5cf", width=2)

    gap_x = x(7)
    draw.line([(gap_x, 380), (gap_x, 615)], fill="#e4b3ac", width=2)
    draw.text((gap_x - 29, 620), "空隙", font=font(30, True), fill=RED)

    rounded(draw, (760, 646, 1130, 788), 16, fill="#f3f7fa", outline="#d8e3eb", width=2)
    draw.text((790, 668), "若 l ≤ R：合并", font=font(31, True), fill=NAVY)
    draw.text((790, 715), "否则：输出并开新段", font=font(29), fill=MUTED)
    return image


def weighted_median_diagram() -> Image.Image:
    width, height = 1200, 820
    image = Image.new("RGB", (width, height), WHITE)
    draw = ImageDraw.Draw(image)

    draw.text((55, 36), "加权中位数让左右权重都不超过一半", font=font(43, True), fill=NAVY)
    draw.text((55, 100), "总权重 W=8；位置 5 的两侧权重都不超过 4。", font=font(27), fill=MUTED)

    # Left: weighted points.
    base_y = 550
    axis_left, axis_right = 85, 600
    positions = [(2, 2), (5, 4), (9, 2)]
    step = 54

    draw.line([(axis_left, base_y), (axis_right, base_y)], fill="#7c8b97", width=3)
    for value, weight in positions:
        px = axis_left + value * step
        top = base_y - weight * 55
        rounded(draw, (px - 23, top, px + 23, base_y), 9, fill=BLUE_LIGHT, outline=BLUE, width=2)
        draw.text((px - 14, top + 14), str(weight), font=font(27, True, mono=True), fill=BLUE)
        draw.text((px - 7, base_y + 12), str(value), font=font(28, mono=True), fill=MUTED)
        draw.text((px - (64 if value == 5 else 30), top - 34), f"w={weight}", font=font(28, True), fill=NAVY)

    median_x = axis_left + 5 * step
    draw.line([(median_x, 220), (median_x, base_y)], fill=RED, width=3)
    rounded(draw, (median_x - 82, 176, median_x + 82, 214), 10, fill="#fbe9e6")
    draw.text((median_x - 68, 181), "中位数 x=5", font=font(26, True), fill=RED)

    for value, _ in positions:
        px = axis_left + value * step
        y = base_y + 55
        draw.line([(px, y), (median_x, y)], fill="#d9a39c", width=2)
        label_x = (px + median_x) / 2 - 17 - (22 if value == 5 else 0)
        draw.text((label_x, y - 29), f"|{value}-5|", font=font(19, mono=True), fill=RED)

    draw.text((70, 663), "左边权重 6，右边权重 2", font=font(28, True), fill=MUTED)
    draw.text((70, 704), "每侧都不超过 W/2=4，因此 x=5 最优。", font=font(26), fill=MUTED)

    # Right: cost curve.
    chart_left, chart_right = 690, 1130
    chart_top, chart_bottom = 225, 600
    draw.line([(chart_left, chart_bottom), (chart_right, chart_bottom)], fill="#7c8b97", width=3)
    draw.line([(chart_left, chart_top), (chart_left, chart_bottom)], fill="#7c8b97", width=3)
    draw.text((chart_left - 34, chart_top - 44), "F(x)", font=font(26, True), fill=NAVY)
    draw.text((chart_right - 20, chart_bottom + 14), "x", font=font(26, True), fill=NAVY)

    samples = []
    for i in range(0, 121):
        value = 0.5 + i * (11 - 0.5) / 120
        cost = 2 * abs(value - 2) + 4 * abs(value - 5) + 2 * abs(value - 9)
        samples.append((value, cost))
    max_cost = max(cost for _, cost in samples)
    points = []
    for value, cost in samples:
        px = chart_left + (value - 0.5) / 10.5 * (chart_right - chart_left - 30)
        py = chart_bottom - cost / max_cost * (chart_bottom - chart_top - 20)
        points.append((px, py))
    draw.line(points, fill=GREEN, width=4, joint="curve")

    mx = chart_left + (5 - 0.5) / 10.5 * (chart_right - chart_left - 30)
    my = chart_bottom - 28 / max_cost * (chart_bottom - chart_top - 20)
    draw.line([(mx, my), (mx, chart_bottom)], fill=RED, width=2)
    draw.ellipse((mx - 7, my - 7, mx + 7, my + 7), fill=WHITE, outline=RED, width=3)
    draw.text((mx + 14, my - 38), "最小值", font=font(23, True), fill=RED)

    draw.text((chart_left, 665), "F(x) 是凸的分段线性函数，", font=font(26), fill=MUTED)
    draw.text((chart_left, 703), "最小值出现在加权中位数处。", font=font(26), fill=MUTED)
    return image


def to_data_url(image: Image.Image) -> str:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return "data:image/png;base64," + encoded


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    interval = interval_diagram()
    median = weighted_median_diagram()
    interval.save(OUT_DIR / "demo-interval.png")
    median.save(OUT_DIR / "demo-median.png")

    payload = {
        "interval": to_data_url(interval),
        "median": to_data_url(median),
    }
    OUT_JS.parent.mkdir(parents=True, exist_ok=True)
    OUT_JS.write_text(
        "/* Generated by tools/make-demo-assets.py. */\n"
        "(function(){window.TX=window.TX||{};window.TX.demoAssets="
        + json.dumps(payload, ensure_ascii=False)
        + ";}());\n",
        encoding="utf-8",
    )
    print(f"wrote {OUT_DIR / 'demo-interval.png'}")
    print(f"wrote {OUT_DIR / 'demo-median.png'}")
    print(f"wrote {OUT_JS}")


if __name__ == "__main__":
    main()


