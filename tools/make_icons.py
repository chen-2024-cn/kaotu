#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
生成 PWA 图标（PNG）
===================
不依赖 SVG 渲染库，直接用 Pillow 绘制，与 icons/icon.svg 视觉一致。

输出：
    icons/icon-192.png      普通图标 192
    icons/icon-512.png      普通图标 512
    icons/maskable-192.png  自适应图标 192（内容缩放到安全区，四角留白）
    icons/maskable-512.png  自适应图标 512
    icons/apple-touch-180.png  iOS 添加到主屏幕（180，系统会自动加圆角）

用法：python tools/make_icons.py
依赖：pip install pillow
"""

import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'icons')

C1 = (47, 111, 94)     # #2F6F5E
C2 = (61, 140, 119)    # #3D8C77
WHITE = (255, 255, 255)


def v_gradient(size, top, bottom):
    """垂直渐变背景（RGBA）"""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    px = img.load()
    for y in range(size):
        t = y / max(1, size - 1)
        r = int(top[0] + (bottom[0] - top[0]) * t)
        g = int(top[1] + (bottom[1] - top[1]) * t)
        b = int(top[2] + (bottom[2] - top[2]) * t)
        for x in range(size):
            px[x, y] = (r, g, b, 255)
    return img


def rounded(size, radius):
    """圆角遮罩"""
    m = Image.new('L', (size, size), 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    return m


def round_cap_line(draw, pts, width, fill):
    """带圆头的粗折线（Pillow 的 line 不支持 round cap，用矩形+圆点补）"""
    r = width / 2.0
    draw.line(pts, fill=fill, width=int(width), joint='curve')
    for p in pts:
        draw.ellipse((p[0] - r, p[1] - r, p[0] + r, p[1] + r), fill=fill)


def draw_art(S, maskable=False):
    """
    S: 画布边长（px）
    maskable: True 时把图形整体缩小到 ~66% 居中，留出系统裁切安全边距
    """
    scale = 0.66 if maskable else 1.0
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))

    # --- 背景 ---
    bg = v_gradient(S, C1, C2)
    if maskable:
        img = Image.alpha_composite(img, bg)          # 全画布铺满（系统会裁圆/方）
    else:
        base = Image.new('RGBA', (S, S), (0, 0, 0, 0))
        base.paste(bg, (0, 0), rounded(S, int(S * 0.22)))
        img = base

    # --- 顶部高光 ---
    hl = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    hd = ImageDraw.Draw(hl)
    hd.rectangle((0, 0, S, int(S * 0.58)), fill=(255, 255, 255, 1))
    hd.ellipse((-S * 0.4, -S * 0.75, S * 1.4, S * 0.42), fill=(255, 255, 255, 26))
    img = Image.alpha_composite(img, hl)

    d = ImageDraw.Draw(img)

    # --- 主图形坐标系（相对 S，便于任意尺寸） ---
    cx, cy = S / 2.0, S / 2.0
    u = S * scale / 512.0            # 统一缩放单位

    def P(x, y):
        return (cx + (x - 256) * u, cy + (y - 256) * u)

    lw = 26 * u

    # 书本：左右两页
    book_l = [P(128, 152), P(224, 152), P(260, 188), P(260, 376), P(232, 348), P(128, 348), P(128, 152)]
    book_r = [P(384, 152), P(288, 152), P(252, 188), P(252, 376), P(280, 348), P(384, 348), P(384, 152)]
    d.line(book_l, fill=WHITE, width=int(lw), joint='curve')
    d.line(book_r, fill=WHITE, width=int(lw), joint='curve')
    for pt in book_l + book_r:
        d.ellipse((pt[0] - lw / 2, pt[1] - lw / 2, pt[0] + lw / 2, pt[1] + lw / 2), fill=WHITE)

    # 书内横线（页面上的"八股"文字暗示）
    for i, y in enumerate((200, 240, 280)):
        x1 = 152 if i != 1 else 152
        x2 = 216 if i != 1 else 200
        d.line([P(x1, y), P(x2, y)], fill=(255, 255, 255, 180), width=int(10 * u))

    # 对勾徽标
    br = 72 * u
    bcx, bcy = P(348, 344)
    d.ellipse((bcx - br, bcy - br, bcx + br, bcy + br), fill=WHITE)
    round_cap_line(d, [P(316, 344), P(338, 366), P(382, 320)], 19 * u, C1)

    return img


def save(img, name):
    path = os.path.join(OUT, name)
    img.save(path, 'PNG', optimize=True)
    size = os.path.getsize(path)
    print('  ✓ %-22s %4dx%-4d  %6.1f KB' % (name, img.width, img.height, size / 1024.0))
    return path


def main():
    os.makedirs(OUT, exist_ok=True)
    print('生成 PWA 图标 →', OUT)
    save(draw_art(192), 'icon-192.png')
    save(draw_art(512), 'icon-512.png')
    save(draw_art(192, maskable=True), 'maskable-192.png')
    save(draw_art(512, maskable=True), 'maskable-512.png')

    # iOS：系统会自己加圆角，因此输出方形铺满
    save(draw_art(180, maskable=False), 'apple-touch-180.png')

    # 额外：favicon 32
    save(draw_art(32), 'favicon-32.png')
    print('完成。若需修改视觉，改 tools/make_icons.py 中的配色/坐标后重跑。')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
