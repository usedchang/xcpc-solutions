#!/usr/bin/env python3
"""Build the default page mark from the ICPC Foundation artwork.

The source file contains the three icons plus the "ICPC Foundation"
wordmark.  We keep only the icon paths, crop the viewBox to them, and also
emit a TeX/TikZ version so the exported LaTeX uses the same artwork.

Usage:
    python tools/make-logo.py [--source icpc_foundation.svg]
"""
from __future__ import annotations

import argparse
import math
import re
from pathlib import Path
from xml.etree import ElementTree

CMD_RE = re.compile(r'([MCLHVZ])([^MCLHVZ]*)')
NUM_RE = re.compile(r'-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?')
SVG_NS = '{http://www.w3.org/2000/svg}'
COLORS = {
    '#4C82C3': 'txlogoBlue',
    '#FDBA11': 'txlogoYellow',
    '#B22D1B': 'txlogoRed',
}


def parse_path(d: str):
    """Return (bbox, normalized commands) for an absolute M/C/L/H/V/Z path."""
    tokens = []
    x = y = 0.0
    min_x = min_y = math.inf
    max_x = max_y = -math.inf
    for command, body in CMD_RE.findall(d):
        values = [float(value) for value in NUM_RE.findall(body)]
        index = 0
        if command == 'M':
            while index + 1 < len(values):
                x, y = values[index], values[index + 1]
                index += 2
                min_x, max_x = min(min_x, x), max(max_x, x)
                min_y, max_y = min(min_y, y), max(max_y, y)
                tokens.append(('M', x, y))
                # Extra pairs after M are implicit lineto commands.
                while index + 1 < len(values):
                    x, y = values[index], values[index + 1]
                    index += 2
                    tokens.append(('L', x, y))
        elif command == 'L':
            while index + 1 < len(values):
                x, y = values[index], values[index + 1]
                index += 2
                min_x, max_x = min(min_x, x), max(max_x, x)
                min_y, max_y = min(min_y, y), max(max_y, y)
                tokens.append(('L', x, y))
        elif command == 'H':
            for value in values:
                x = value
                min_x, max_x = min(min_x, x), max(max_x, x)
                min_y, max_y = min(min_y, y), max(max_y, y)
                tokens.append(('L', x, y))
        elif command == 'V':
            for value in values:
                y = value
                min_x, max_x = min(min_x, x), max(max_x, x)
                min_y, max_y = min(min_y, y), max(max_y, y)
                tokens.append(('L', x, y))
        elif command == 'C':
            while index + 5 < len(values):
                points = values[index:index + 6]
                index += 6
                for offset in (0, 2, 4):
                    px, py = points[offset], points[offset + 1]
                    min_x, max_x = min(min_x, px), max(max_x, px)
                    min_y, max_y = min(min_y, py), max(max_y, py)
                x, y = points[4], points[5]
                tokens.append(('C', *points))
        elif command == 'Z':
            tokens.append(('Z',))
    if not math.isfinite(min_x):
        raise ValueError('empty path')
    return (min_x, min_y, max_x, max_y), tokens


def fmt(value: float) -> str:
    text = f'{value:.2f}'.rstrip('0').rstrip('.')
    return '0' if text in ('-0', '') else text


def tikz_path(tokens, offset_x: float, offset_y: float) -> str:
    parts = []
    for token in tokens:
        kind = token[0]
        if kind == 'M':
            parts.append(f'({fmt(token[1] - offset_x)},{fmt(token[2] - offset_y)})')
        elif kind == 'L':
            parts.append(f'-- ({fmt(token[1] - offset_x)},{fmt(token[2] - offset_y)})')
        elif kind == 'C':
            parts.append(
                f'.. controls ({fmt(token[1] - offset_x)},{fmt(token[2] - offset_y)}) '
                f'and ({fmt(token[3] - offset_x)},{fmt(token[4] - offset_y)}) '
                f'.. ({fmt(token[5] - offset_x)},{fmt(token[6] - offset_y)})'
            )
        elif kind == 'Z':
            parts.append('-- cycle')
    return ' '.join(parts)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', default='icpc_foundation.svg')
    args = parser.parse_args()
    root = Path.cwd()
    source = root / args.source
    tree = ElementTree.parse(source)
    svg = tree.getroot()

    icons = []
    text_threshold = 640.0
    for node in svg.iter(f'{SVG_NS}path'):
        d = node.get('d', '')
        fill = (node.get('fill') or '').upper()
        if fill not in COLORS:
            continue
        box, tokens = parse_path(d)
        # The wordmark sits at the bottom (max y > 700).  The three cloud
        # tail dots reach y≈623, so classify by the bottom edge, not the top.
        if box[3] > text_threshold:
            continue
        icons.append({'d': d, 'fill': fill, 'box': box, 'tokens': tokens})

    if not icons:
        raise SystemExit('no icon paths found')

    min_x = min(item['box'][0] for item in icons)
    min_y = min(item['box'][1] for item in icons)
    max_x = max(item['box'][2] for item in icons)
    max_y = max(item['box'][3] for item in icons)
    width = max_x - min_x
    height = max_y - min_y
    padding = 2.0
    view_x = min_x - padding
    view_y = min_y - padding
    view_w = width + padding * 2
    view_h = height + padding * 2

    # 1. Cropped icon-only SVG used by the editor and printed pages.
    lines = [
        '<svg xmlns="http://www.w3.org/2000/svg"',
        f'     viewBox="{fmt(view_x)} {fmt(view_y)} {fmt(view_w)} {fmt(view_h)}"',
        '     role="img" aria-label="云朵、灯泡与气球">',
    ]
    for item in icons:
        lines.append(f'  <path d="{item["d"]}" fill="{item["fill"]}"/>')
    lines.append('</svg>')
    (root / 'assets' / 'logo-mark.svg').write_text('\n'.join(lines) + '\n', encoding='utf-8')

    # 2. TikZ version of the same paths for the LaTeX export.
    groups = {}
    for item in icons:
        groups.setdefault(item['fill'], []).append(item)
    body = []
    for fill, items in groups.items():
        color = COLORS[fill]
        body.append(f'\\fill[{color}]')
        for index, item in enumerate(items):
            suffix = ';' if index == len(items) - 1 else ''
            body.append(f'  {tikz_path(item["tokens"], min_x, min_y)}{suffix}')
    tikz = '\n'.join(body)
    js = """(function () {
  'use strict';
  const TX = window.TX = window.TX || {};
  TX.logo = {
    width: %s,
    height: %s,
    tikz: String.raw`%s`
  };
})();
""" % (fmt(width), fmt(height), tikz)
    (root / 'js' / 'logo-tikz.js').write_text(js, encoding='utf-8')

    print(f'icons: {len(icons)}; viewBox: {fmt(view_x)} {fmt(view_y)} {fmt(view_w)} {fmt(view_h)}')
    print(f'logo aspect: {width / height:.3f}')


if __name__ == '__main__':
    main()
