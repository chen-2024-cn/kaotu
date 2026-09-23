#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
题库数据层 —— db/*.json 就是数据库（零第三方依赖）
===================================================
设计：JSON 文件即数据库。修改 db/*.json 后**无需任何同步步骤**，
serve.py 的 API 按文件 mtime 指纹自动重载，App 打开即拿到新题库。

对 serve.py 的接口保持兼容（exists/connect/all_categories/...）：
    exists() / connect() / all_categories() / all_questions()
    bank_version() / stats() / get_meta() / set_meta(no-op)
"""

import hashlib
import json
import os
import re
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_DIR = os.path.join(ROOT, 'db')
# 采集题库库（tools/fetch_datasets.py 产物，qpack-*.json）：
# 不内置到 APK（体积/版权），但服务器 /api/bank 一并下发 →
# 手机「一键下载在线题库」即可拿到 内置 + 采集 的全量内容
PACK_DIR = os.path.join(ROOT, 'json数据')

# 赛道元数据（与 tools/build.py 的 TRACKS 保持一致）：
# 随 /api/bank 下发，老客户端也能通过热更新拿到新赛道
TRACKS = [
    {'id': 'job',     'name': '求职面试', 'short': '面试', 'icon': 'code',
     'color': '#2F6F5E', 'desc': 'Java 后端八股 · 13 大技术体系'},
    {'id': 'math',    'name': '考研数学', 'short': '数学', 'icon': 'sigma',
     'color': '#B0413E', 'desc': '高数 / 线性代数 / 概率统计'},
    {'id': 'english', 'name': '考研英语', 'short': '考研', 'icon': 'book',
     'color': '#C4622D', 'desc': '核心词汇 / 常用短语 / 作文模板 / 阅读长难句'},
    {'id': 'cet6',    'name': 'CET-6', 'short': '六级', 'icon': 'award',
     'color': '#2F5FA8', 'desc': '高频词汇 / 听力技巧 / 阅读技巧 / 写作翻译'},
    {'id': 'cet4',    'name': 'CET-4', 'short': '四级', 'icon': 'medal',
     'color': '#7A5AA8', 'desc': '高频词汇 / 听力技巧 / 阅读技巧 / 写作翻译'},
]
TRACK_ORDER = [t['id'] for t in TRACKS]


def all_tracks(conn=None):
    return TRACKS

# 与 tools/build.py 的 CAT_ORDER 保持一致（API 顺序 == 前端内置顺序）
CAT_ORDER = [
    'java', 'jvm', 'concurrent', 'mysql', 'redis', 'spring', 'springboot',
    'mybatis', 'mq', 'distributed', 'network', 'os', 'scene',
    'math-calc', 'math-linalg', 'math-prob',
    'eng-vocab', 'eng-phrase', 'eng-compose', 'eng-read',
    'cet6-vocab', 'cet6-listen', 'cet6-read', 'cet6-write',
    'cet4-vocab', 'cet4-listen', 'cet4-read', 'cet4-write',
]

FREQ_SET = ('high', 'mid', 'low')
FREQ_ALIAS = {'高频': 'high', '中频': 'mid', '低频': 'low', 'hot': 'high', 'rare': 'low'}

_cache = {'key': None, 'cats': None, 'questions': None, 'version': None}


def _norm_d(v, default=3):
    try:
        d = int(v)
    except (TypeError, ValueError):
        return default
    return d if d in (1, 2, 3, 4, 5) else default


def _iter_files(d, pred):
    if not os.path.isdir(d):
        return
    for fn in sorted(os.listdir(d)):
        if fn.lower().endswith('.json') and pred(fn):
            yield fn, os.path.join(d, fn)


def _fingerprint():
    parts = []
    for fn, p in _iter_files(DB_DIR, lambda n: True):
        try:
            st = os.stat(p)
            parts.append('%s:%d:%d' % (fn, st.st_size, int(st.st_mtime)))
        except OSError:
            continue
    # 采集 qpack 也参与指纹：新增/更新词书后自动重载，App 版本号会变化触发下载
    for fn, p in _iter_files(PACK_DIR, lambda n: n.startswith('qpack-')):
        try:
            st = os.stat(p)
            parts.append('pack/%s:%d:%d' % (fn, st.st_size, int(st.st_mtime)))
        except OSError:
            continue
    return '|'.join(parts)


def _norm_freq(f):
    f = str(f or 'mid').strip().lower()
    f = FREQ_ALIAS.get(f, f)
    return f if f in FREQ_SET else 'mid'


def _norm_list(v, limit=8):
    if not v:
        return []
    if isinstance(v, (list, tuple)):
        return [str(x).strip() for x in v if str(x).strip()][:limit]
    return [x.strip() for x in re.split(r'[,，;；/]', str(v)) if x.strip()][:limit]


def _load():
    """按 mtime 指纹加载全部 JSON；无变化命中缓存"""
    fp = _fingerprint()
    if _cache['key'] == fp and _cache['cats'] is not None:
        return _cache['cats'], _cache['questions'], _cache['version']

    cats, questions = [], []
    if os.path.isdir(DB_DIR):
        for fn in sorted(os.listdir(DB_DIR)):
            if not fn.lower().endswith('.json'):
                continue
            try:
                with open(os.path.join(DB_DIR, fn), 'r', encoding='utf-8-sig') as f:
                    doc = json.load(f)
            except (ValueError, OSError):
                continue   # 坏文件跳过，绝不让 API 崩
            if not isinstance(doc, dict):
                continue
            cid = str(doc.get('id') or os.path.splitext(fn)[0]).strip().lower()
            track = str(doc.get('track') or 'job').strip().lower()
            cats.append({
                'id': cid,
                'name': str(doc.get('name') or cid),
                'badge': str(doc.get('badge') or (doc.get('name') or cid)[:2]),
                'color': str(doc.get('color') or '#8A6D3B'),
                'desc': str(doc.get('desc') or ''),
                'track': track if track in TRACK_ORDER else 'job',
            })
            for it in (doc.get('questions') or []):
                if not isinstance(it, dict):
                    continue
                qid = str(it.get('id') or '').strip().lower()
                q = str(it.get('q') or it.get('question') or '').strip()
                a = it.get('a', it.get('answer', ''))
                if not isinstance(a, str):
                    a = json.dumps(a, ensure_ascii=False)
                if not qid or len(q) < 4 or len(a.strip()) < 40:
                    continue
                questions.append({
                    'id': qid,
                    'category': str(it.get('category') or cid),
                    'q': q, 'a': a.strip(),
                    'd': _norm_d(it.get('d', it.get('difficulty', 3))),
                    'f': _norm_freq(it.get('f', it.get('frequency'))),
                    't': _norm_list(it.get('t', it.get('tags'))),
                    'r': _norm_list(it.get('r', it.get('related'))),
                })

    # ---- 2) 采集题库 json数据/qpack-*.json（tools/fetch_datasets.py 产物）----
    # 合并而非替换：坏文件静默跳过；ID 冲突时内置 db/ 优先（采集包 ID 用 imp-* 前缀本不会撞）
    seen_ids = set(q['id'] for q in questions)
    seen_cats = set(c['id'] for c in cats)
    for fn, path in _iter_files(PACK_DIR, lambda n: n.startswith('qpack-')):
        try:
            with open(path, 'r', encoding='utf-8-sig') as f:
                doc = json.load(f)
        except (ValueError, OSError):
            continue
        if not isinstance(doc, dict):
            continue
        items = doc.get('questions') or []
        if not isinstance(items, list) or not items:
            continue
        meta = doc.get('category') or {}
        sample = next((x for x in items if isinstance(x, dict)), {})
        cid = str(meta.get('id') or sample.get('category') or '').strip().lower()
        if not cid:
            continue
        name = str(meta.get('name') or sample.get('categoryName') or cid)
        track = str(doc.get('track') or sample.get('_track') or 'job').strip().lower()
        if track not in TRACK_ORDER:
            track = 'job'
        if cid not in seen_cats:
            cats.append({
                'id': cid, 'name': name, 'badge': name[:2],
                'color': '#8A6D3B', 'desc': '在线扩充题库 · ' + ('词卡' if cid.endswith('-word') else '真题'),
                'track': track,
            })
            seen_cats.add(cid)
        n_pack = 0
        for it in items:
            if not isinstance(it, dict):
                continue
            qid = str(it.get('id') or '').strip().lower()
            q = str(it.get('q') or it.get('question') or '').strip()
            a = it.get('a', it.get('answer', ''))
            if not isinstance(a, str):
                continue
            if not qid or qid in seen_ids or len(q) < 2 or len(a.strip()) < 4:
                continue
            seen_ids.add(qid)
            questions.append({
                'id': qid,
                'category': cid,
                'q': q, 'a': a.strip(),
                'd': _norm_d(it.get('d', it.get('difficulty')), 2),
                'f': _norm_freq(it.get('f', it.get('frequency'))),
                't': _norm_list(it.get('t', it.get('tags'))),
                'r': _norm_list(it.get('r', it.get('related'))),
            })
            n_pack += 1
        if not n_pack:
            # 整包都无效时不留空分类（前端分类卡会显示 0 题很突兀）
            cats = [c for c in cats if c['id'] != cid]
            seen_cats.discard(cid)

    def cat_key(c):
        ti = TRACK_ORDER.index(c['track']) if c['track'] in TRACK_ORDER else 99
        oi = CAT_ORDER.index(c['id']) if c['id'] in CAT_ORDER else 999
        return (ti, oi, c['id'])
    cats.sort(key=cat_key)

    h = hashlib.sha1()
    h.update(('%d;' % len(questions)).encode())
    for q in questions:
        h.update('|'.join([q['id'], q['category'], q['q'], q['a'], str(q['d']), q['f'],
                           ','.join(q['t']), ','.join(q['r'])]).encode('utf-8'))
        h.update(b'\x00')
    version = h.hexdigest()[:12]

    _cache.update(key=fp, cats=cats, questions=questions, version=version)
    return cats, questions, version


# ---------------------------------------------------------------------------
# serve.py 兼容接口
# ---------------------------------------------------------------------------
class _Handle(object):
    """兼容旧调用方的假连接句柄：JSON 数据层无需真连接，
    close() 为 no-op，serve.py 里的 conn.close() 不会报错。"""

    def close(self):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def connect(db_path=None, timeout=10.0):
    return _Handle()


def exists(db_path=None):
    _, questions, _ = _load()
    return len(questions) > 0


def all_categories(conn=None):
    cats, _, _ = _load()
    return cats


def all_questions(conn=None):
    _, questions, _ = _load()
    return questions


def bank_version(conn=None):
    _, _, version = _load()
    return version


def stats(conn=None):
    cats, questions, _ = _load()
    by_cat = {}
    for q in questions:
        by_cat[q['category']] = by_cat.get(q['category'], 0) + 1
    return {'questions': len(questions), 'categories': len(cats), 'byCat': by_cat}


def get_meta(conn=None, k=None, default=None):
    if k == 'bankVersion':
        return bank_version(conn)
    if k == 'lastSyncAt':
        latest = 0
        if os.path.isdir(DB_DIR):
            for fn in os.listdir(DB_DIR):
                if fn.lower().endswith('.json'):
                    try:
                        latest = max(latest, os.path.getmtime(os.path.join(DB_DIR, fn)))
                    except OSError:
                        pass
        if latest:
            return time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(latest))
    return default


def set_meta(conn=None, k=None, v=None):
    pass   # JSON 即数据库，无元数据表
