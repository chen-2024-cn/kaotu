#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""静态题库导出 —— 让「纯静态托管」也能当题库服务器
========================================================
生成：
    deploy/api/version.json   ← 等价 /api/version（轻量指纹）
    deploy/api/bank.json      ← 等价 /api/bank（全量题库）

用法：
    python tools/export_static.py            # 导出到 deploy/api/
    python tools/export_static.py D:/out     # 导出到自定义目录

部署（任选其一，全部免费）：
  A. GitHub Pages：把 deploy/ 目录推到仓库，开启 Pages
     → App 内 API 地址填 https://<用户>.github.io/<仓库>
  B. 腾讯云 COS / 阿里云 OSS 静态网站：上传 deploy/api/ 两个文件，
     开启静态网站 + CORS（允许所有来源 GET）
     → App 内 API 地址填存储桶的公网域名
  C. Vercel / Netlify / Cloudflare Pages：拖入 deploy/ 目录即可

客户端约定：sync.js 先请求 {base}/api/version，
404/403 时自动退回 {base}/api/version.json（本导出的产物）。
每次改完 db/*.json，重跑本脚本 + 重新上传即可热更新所有终端。
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:  # noqa: BLE001
    pass

import db  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith('-') else os.path.join(ROOT, 'deploy', 'api')


def main():
    if not db.exists():
        print('✗ db/*.json 为空，无法导出')
        return 1
    conn = db.connect()
    try:
        version = db.bank_version(conn)
        st = db.stats(conn)
        bank = {
            'version': version,
            'tracks': db.all_tracks(conn),
            'categories': db.all_categories(conn),
            'questions': db.all_questions(conn),
        }
        ver = {
            'version': version,
            'questions': st['questions'],
            'categories': st['categories'],
        }
    finally:
        conn.close()

    os.makedirs(OUT, exist_ok=True)
    # 静态托管必须禁用缓存语义 → 靠 Cache-Control 元数据；多数平台默认即可，
    # 客户端请求带 _t= 时间戳参数已可绕过 CDN 缓存（见 sync.js）
    for name, obj in (('version.json', ver), ('bank.json', bank)):
        p = os.path.join(OUT, name)
        with open(p, 'w', encoding='utf-8') as f:
            json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))
        print('  ✓ %-14s %6.1f KB' % (name, os.path.getsize(p) / 1024))

    print('-' * 56)
    print('导出完成：%s' % OUT)
    print('版本 %s · %d 分类 · %d 题' % (version, st['categories'], st['questions']))
    print('把 deploy/ 上传到任意静态托管，App「我的」下载卡地址栏填站点根地址即可。')
    return 0


if __name__ == '__main__':
    sys.exit(main())
