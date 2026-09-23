#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
APK 构建器 —— 把整个「考途」打成一个可安装的 Android APK
==============================================================
不依赖 Gradle / Android Studio，直接用 Android SDK 的 build-tools + JDK 手打：

    资源+前端 assets → aapt2 compile/link → base.apk + R.java
    Java → javac(对 android.jar) → d8 → classes.dex → 塞进 apk
    → zipalign 对齐 → apksigner 签名 → dist/考途.apk

★ 中文路径规避：
    aapt2 29.0.3 在 Windows 上对含中文/非 ASCII 的路径会报
    “failed to open directory”。本脚本把整个构建过程放在纯 ASCII 的
    临时目录（%TEMP%\\bagutong_build）里跑，产物再拷回项目 dist/，
    所以项目本身放在中文目录也能正常构建。

前置：JDK（java/javac/jar/keytool）+ Android build-tools + platforms/android-*/android.jar

用法：
    python tools/build_apk.py             # 构建（首次自动生成签名密钥）
    python tools/build_apk.py --clean     # 先清理临时目录再构建
    python tools/build_apk.py --api 29    # 指定编译 platform
产物：dist/考途.apk
"""

import argparse
import glob
import os
import shutil
import subprocess
import sys
import tempfile
import time

# Windows 控制台/管道默认 GBK，打印 ✓ ✗ · 等符号会抛 UnicodeEncodeError
# 导致构建中断且退出码非 0，统一切换到 UTF-8。
for _stream in (sys.stdout, sys.stderr):
    try:
        if _stream is not None and hasattr(_stream, 'reconfigure'):
            _stream.reconfigure(encoding='utf-8')
    except Exception:
        pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHELL = os.path.join(ROOT, 'android-shell')
DIST = os.path.join(ROOT, 'dist')
KEYSTORE = os.path.join(ROOT, 'android-shell', 'bagutong.keystore')

# 纯 ASCII 构建工作目录（关键：规避 aapt2 中文路径缺陷）
WORK = os.path.join(tempfile.gettempdir(), 'bagutong_build')

KS_PASS = 'bagutong2024'
KS_ALIAS = 'bagutong'
KS_DNAME = 'CN=Bagutong, OU=Learn, O=Bagutong, L=City, S=State, C=CN'

ASSET_FILES = ['index.html', 'manifest.webmanifest', 'sw.js']
ASSET_DIRS = ['css', 'js', 'data', 'icons']

# 公网 API 地址：只存本机 gitignored 文件，源码里只有占位符（安全红线：不入库）
PUBLIC_API_FILE = os.path.join(ROOT, '.public_api')
TUNNEL_FILE = os.path.join(ROOT, '.tunnel_url')
PLACEHOLDER = '__PUBLIC_API__'

MIN_SDK = 21
TARGET_SDK = 29


def read_public_api():
    """地址优先级：.tunnel_url（运行中隧道）> .public_api 本机配置 > 空。"""
    for p in (TUNNEL_FILE, PUBLIC_API_FILE):
        if os.path.isfile(p):
            try:
                with open(p, 'r', encoding='utf-8') as f:
                    t = f.read().strip().rstrip('/')
                if t:
                    return t
            except OSError:
                pass
    return ''


def inject_public_api(assets_dir):
    """把 js 里的 __PUBLIC_API__ 占位符替换为真实地址（或空串）。
    只改 assets 副本，源文件 js/pages-extra.js 保持占位符——真实域名永不进仓库。"""
    api = read_public_api()
    target = os.path.join(assets_dir, 'js', 'pages-extra.js')
    if not os.path.isfile(target):
        log('  ⚠ assets/js/pages-extra.js 缺失，跳过 API 注入')
        return
    with open(target, 'r', encoding='utf-8') as f:
        src = f.read()
    if PLACEHOLDER not in src:
        return
    with open(target, 'w', encoding='utf-8', newline='') as f:
        f.write(src.replace(PLACEHOLDER, api))
    log('  ✓ 已注入公网 API：%s' % (api or '（未配置，留空 = App 内手填）'))


def log(msg):
    sys.stdout.write(msg + '\n'); sys.stdout.flush()


def die(msg, code=1):
    sys.stdout.write('\n✗ ' + msg + '\n'); sys.exit(code)


def run(cmd, cwd=None, quiet=False, check=True):
    if not quiet:
        log('  $ ' + ' '.join((c if len(c) < 58 else '…' + c[-55:]) for c in cmd))
    p = subprocess.run(cmd, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                       text=True, encoding='utf-8', errors='replace')
    out = (p.stdout or '').strip()
    if out and not quiet:
        for line in out.splitlines()[:40]:
            sys.stdout.write('    ' + line + '\n')
    if check and p.returncode != 0:
        die('命令失败（code %d）：\n%s' % (p.returncode, out))
    return p.returncode, out


# ---------------------------------------------------------------------------
# 环境探测
# ---------------------------------------------------------------------------
def find_java_home():
    jh = os.environ.get('JAVA_HOME')
    if jh and os.path.isfile(os.path.join(jh, 'bin', 'javac.exe')):
        return jh
    javac = shutil.which('javac') or shutil.which('javac.exe')
    if javac:
        home = os.path.dirname(os.path.dirname(javac))
        if os.path.isfile(os.path.join(home, 'bin', 'javac.exe')):
            return home
    return None


def find_sdk():
    for env in ('ANDROID_HOME', 'ANDROID_SDK_ROOT'):
        v = os.environ.get(env)
        if v and os.path.isdir(v):
            return v
    for guess in [r'D:\ADB\android-sdk-windows',
                  os.path.expandvars(r'%LOCALAPPDATA%\Android\Sdk'),
                  r'C:\Android\Sdk']:
        if os.path.isdir(guess):
            return guess
    return None


def find_build_tools(sdk):
    bt_root = os.path.join(sdk, 'build-tools')
    if not os.path.isdir(bt_root):
        return None, None
    vers = [d for d in os.listdir(bt_root) if os.path.isdir(os.path.join(bt_root, d))]
    if not vers:
        return None, None
    vers.sort(key=lambda v: [int(x) for x in v.split('.') if x.isdigit()] or [0], reverse=True)
    return bt_root, vers[0]


def find_android_jar(sdk, want_api=None):
    plat = os.path.join(sdk, 'platforms')
    if not os.path.isdir(plat):
        return None
    cands = []
    for d in os.listdir(plat):
        jar = os.path.join(plat, d, 'android.jar')
        if os.path.isfile(jar):
            api = ''.join(ch for ch in d if ch.isdigit())
            cands.append((int(api) if api else 0, jar))
    if want_api:
        for api, jar in cands:
            if api == want_api:
                return jar
    cands.sort(reverse=True)
    return cands[0][1] if cands else None


def ensure_keystore(java_home):
    if os.path.isfile(KEYSTORE):
        # JDK 21 默认生成 PKCS12，老 apksigner 不识别 → 检查并重建为 JKS
        if _is_jks(KEYSTORE):
            log('  ✓ 复用已有签名密钥：android-shell/bagutong.keystore (JKS)')
            return KEYSTORE
        log('  · 密钥不是 JKS 格式（老 apksigner 无法读取），备份并重建…')
        try:
            shutil.move(KEYSTORE, KEYSTORE + '.bak-pkcs12')
        except OSError:
            os.remove(KEYSTORE)
    keytool = os.path.join(java_home, 'bin', 'keytool.exe')
    if not os.path.isfile(keytool):
        keytool = shutil.which('keytool') or die('找不到 keytool，无法生成签名密钥')
    log('  · 生成 JKS 签名密钥（有效期约 27 年）…')
    run([keytool, '-genkeypair', '-v',
         '-keystore', KEYSTORE, '-alias', KS_ALIAS,
         '-storetype', 'JKS',            # ★ 关键：老 apksigner 只认 JKS
         '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10000',
         '-storepass', KS_PASS, '-keypass', KS_PASS, '-dname', KS_DNAME])
    return KEYSTORE


def _is_jks(path):
    """JKS 魔数 0xFEEDFEED；PKCS12 则是 ASN.1 序列 0x3082"""
    try:
        with open(path, 'rb') as f:
            head = f.read(4)
        return head == b'\xfe\xed\xfe\xed'
    except OSError:
        return False


# ---------------------------------------------------------------------------
# 构建
# ---------------------------------------------------------------------------
def build(api=None, clean=False):
    t0 = time.time()
    log('=' * 64); log('  考途 · APK 构建'); log('=' * 64)

    java_home = find_java_home() or die('未找到 JDK（javac）。请安装 JDK 17+ 并设置 JAVA_HOME。')
    sdk = find_sdk() or die('未找到 Android SDK。请设置 ANDROID_HOME。')
    bt_root, bt_ver = find_build_tools(sdk)
    if not bt_ver:
        die('SDK 里找不到 build-tools（需含 aapt2/d8/zipalign/apksigner）。')
    bt = os.path.join(bt_root, bt_ver)
    android_jar = find_android_jar(sdk, api) or die(
        '找不到 android.jar（platforms/android-*/android.jar）。\n'
        '   安装示例：sdkmanager "platforms;android-29"')

    jdk_bin = os.path.join(java_home, 'bin')
    javac = os.path.join(jdk_bin, 'javac.exe')
    jarexe = os.path.join(jdk_bin, 'jar.exe')
    aapt2 = os.path.join(bt, 'aapt2.exe')
    dx = os.path.join(bt, 'dx.bat')
    zipalign = os.path.join(bt, 'zipalign.exe')
    apksigner = os.path.join(bt, 'apksigner.bat')
    for p in (javac, jarexe, aapt2, dx, zipalign, apksigner):
        if not os.path.isfile(p):
            die('缺少构建工具：%s' % p)

    log('  JDK:         %s' % java_home)
    log('  build-tools: %s' % bt_ver)
    log('  android.jar: %s' % android_jar)
    log('  构建目录:    %s （纯 ASCII，规避中文路径）' % WORK)
    log('-' * 64)

    # ---- 准备工作目录（纯 ASCII）----
    if os.path.isdir(WORK) and clean:
        shutil.rmtree(WORK)
    if not os.path.isdir(WORK) or clean:
        os.makedirs(WORK, exist_ok=True)
    for sub in ('assets', 'gen', 'classes', 'dex'):
        d = os.path.join(WORK, sub)
        if clean and os.path.isdir(d):
            shutil.rmtree(d)
        os.makedirs(d, exist_ok=True)

    # ---- 收集前端资产 → WORK/assets ----
    assets = os.path.join(WORK, 'assets')
    n = 0
    for f in ASSET_FILES:
        src = os.path.join(ROOT, f)
        if os.path.isfile(src):
            shutil.copy2(src, os.path.join(assets, f)); n += 1
    for d in ASSET_DIRS:
        src = os.path.join(ROOT, d)
        if os.path.isdir(src):
            dst = os.path.join(assets, d)
            if os.path.isdir(dst):
                shutil.rmtree(dst)
            shutil.copytree(src, dst, ignore=shutil.ignore_patterns('__pycache__', '*.pyc'))
            for _r, _ds, fs in os.walk(dst):
                n += len([x for x in fs if not x.endswith('.pyc')])
    # ---- 注入公网 API 地址（占位符 → 本机 .public_api，真实域名不进仓库）----
    inject_public_api(assets)
    if not os.path.isfile(os.path.join(assets, 'index.html')):
        die('assets/index.html 未找到，前端打包异常')
    log('  ✓ 已打包前端资产 %d 个文件到 assets/' % n)

    # ---- 复制壳资源到工作目录（中文路径 → ASCII 路径）----
    work_res = os.path.join(WORK, 'res')
    if os.path.isdir(work_res):
        shutil.rmtree(work_res)
    shutil.copytree(os.path.join(SHELL, 'res'), work_res)
    work_manifest = os.path.join(WORK, 'AndroidManifest.xml')
    shutil.copy2(os.path.join(SHELL, 'AndroidManifest.xml'), work_manifest)
    work_src = os.path.join(WORK, 'src')
    if os.path.isdir(work_src):
        shutil.rmtree(work_src)
    shutil.copytree(os.path.join(SHELL, 'src'), work_src)

    # ---- aapt2 编译资源 ----
    res_flat = os.path.join(WORK, 'res.zip')
    run([aapt2, 'compile', '--dir', work_res, '-o', res_flat])

    # ---- aapt2 链接 → base.apk + R.java ----
    # 注意：不用 -A 传 assets！aapt2 29.0.3 在 Windows 上会把子目录写进
    # zip 条目名时用反斜杠（assets/css\style.css），Android AssetManager
    # 用 / 查找会导致全部子资源加载失败（App 白屏）。
    # assets 改在后面用 jar 追加（Java 规范强制 / 分隔符）。
    base_apk = os.path.join(WORK, 'base.apk')
    run([aapt2, 'link', '-o', base_apk, '-I', android_jar,
         '--manifest', work_manifest, '-R', res_flat,
         '--java', os.path.join(WORK, 'gen'), '--auto-add-overlay',
         '--min-sdk-version', str(MIN_SDK), '--target-sdk-version', str(TARGET_SDK)])
    if not os.path.isfile(base_apk):
        die('aapt2 link 未产出 base.apk')

    # ---- javac ----
    gen = os.path.join(WORK, 'gen'); classes = os.path.join(WORK, 'classes')
    sources = glob.glob(os.path.join(work_src, '**', '*.java'), recursive=True) + \
        glob.glob(os.path.join(gen, '**', '*.java'), recursive=True)
    if not sources:
        die('找不到 .java 源文件')
    # 必须用 source/target 8：
    #   ① -bootclasspath 指向 android.jar 仅当 target <= 8 时允许
    #   ② build-tools 29 的 d8 只接受 Java 8 字节码（class v52）
    # JDK 21 仍支持 source 8（仅报 obsolete 警告，-nowarn 压制）
    run([javac, '-source', '8', '-target', '8', '-nowarn', '-encoding', 'UTF-8',
         '-bootclasspath', android_jar, '-d', classes] + sources)

    # ---- dx → classes.dex ----
    # 说明：build-tools 29 的 d8.bat 在 JDK 21 下会内部 NPE（老工具×新 JDK），
    # 改用同目录的经典 dx.bat（实测兼容；dex 格式稳定，运行时无差异）
    dex = os.path.join(WORK, 'dex')
    dx = os.path.join(bt, 'dx.bat')
    if not os.path.isfile(dx):
        die('找不到 dx.bat（%s）' % dx)
    run([dx, '--dex', '--min-sdk-version=' + str(MIN_SDK),
         '--output=' + os.path.join(dex, 'classes.dex'), classes])
    if not os.path.isfile(os.path.join(dex, 'classes.dex')):
        die('dx 未产出 classes.dex')

    # ---- classes.dex + assets 塞进 apk（jar 追加，条目路径保证用 / 分隔）----
    with_dex = os.path.join(WORK, 'with-dex.apk')
    shutil.copy2(base_apk, with_dex)
    run([jarexe, 'uf', with_dex, 'classes.dex'], cwd=dex)
    run([jarexe, 'uf', with_dex, 'assets'], cwd=WORK)

    # ---- zipalign ----
    aligned = os.path.join(WORK, 'aligned.apk')
    if os.path.isfile(aligned):
        os.remove(aligned)
    run([zipalign, '-f', '-p', '4', with_dex, aligned])

    # ---- 签名 ----
    ks = ensure_keystore(java_home)
    os.makedirs(DIST, exist_ok=True)
    final_apk = os.path.join(DIST, '考途.apk')
    if os.path.isfile(final_apk):
        os.remove(final_apk)
    run([apksigner, 'sign', '--ks', ks, '--ks-key-alias', KS_ALIAS,
         '--ks-pass', 'pass:' + KS_PASS, '--key-pass', 'pass:' + KS_PASS,
         '--out', final_apk, aligned])
    run([apksigner, 'verify', '--print-certs', final_apk])

    size = os.path.getsize(final_apk) / 1024.0
    log('=' * 64); log('✓ 构建成功'); log('=' * 64)
    log('  APK： %s' % final_apk)
    log('  大小： %.1f KB    耗时： %.1f 秒' % (size, time.time() - t0))
    log('-' * 64)
    log('  安装（三选一）：')
    log('    1) USB 连手机： adb install -r "%s"' % final_apk)
    log('    2) 把 apk 发到手机点击安装（需允许「安装未知来源应用」）')
    log('    3) 网盘/局域网下载后安装')
    log('-' * 64)
    log('  内置全部题库，完全离线；如需在线热更新，在 App')
    log('  「我的 → 一键下载在线题库」的地址栏填公网 API 地址即可。')
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--clean', action='store_true')
    ap.add_argument('--api', type=int, default=None)
    a = ap.parse_args()
    return build(api=a.api, clean=a.clean)


if __name__ == '__main__':
    raise SystemExit(main())
