#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
单文件版打包器
=============
把整个 App（index.html + css + js + data）内联成一个独立 HTML 文件：
    dist/考途-单文件版.html
这个文件可以：
  - 发到手机（微信/QQ/网盘/数据线），用浏览器直接打开，**无需电脑、无需局域网、完全离线**
  - 双击在电脑上打开
  - 学习进度照常保存在打开它的浏览器 localStorage 中

用法：
    python tools/make_single_file.py
    python tools/make_single_file.py --api https://xxx.ngrok-free.dev
        ↑ 把服务器的公网地址写进默认配置：file:// 模式打开也能自动同步在线题库

注意：题库更新（tools/build.py）后需要重新运行本脚本刷新单文件版。
"""

import os
import re
import sys
import time

# PowerShell/cmd 的 GBK 管道会让 ✓ 等符号崩溃（UnicodeEncodeError），统一切 UTF-8 输出
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INDEX = os.path.join(ROOT, 'index.html')
OUT = os.path.join(ROOT, 'dist', '考途-单文件版.html')   # 产物统一归档 dist/
PUBLIC_API_FILE = os.path.join(ROOT, '.public_api')
PLACEHOLDER = '__PUBLIC_API__'


def default_api():
    """未传 --api 时的地址来源：.tunnel_url（运行中隧道）> .public_api 本机配置。
    真实域名只存本机 gitignored 文件，源码/仓库永不出现。"""
    for p in (os.path.join(ROOT, '.tunnel_url'), PUBLIC_API_FILE):
        if os.path.isfile(p):
            try:
                with open(p, 'r', encoding='utf-8') as f:
                    t = f.read().strip().rstrip('/')
                if t:
                    return t
            except OSError:
                pass
    return ''


def read(path):
    with open(path, 'r', encoding='utf-8') as f:
        return f.read()


def main():
    if not os.path.isfile(INDEX):
        print('找不到 index.html：%s' % INDEX)
        return 2
    html = read(INDEX)
    missing = []
    inlined = []

    # 1) 内联 CSS
    def repl_css(m):
        path = m.group(1)
        full = os.path.join(ROOT, path.replace('/', os.sep))
        if not os.path.isfile(full):
            missing.append(path)
            return m.group(0)
        css = read(full)
        if '</style' in css.lower():
            print('警告：%s 含 </style，已跳过该处的内联保护，请人工检查' % path)
        inlined.append(path)
        return '<style>\n/* inlined: %s */\n%s\n</style>' % (path, css)

    html = re.sub(r'<link rel="stylesheet" href="([^"]+)">', repl_css, html)

    # 2) 移除外部 PWA 资源引用（单文件无法携带目录，留着只会产生无谓的 404）
    html = re.sub(r'\s*<link rel="manifest"[^>]*>', '', html)
    html = re.sub(r'\s*<link rel="icon"[^>]*>', '', html)
    html = re.sub(r'\s*<link rel="apple-touch-icon"[^>]*>', '', html)

    # 3) 内联所有外部 script（保持原有顺序）
    def repl_js(m):
        path = m.group(1)
        full = os.path.join(ROOT, path.replace('/', os.sep))
        if not os.path.isfile(full):
            missing.append(path)
            return m.group(0)
        js = read(full)
        # 转义内容中的 </script，防止提前闭合内联标签
        # （JS 里 \/ 等价于 /，字符串/正则/注释中出现都安全）
        js = re.sub(r'</script', r'<\\/script', js, flags=re.IGNORECASE)
        inlined.append(path)
        return '<script>\n/* inlined: %s */\n%s\n</script>' % (path, js)

    html = re.sub(r'<script src="([^"]+)"></script>', repl_js, html)

    if missing:
        print('✗ 以下文件缺失，无法完成打包：')
        for p in missing:
            print('   - ' + p)
        return 1

    # 3.5) 注入默认 API 地址：--api 优先，缺省读本机 .public_api（不进仓库）
    api_url = None
    if '--api' in sys.argv:
        i = sys.argv.index('--api')
        if i + 1 < len(sys.argv):
            api_url = sys.argv[i + 1].rstrip('/')
    if not api_url:
        api_url = default_api() or None
    # js 源码里的兜底占位符（pages-extra.js DEFAULT_API）替换为真实地址或空串
    html = html.replace(PLACEHOLDER, api_url or '')
    if api_url:
        marker = "autoSync: true, syncUrl: ''"
        replacement = "autoSync: true, syncUrl: '%s'" % api_url.replace("'", '')
        if marker in html:
            html = html.replace(marker, replacement)
            print('已注入默认 API 地址：%s' % api_url)
        else:
            print('警告：未找到 syncUrl 默认值锚点，--api 未生效（请检查 js/store.js 是否改动）')

    # 4) 基本健康检查
    checks = [
        ('QB 引导脚本存在', 'window.QB.add' in html),
        ('题库数据已内联', 'window.QB.meta' in html and html.count('window.QB.add(') >= 13),
        ('应用脚本已内联', 'window.App = {' in html or 'App = {' in html),
        ('无残留外部 script', '<script src=' not in html),
        ('无残留外部 css link', 'rel="stylesheet" href=' not in html),
    ]
    bad = [name for name, ok in checks if not ok]
    if bad:
        print('✗ 打包结果健康检查未通过：' + '、'.join(bad))
        return 1

    size = len(html.encode('utf-8'))
    stamp = time.strftime('%Y-%m-%d %H:%M:%S')
    note = ('<!-- 考途 · 单文件离线版 | 由 tools/make_single_file.py 生成于 %s | %.1f KB\n'
            '     直接双击或传到手机用浏览器打开即可，数据保存在浏览器本地，完全离线 -->\n' % (stamp, size / 1024.0))
    html = note + html

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8', newline='\n') as f:
        f.write(html)

    print('=' * 58)
    print('✓ 单文件版已生成')
    print('=' * 58)
    print('输出：%s' % OUT)
    print('大小：%.1f KB（含 %d 个内联资源）' % (size / 1024.0, len(inlined)))
    for p in inlined:
        print('   · ' + p)
    print('-' * 58)
    print('使用方法：')
    print('  电脑：双击该文件即可（建议用 Chrome/Edge）')
    print('  安卓：把文件发到手机（微信/QQ/USB），在文件管理器中选择')
    print('        「用浏览器打开」，即成为一个完全离线的学习 App')
    print('  iOS ：iOS 对本地 HTML 限制较多，建议在局域网中用 Safari')
    print('        打开一次并「添加到主屏幕」，之后即可永久离线使用')
    print('-' * 58)
    print('提示：题库更新后（python tools/build.py）请重新运行本脚本。')
    return 0


if __name__ == '__main__':
    sys.exit(main())
