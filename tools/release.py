#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""一键发布：改完 db/*.json 后跑这一条，重建全部产物。

流程：
    1. build.py            校验 + 重建内置题库 data/*.js + 同步 index.html
    2. export_static.py    导出纯静态题库 deploy/api/*.json（静态托管方案用）
    3. make_single_file.py 重建单文件版（默认注入内置公网 API 地址，可用 --api 覆盖）
    4. build_apk.py        重建 Android APK（失败仅告警，不阻塞前面产物）

用法：
    python tools/release.py                 # 全部四步
    python tools/release.py --no-apk        # 跳过 APK（没装 JDK/SDK 时用）
    python tools/release.py --api URL       # 单文件版注入自定义服务器地址
"""
import os
import subprocess
import sys

sys.stdout.reconfigure(encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PY = sys.executable

PUBLIC_API_FILE = os.path.join(ROOT, '.public_api')
TUNNEL_FILE = os.path.join(ROOT, '.tunnel_url')


def read_public_api():
    """公网 API 地址优先级：环境变量 PUBLIC_API > .tunnel_url（当前运行隧道）> .public_api。

    真实域名只存本机 gitignored 文件，源码/README 不出现（安全红线）。
    """
    t = (os.environ.get('PUBLIC_API') or '').strip()
    if not t:
        for p in (TUNNEL_FILE, PUBLIC_API_FILE):
            if os.path.isfile(p):
                try:
                    with open(p, 'r', encoding='utf-8') as f:
                        t = f.read().strip()
                except OSError:
                    t = ''
                if t:
                    break
    return t.rstrip('/')


def run(script, args, label, optional=False):
    print('\n' + '=' * 60)
    print('  [%s] python tools/%s %s' % (label, script, ' '.join(args)))
    print('=' * 60)
    code = subprocess.call([PY, os.path.join(ROOT, 'tools', script)] + args, cwd=ROOT)
    if code != 0:
        if optional:
            print('⚠ %s 失败（码 %d），跳过——其余产物不受影响' % (label, code))
            return False
        print('✗ %s 失败（码 %d），发布中止' % (label, code))
        raise SystemExit(code)
    return True


def main():
    argv = sys.argv[1:]
    no_apk = '--no-apk' in argv
    api = read_public_api()
    if '--api' in argv:
        i = argv.index('--api')
        if i + 1 < len(argv):
            api = argv[i + 1].rstrip('/')
    if api:
        print('· 公网 API（来自本机配置，不入库）：%s' % api)
    else:
        print('· 未配置公网地址（.public_api / PUBLIC_API / .tunnel_url 均空），单文件版不注入 API，可在 App 内手填')

    run('build.py', [], '1/4 构建校验', optional=False)
    run('export_static.py', [], '2/4 静态导出', optional=False)
    sf_args = ['--api', api] if api else []
    run('make_single_file.py', sf_args, '3/4 单文件版', optional=False)
    ok_apk = run('build_apk.py', ['--clean'], '4/4 APK', optional=True) if not no_apk else False

    print('\n' + '=' * 60)
    print('  发布完成')
    print('    · 内置题库 data/         ✓')
    print('    · 静态题库 deploy/api/   ✓（上传托管平台即热更新）')
    print('    · dist/考途-单文件版.html ✓（API: %s）' % api)
    if no_apk:
        print('    · APK                    已跳过（--no-apk）')
    elif ok_apk:
        print('    · dist/考途.apk           ✓')
    else:
        print('    · APK                    ✗ 见上方日志（其余产物可用）')
    print('=' * 60)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
