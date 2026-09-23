#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""一键启动器：serve.py（题库 API）+ ngrok 隧道（公网），合并到一个进程/窗口。

设计要点
--------
1. 若 8080 已有健康服务 → 直接复用，不重复绑定端口；否则以子进程拉起 serve.py。
2. authtoken 解析优先级：环境变量 NGROK_AUTHTOKEN → 项目根 .ngrok_token 文件。
   都没有 → 降级为「本机 + 局域网」模式（不建隧道），并打印配置指引。
3. 隧道用 ngrok Python SDK（forward()）。成功拿到公网 URL 后写入 .tunnel_url，
   并自动把该地址回写进单文件版（make_single_file.py --api）实现分发即用；
   若与 APK 内置默认公网域名不一致会显式提示。
4. Ctrl+C / 关闭窗口 → 优雅关闭隧道 + 终止 serve 子进程。

用法：双击「启动服务器.bat」，或 `python tools/run_all.py [端口]`
"""
import json
import os
import re
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOKEN_FILE = os.path.join(ROOT, '.ngrok_token')
DOMAIN_FILE = os.path.join(ROOT, '.ngrok_domain')
TUNNEL_FILE = os.path.join(ROOT, '.tunnel_url')
PUBLIC_API_FILE = os.path.join(ROOT, '.public_api')
SERVE = os.path.join(ROOT, 'tools', 'serve.py')

# 保留域名（隧道优先绑它，与 APK/单文件版内置默认地址一致 → 手机零配置直连）：
# 只存本机 gitignored 文件/.ngrok_domain 或环境变量，源码不写真实域名（安全红线）。
# 未配置则直接用随机域名隧道，单文件版仍会自动回写当前地址。

# 是否可上色：入口 enable_vt() 探测后设置；默认 False（探测不出就纯文本，绝不出乱码）
_COLOR_OK = False


def c(color, s):
    """彩色输出：仅当 _COLOR_OK（VT 已启用且为 TTY）时上色，否则返回纯文本。"""
    codes = {'g': '32', 'c': '36', 'y': '33', 'r': '31', 'b': '1;34', 'd': '90', 'w': '1;37'}
    if not _COLOR_OK:
        return s
    return '\033[%sm%s\033[0m' % (codes.get(color, '0'), s)


def enable_vt():
    """尽力启用 Windows 控制台 ANSI（VT100）处理；返回是否可以上色。

    - 非 TTY 或设置了 NO_COLOR → 不上色（避免把颜色码写进重定向文件）。
    - Windows：设置 ENABLE_VIRTUAL_TERMINAL_PROCESSING；老 cmd 不支持则回退无色，
      这样用户双击 bat 时绝不会看到 \\033[32m 这样的乱码。
    """
    global _COLOR_OK
    if os.environ.get('NO_COLOR'):
        return False
    if not sys.stdout.isatty():
        return False
    if os.name == 'nt':
        try:
            import ctypes
            k32 = ctypes.windll.kernel32
            h = k32.GetStdHandle(-11)          # STD_OUTPUT_HANDLE
            mode = ctypes.c_uint32()
            if not k32.GetConsoleMode(h, ctypes.byref(mode)):
                return False
            ENABLE_VT = 0x0004
            if not k32.SetConsoleMode(h, mode.value | ENABLE_VT):
                return False
        except Exception:  # noqa: BLE001
            return False
    return True


def out(s=''):
    print(s, flush=True)


def box(lines, color='c'):
    w = max(_vis(x) for x in lines) if lines else 0
    w = max(w, 60)
    bar = '═' * (w + 2)
    out(c(color, '╔' + bar + '╗'))
    for ln in lines:
        pad = ' ' * (w - _vis(ln))
        out(c(color, '║ ') + ln + pad + c(color, ' ║'))
    out(c(color, '╚' + bar + '╝'))


_ANSI = re.compile(r'\033\[[0-9;]*m')


def _vis(s):
    """可视宽度：先剥离 ANSI 颜色码，再把中文按 2 列估算，仅供对齐用。"""
    import unicodedata
    s = _ANSI.sub('', s)
    return sum(2 if unicodedata.east_asian_width(ch) in ('W', 'F') else 1 for ch in s)


def lan_ip():
    """真实出口 IP：连一个外部地址看本地绑定到哪个网卡（不发送数据）。"""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 80))
        return s.getsockname()[0]
    except OSError:
        return None
    finally:
        s.close()


def health(port, timeout=2):
    try:
        with urllib.request.urlopen('http://127.0.0.1:%d/api/health' % port, timeout=timeout) as r:
            return json.loads(r.read().decode('utf-8', 'replace'))
    except Exception:  # noqa: BLE001
        return None


def wait_health(port, tries=40, interval=0.4):
    for _ in range(tries):
        h = health(port)
        if h and h.get('ok'):
            return h
        time.sleep(interval)
    return None


def read_token():
    t = (os.environ.get('NGROK_AUTHTOKEN') or '').strip()
    if t:
        return t, 'env:NGROK_AUTHTOKEN'
    if os.path.isfile(TOKEN_FILE):
        try:
            with open(TOKEN_FILE, 'r', encoding='utf-8') as f:
                t = f.read().strip()
            if t:
                return t, '.ngrok_token'
        except OSError:
            pass
    return None, None


def read_domain():
    """读保留域名：环境变量 NGROK_DOMAIN > .ngrok_domain > .public_api 本机配置；
    都没有则返回 None（不绑保留域名，直接随机隧道）。真实域名不在源码里。"""
    d = (os.environ.get('NGROK_DOMAIN') or '').strip()
    for p in (DOMAIN_FILE, PUBLIC_API_FILE):
        if not d and os.path.isfile(p):
            try:
                with open(p, 'r', encoding='utf-8') as f:
                    d = f.read().strip()
            except OSError:
                d = ''
    return host_only(d) if d else None


def host_only(u):
    """从 URL 抠出域名（去掉 scheme 与末尾斜杠）。"""
    u = u.strip().rstrip('/')
    for pre in ('https://', 'http://'):
        if u.lower().startswith(pre):
            u = u[len(pre):]
    return u.split('/')[0]


def start_tunnel(port, token):
    """用 ngrok SDK 建 HTTP 隧道。

    优先绑定保留域名（与 APK 内置默认一致，手机零配置直连）；
    若账号无该保留域名而失败，则回退随机 URL。返回 (url, listener, domain_used)。
    """
    try:
        import ngrok
    except ImportError:
        out(c('y', '  ⚠ 未安装 ngrok Python SDK，跳过隧道（pip install ngrok 后重试）'))
        return None, None, False
    domain = read_domain()
    addr = 'http://localhost:%d' % port

    def grab_url(listener):
        try:
            u = listener.url()
            return u.get_url() if hasattr(u, 'get_url') else str(u)
        except Exception:  # noqa: BLE001
            return None

    # 先试固定保留域名（未配置则跳过，直接随机隧道）
    if domain:
        try:
            listener = ngrok.forward(addr=addr, authtoken=token, domain=domain)
            url = grab_url(listener)
            out(c('g', '        ✓ 已绑定保留域名：%s' % domain))
            return url, listener, True
        except Exception as e:  # noqa: BLE001
            out(c('y', '        · 绑定保留域名失败（%s）' % type(e).__name__))
            out(c('d', '        · 回退到随机域名隧道 …'))
    # 回退：随机 URL（需在 App 里改一次地址）
    try:
        listener = ngrok.forward(addr=addr, authtoken=token)
        url = grab_url(listener)
        return url, listener, False
    except Exception as e:  # noqa: BLE001
        out(c('r', '  ✗ 隧道创建失败：%s' % e))
        return None, None, False


def refresh_single_file(api_url):
    """把当前服务器地址回写进单文件版（dist/考途-单文件版.html）。

    单文件版是 file:// 分发的离线 App，无法同源，必须把 API 地址烤进去，
    手机打开后「一键下载在线题库」才能直连本机隧道/局域网。
    失败不阻塞启动（仅告警）：内置题库的离线部分照常可用。
    """
    script = os.path.join(ROOT, 'tools', 'make_single_file.py')
    if not os.path.isfile(script):
        return False
    try:
        code = subprocess.call(
            [sys.executable, script, '--api', api_url],
            cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return code == 0
    except Exception:  # noqa: BLE001
        return False


def main():
    port = 8080
    if len(sys.argv) > 1 and sys.argv[1].isdigit():
        port = int(sys.argv[1])

    out()
    box(['考途 · 一键启动',
         '题库服务器（serve.py） + 公网隧道（ngrok）'])

    # ---- 1) serve.py ----
    proc = None
    out()
    out(c('d', '  [1/3] 启动题库服务器 …'))
    existing = health(port)
    if existing and existing.get('ok'):
        out(c('g', '        已检测到 8080 端口有健康服务，直接复用（未重复启动）'))
    else:
        # 子进程共享当前控制台，serve.py 的日志会实时打印在本窗口
        proc = subprocess.Popen([sys.executable, SERVE, str(port), '--no-open'])
        out(c('d', '        已拉起 serve.py，等待就绪 …'))
    h = wait_health(port) or existing
    if not h or not h.get('ok'):
        out(c('r', '        ✗ 服务器未就绪，请先看上方 serve.py 是否有报错'))
        if proc:
            proc.terminate()
        return 1
    ver = h.get('version', '?')
    out(c('g', '        ✓ 题库 API 就绪 · 版本 ' + str(ver)))

    # ---- 2) 隧道 ----
    out()
    out(c('d', '  [2/3] 建立公网隧道 …'))
    token, tok_src = read_token()
    ip = lan_ip()
    lan_url = 'http://%s:%d' % (ip, port) if ip else None
    public_url = None
    listener = None
    domain_used = False
    if not token:
        out(c('y', '        未找到 authtoken → 跳过公网隧道（走本机 + 局域网模式）'))
        out(c('d', '        配置方法：双击运行「启动服务器.bat」，首次会弹窗让你粘贴 token；'))
        out(c('d', '        token 在 https://dashboard.ngrok.com/get-started/your-authtoken 获取'))
    else:
        out(c('d', '        （token 来源：%s）正在向 ngrok 建立隧道，首次会下载 agent，请稍候 …' % tok_src))
        public_url, listener, domain_used = start_tunnel(port, token)

    # ---- 3) 汇总 ----
    out()
    out(c('d', '  [3/3] 完成，汇总如下'))
    out()
    try:
        import json as _j
        with urllib.request.urlopen('http://127.0.0.1:%d/api/version' % port, timeout=3) as r:
            vj = _j.loads(r.read().decode('utf-8', 'replace'))
            qn, cats = vj.get('questions', '?'), vj.get('categories', '?')
    except Exception:  # noqa: BLE001
        qn, cats = '?', '?'

    lines = ['本机访问   http://localhost:%d' % port]
    if lan_url:
        lines.append('局域网     %s   （手机同 Wi-Fi）' % lan_url)
    if public_url:
        lines.append('公网地址   %s' % public_url)
        try:
            with open(TUNNEL_FILE, 'w', encoding='utf-8') as f:
                f.write(public_url)
        except OSError:
            pass
        # 一键回写：把当前公网地址重新烤进单文件版，手机打开即能「一键下载」
        if refresh_single_file(public_url):
            lines.append(c('g', '✓ 已把当前地址打包进 dist/考途-单文件版.html（分发即用）'))
        else:
            lines.append(c('y', '⚠ 单文件版地址回写失败，不影响服务器运行'))
        if domain_used and read_domain() and host_only(public_url) == read_domain():
            lines.append(c('g', '✓ 已落在 App 内置默认域名，APK 零配置直接可用'))
        else:
            lines.append('')
            lines.append(c('y', '⚠ 公网地址与 APK 内置默认域名不同，两种处理方式任选：'))
            lines.append(c('y', '  ① 用上方刷新的「单文件版」分发（地址已烤进去，免配置）'))
            lines.append(c('y', '  ② 手机 APK：打开 App 会自动提示，或在「我的」下载卡地址栏填一次'))
    else:
        lines.append('公网隧道   未启用（无 authtoken，或隧道创建失败，见上方日志）')
    box(lines, 'g' if public_url else 'c')

    out()
    out('  题库：%s 题 / %s 分类 · 版本 %s' % (qn, cats, ver))
    out()
    if listener is not None:
        out(c('d', '  公网隧道已开启，App 可远程拉取最新题库。'))
    elif lan_url:
        out(c('d', '  手机可用局域网地址访问；如需公网，按上方指引配置 authtoken。'))
    out()
    out(c('w', '  更新题库：直接改 db/*.json，无需重启（serve.py 按文件 mtime 自动重载）'))
    out(c('w', '  按 Ctrl+C 或关闭窗口即可停止。'))
    out()

    # ---- 常驻：保持隧道 + serve 存活 ----
    try:
        while True:
            time.sleep(1)
            if proc is not None and proc.poll() is not None:
                out(c('r', '\n  ✗ serve.py 已退出（码 %s），正在停止隧道 …' % proc.returncode))
                break
    except KeyboardInterrupt:
        out(c('y', '\n  收到停止信号 …'))
    finally:
        try:
            if listener is not None:
                import ngrok
                ngrok.disconnect(listener.url())
                out(c('g', '  ✓ 隧道已关闭'))
        except Exception:  # noqa: BLE001
            pass
        if proc is not None:
            try:
                proc.terminate()
                proc.wait(timeout=4)
            except Exception:  # noqa: BLE001
                try:
                    proc.kill()
                except Exception:  # noqa: BLE001
                    pass
            out(c('g', '  ✓ serve.py 已停止'))
        try:
            if os.path.isfile(TUNNEL_FILE):
                os.remove(TUNNEL_FILE)
        except OSError:
            pass
    return 0


if __name__ == '__main__':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:  # noqa: BLE001
        pass
    _COLOR_OK = enable_vt()   # 探测控制台是否支持 ANSI，不支持则全程纯文本
    raise SystemExit(main())
