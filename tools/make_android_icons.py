#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成 Android 启动图标（mipmap-*）与前景图。视觉与 tools/make_icons.py 一致。
用法：python tools/make_android_icons.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from make_icons import draw_art          # 复用绘图逻辑
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, 'android-shell', 'res')

DENSITIES = [
    ('mipmap-mdpi', 48),
    ('mipmap-hdpi', 72),
    ('mipmap-xhdpi', 96),
    ('mipmap-xxhdpi', 144),
    ('mipmap-xxxhdpi', 192),
]


def main():
    for d, size in DENSITIES:
        out = os.path.join(RES, d)
        os.makedirs(out, exist_ok=True)
        # Android 启动图标：方形铺满（系统会按主题裁圆角）
        img = draw_art(size, maskable=False)
        # 传统 mipmap 图标用满幅 + 系统圆角；这里输出带圆角的方形，兼容性最好
        img.save(os.path.join(out, 'ic_launcher.png'), 'PNG', optimize=True)
        print('  ✓ %s/ic_launcher.png (%dx%d, %.1fKB)' % (
            d, size, size, os.path.getsize(os.path.join(out, 'ic_launcher.png')) / 1024.0))
    print('Android 图标生成完成 →', RES)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
