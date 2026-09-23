#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""考途 服务器（静态资源 + 题库 API，纯标准库）
================================================
配合 ngrok 等隧道即可公网访问；App 通过 API 自动同步最新题库。

API：
    GET /api/version   → {"version":"...", "questions":125, ...}  轻量检查更新
    GET /api/bank      → 全量题库 JSON（categories + questions）
    GET /api/stats     → 分类统计（调试）；GET /api/health → 健康检查

用法：
    python tools/serve.py            # 默认 8080，自动开浏览器
    python tools/serve.py 9000
    python tools/serve.py 8080 --no-open   # 服务器/后台部署不弹浏览器

更新题库（零步骤）：
    直接编辑 db/*.json（JSON 即数据库），改完什么都不用做：
    本服务按文件 mtime 自动重载，App 打开或点「立即检查更新」即生效。
"""
import http.server
import json
import os
import socket
import socketserver
import sys
import threading
import webbrowser

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import db  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1].isdigit() else 8080
NO_OPEN = '--no-open' in sys.argv


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    # ---------------- API：服务端改了数据库，App 就能拿到新题库 ----------------
    def do_GET(self):
        path = self.path.split('?', 1)[0].rstrip('/')
        if path in ('/api/version', '/api/bank', '/api/stats', '/api/health'):
            return self.handle_api(path)
        return super().do_GET()

    def handle_api(self, path):
        try:
            if not db.exists():
                if path == '/api/health':
                    return self.send_json({'ok': True, 'db': False,
                                           'hint': 'db/*.json 为空或缺失'})
                return self.send_json({'error': 'db-empty',
                                       'hint': '题库为空：请检查 db/ 目录下的 JSON 文件'},
                                      status=503)
            conn = db.connect()
            try:
                if path == '/api/version':
                    st = db.stats(conn)
                    body = {'version': db.bank_version(conn), 'questions': st['questions'],
                            'categories': st['categories'],
                            'lastSyncAt': db.get_meta(conn, 'lastSyncAt') or ''}
                elif path == '/api/bank':
                    body = {'version': db.bank_version(conn),
                            'tracks': db.all_tracks(conn),
                            'categories': db.all_categories(conn),
                            'questions': db.all_questions(conn),
                            'lastSyncAt': db.get_meta(conn, 'lastSyncAt') or ''}
                elif path == '/api/stats':
                    st = db.stats(conn)
                    body = {'version': db.bank_version(conn), **st}
                else:  # /api/health
                    body = {'ok': True, 'db': True, 'version': db.bank_version(conn)}
            finally:
                conn.close()
        except Exception as e:  # noqa: BLE001 —— API 永不裸奔 500，统一 JSON 错误
            return self.send_json({'error': 'server-error', 'message': str(e)}, status=500)
        return self.send_json(body)

    def send_json(self, obj, status=200):
        data = json.dumps(obj, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        # API 不缓存；允许任意源调用（App 可能从 file:// 或其它域访问）
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        try:
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.js': 'application/javascript; charset=utf-8',
        '.mjs': 'application/javascript; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.webmanifest': 'application/manifest+json; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.html': 'text/html; charset=utf-8',
        '.md': 'text/markdown; charset=utf-8',
        '.svg': 'image/svg+xml',
        '.woff2': 'font/woff2',
    }

    def end_headers(self):
        p = self.path.split('?', 1)[0]
        # 开发服务器全部禁缓存（避免改 JS/CSS 不生效）；正式部署可收紧
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        self.send_header('X-Content-Type-Options', 'nosniff')
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write('  · ' + (fmt % args) + '\n')


def lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 80))
        return s.getsockname()[0]
    except OSError:
        return None
    finally:
        s.close()


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def db_info():
    if not db.exists():
        return None
    try:
        conn = db.connect()
        st = db.stats(conn)
        v = db.bank_version(conn)
        conn.close()
        return (st['questions'], v)
    except Exception:  # noqa: BLE001
        return None


def main():
    ip = lan_ip()
    info = db_info()
    print('=' * 64)
    print('  考途 服务器（静态 + 题库 API）')
    print('=' * 64)
    print('  项目目录：%s' % ROOT)
    if info:
        print('  题库数据库：db/*.json（%d 题 · 版本 %s）' % info)
    else:
        print('  ⚠ 题库为空：API 将返回 db-empty，App 会用内置题库兜底')
        print('  → 请检查 db/ 目录下的 JSON 文件')
    print('-' * 64)
    print('  本机访问：http://localhost:%d' % PORT)
    if ip:
        print('  局域网：  http://%s:%d   (手机同 Wi-Fi 可访问)' % (ip, PORT))
    print('  API：     /api/version  /api/bank  /api/stats  /api/health')
    print('-' * 64)
    print('  更新题库（零步骤，无需重启）：')
    print('    直接编辑 db/*.json（JSON 即数据库，格式见 README）')
    print('    App 打开或点「立即检查更新」即可生效；')
    print('    如要同步更新 APK/单文件版：python tools/release.py')
    print('=' * 64)
    print('  Ctrl+C 停止')

    try:
        httpd = Server(('0.0.0.0', PORT), Handler)
    except OSError as e:
        print('端口 %d 被占用：%s' % (PORT, e))
        print('换一个端口重试，例如：python tools/serve.py 9000')
        return 1

    if not NO_OPEN:
        threading.Timer(0.8, lambda: webbrowser.open('http://localhost:%d' % PORT)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print('\n已停止。')
        httpd.shutdown()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
