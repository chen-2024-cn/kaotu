#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
构建器 v2 —— db/*.json 是唯一数据源
====================================
读取 db/ 下所有 JSON 题库，校验后生成浏览器可直接加载的：
    data/index.js        元数据（赛道 tracks + 分类 categories + 题量统计）
    data/q_<id>.js       各分类题目（id 中的 - 换成 _ 以匹配 <script src>）

JSON 数据格式（一个文件 = 一个分类）：
{
  "track": "job",                 # job 求职面试 / math 考研数学 / english 考研英语
  "id": "mysql",                  # 分类 id，全局唯一
  "name": "MySQL", "badge": "My", "color": "#2E7D6B", "desc": "索引 / 事务 / MVCC",
  "questions": [
    { "id": "mysql-001", "q": "…？", "a": "Markdown 答案，支持 $行内公式$ 与 $$块级公式$$",
      "d": 3, "f": "high", "t": ["索引"], "r": ["mysql-002"] }
  ]
}

用法：
    python tools/build.py           # 构建 + 校验
    python tools/build.py --strict  # 有 error 时非 0 退出（CI 用）
改完题后的完整发布： python tools/release.py
"""

import json
import os
import re
import sys
import time

# Windows 控制台/重定向默认可能是 GBK，打印 ✓ ✗ · 等符号会抛 UnicodeEncodeError，
# 导致退出码非 0（release 流水线会误判失败）。统一切换到 UTF-8。
for _stream in (sys.stdout, sys.stderr):
    try:
        if _stream is not None and hasattr(_stream, 'reconfigure'):
            _stream.reconfigure(encoding='utf-8')
    except Exception:
        pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_DIR = os.path.join(ROOT, 'db')
DATA_DIR = os.path.join(ROOT, 'data')

# ---------------------------------------------------------------------------
# 赛道定义（唯一真源）：决定首页分组、统计与筛选
# ---------------------------------------------------------------------------
TRACKS = [
    {'id': 'job',     'name': '求职面试', 'short': '面试', 'icon': 'code',
     'color': '#2F6F5E', 'desc': 'Java 后端八股 · 13 大技术体系'},
    {'id': 'math',    'name': '考研数学', 'short': '数学', 'icon': 'sigma',
     'color': '#B0413E', 'desc': '高数 / 线性代数 / 概率统计'},
    {'id': 'english', 'name': '考研英语',   'short': '考研', 'icon': 'book',
     'color': '#C4622D', 'desc': '核心词汇 / 常用短语 / 作文模板 / 阅读长难句'},
    {'id': 'cet6',    'name': 'CET-6',    'short': '六级', 'icon': 'award',
     'color': '#2F5FA8', 'desc': '高频词汇 / 听力技巧 / 阅读技巧 / 写作翻译'},
    {'id': 'cet4',    'name': 'CET-4',    'short': '四级', 'icon': 'medal',
     'color': '#7A5AA8', 'desc': '高频词汇 / 听力技巧 / 阅读技巧 / 写作翻译'},
]
TRACK_IDS = [t['id'] for t in TRACKS]

# 同赛道内分类排序（未登记的新分类排在该赛道最后）
CAT_ORDER = [
    'java', 'jvm', 'concurrent', 'mysql', 'redis', 'spring', 'springboot',
    'mybatis', 'mq', 'distributed', 'network', 'os', 'scene',
    'math-calc', 'math-linalg', 'math-prob',
    'eng-vocab', 'eng-phrase', 'eng-compose', 'eng-read',
    'cet6-vocab', 'cet6-listen', 'cet6-read', 'cet6-write',
    'cet4-vocab', 'cet4-listen', 'cet4-read', 'cet4-write',
]

FREQ = {'high': '高频', 'mid': '中频', 'low': '低频'}
FREQ_ALIAS = {'高频': 'high', '中频': 'mid', '低频': 'low', 'hot': 'high', 'rare': 'low'}
ID_RE = re.compile(r'^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$')
CAT_ID_RE = re.compile(r'^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$')


def js_filename(cat_id):
    """分类 id → data 文件名（连字符换下划线，避免与 URL 语义混淆）"""
    return 'q_%s.js' % cat_id.replace('-', '_')


class Report:
    def __init__(self):
        self.errors = []
        self.warnings = []

    def err(self, m):
        self.errors.append(m)

    def warn(self, m):
        self.warnings.append(m)


def norm_freq(f):
    return FREQ_ALIAS.get(str(f or 'mid').strip().lower(), str(f or 'mid').strip().lower())


def norm_list(v, limit=8):
    if not v:
        return []
    if isinstance(v, (list, tuple)):
        return [str(x).strip() for x in v if str(x).strip()][:limit]
    return [x.strip() for x in re.split(r'[,，;；/]', str(v)) if x.strip()][:limit]


# ---------------------------------------------------------------------------
# 解析与校验
# ---------------------------------------------------------------------------
def parse_db_file(path, rep):
    fn = os.path.basename(path)
    try:
        with open(path, 'r', encoding='utf-8-sig') as f:
            doc = json.load(f)
    except Exception as e:
        rep.err('%s：JSON 解析失败 → %s' % (fn, e))
        return None, []
    if not isinstance(doc, dict):
        rep.err('%s：顶层必须是对象' % fn)
        return None, []

    cid = str(doc.get('id') or os.path.splitext(fn)[0]).strip().lower()
    if not CAT_ID_RE.match(cid):
        rep.err('%s：非法分类 id "%s"' % (fn, cid))
        return None, []
    track = str(doc.get('track') or '').strip().lower()
    if track not in TRACK_IDS:
        rep.err('%s：track "%s" 不合法（允许 %s）' % (fn, track, '/'.join(TRACK_IDS)))
        return None, []

    cat = {
        'id': cid,
        'name': str(doc.get('name') or cid).strip(),
        'badge': str(doc.get('badge') or (doc.get('name') or cid)[:2]).strip(),
        'color': str(doc.get('color') or '#2F6F5E').strip(),
        'desc': str(doc.get('desc') or '').strip(),
        'track': track,
    }

    questions = doc.get('questions')
    if not isinstance(questions, list):
        rep.err('%s：questions 必须是数组' % fn)
        return cat, []
    if not questions:
        rep.warn('%s：questions 为空' % fn)

    items = []
    for idx, it in enumerate(questions, 1):
        ctx = '%s 第%d题' % (fn, idx)
        if not isinstance(it, dict):
            rep.err('%s：不是对象' % ctx)
            continue
        qid = str(it.get('id') or '').strip().lower()
        q = str(it.get('q') or it.get('question') or '').strip()
        a = it.get('a', it.get('answer', ''))
        if not isinstance(a, str):
            a = json.dumps(a, ensure_ascii=False)
        a = a.strip()

        if not qid:
            rep.err('%s：缺少 id' % ctx)
            continue
        if not ID_RE.match(qid):
            rep.err('%s：非法 id "%s"（要求形如 mysql-001）' % (ctx, qid))
            continue
        if len(q) < 4:
            rep.err('%s(%s)：题干过短' % (ctx, qid))
            continue
        if not q.endswith('？') and not q.endswith('?'):
            q = q.rstrip('。.') + '？'
        if len(a) < 40:
            rep.err('%s(%s)：答案过短（%d 字符），至少要有结论与理由' % (ctx, qid, len(a)))
            continue

        d = it.get('d', it.get('difficulty', 3))
        try:
            d = int(d)
        except (TypeError, ValueError):
            rep.err('%s(%s)：难度 d 非法 "%s"' % (ctx, qid, d))
            d = 3
        if d not in (1, 2, 3, 4, 5):
            rep.err('%s(%s)：难度越界(%d)，限定 1-5' % (ctx, qid, d))
            d = 3

        f = norm_freq(it.get('f', it.get('frequency')))
        if f not in FREQ:
            rep.err('%s(%s)：频率 f 非法 "%s"（仅 high/mid/low）' % (ctx, qid, f))
            f = 'mid'

        tags = norm_list(it.get('t', it.get('tags')), 8)
        if not tags:
            rep.warn('%s(%s)：无标签 t，会影响搜索与标签地图' % (ctx, qid))
        rel = norm_list(it.get('r', it.get('related')), 8)

        check_math(a, qid, ctx, rep, track)
        items.append({'id': qid, 'q': q, 'a': a, 'd': d, 'f': f, 't': tags, 'r': rel})
    return cat, items


def check_math(answer, qid, ctx, rep, track):
    """公式写法静态检查：仅对 math 赛道生效（Java 题里的 $ 多为汇编/脚本占位，
    不应当作公式）。统计前先剔除围栏代码块与行内代码，避免 `...$...` 干扰。"""
    if track != 'math':
        return
    # 去除 ```围栏``` 与 `行内代码`
    body = re.sub(r'```[\s\S]*?```', '', answer)
    body = re.sub(r'`[^`]*`', '', body)
    dd = len(re.findall(r'\$\$', body))
    if dd % 2 != 0:
        rep.err('%s(%s)：$$ 块级公式未闭合（%d 次，应为偶数）' % (ctx, qid, dd))
    stripped = re.sub(r'\$\$[\s\S]*?\$\$', '', body)
    singles = stripped.count('$')
    if singles % 2 != 0:
        rep.err('%s(%s)：$ 行内公式数量为奇数（%d），存在未闭合' % (ctx, qid, singles))


# ---------------------------------------------------------------------------
# JSON 题包导入（兼容旧导入格式，供 App 内导入与批量维护）
# ---------------------------------------------------------------------------
def load_json_packs(rep):
    imp = os.path.join(ROOT, 'db', 'import')
    out = {}
    if not os.path.isdir(imp):
        return out
    for fn in sorted(f for f in os.listdir(imp) if f.lower().endswith('.json')):
        path = os.path.join(imp, fn)
        try:
            with open(path, 'r', encoding='utf-8-sig') as f:
                doc = json.load(f)
        except Exception as e:
            rep.err('import/%s：JSON 解析失败 → %s' % (fn, e))
            continue
        items = doc.get('questions') if isinstance(doc, dict) else doc
        if not isinstance(items, list):
            rep.err('import/%s：需为数组或含 questions 数组的对象' % fn)
            continue
        for it in items:
            if not isinstance(it, dict):
                continue
            qid = str(it.get('id') or '').strip().lower()
            cid = str(it.get('category') or it.get('cat') or qid.split('-')[0]).strip().lower()
            q = str(it.get('q') or it.get('question') or '').strip()
            a = it.get('a', it.get('answer', ''))
            if not isinstance(a, str):
                a = json.dumps(a, ensure_ascii=False)
            if not qid or len(q) < 4 or len(a.strip()) < 40:
                rep.warn('import/%s：跳过不合格条目 %s' % (fn, qid or '(无 id)'))
                continue
            try:
                d = int(it.get('d', it.get('difficulty', 3)))
            except (TypeError, ValueError):
                d = 3
            out.setdefault(cid, []).append({
                'id': qid, 'q': q, 'a': a.strip(),
                'd': d if d in (1, 2, 3, 4, 5) else 3,
                'f': norm_freq(it.get('f', it.get('frequency'))) if norm_freq(it.get('f', it.get('frequency'))) in FREQ else 'mid',
                't': norm_list(it.get('t', it.get('tags')), 8),
                'r': norm_list(it.get('r', it.get('related')), 8),
            })
        print('  · 导入 db/import/%s：%d 条' % (fn, len(items)))
    return out


# ---------------------------------------------------------------------------
# 输出
# ---------------------------------------------------------------------------
def dump_js(cat_id, items, path):
    payload = json.dumps(items, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
    src = ('/* 该文件由 tools/build.py 自动生成，请勿手工编辑。\n'
           '   数据源：db/%s.json —— 改数据后运行 python tools/build.py */\n'
           'window.QB.add(%s, %s);\n' % (cat_id, json.dumps(cat_id), payload))
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(src)
    return len(src)


def dump_index(tracks, cats, stats, path):
    obj = {'version': 2, 'builtAt': time.strftime('%Y-%m-%d %H:%M:%S'),
           'tracks': tracks, 'categories': cats, 'stats': stats}
    payload = json.dumps(obj, ensure_ascii=False, indent=1).replace('</', '<\\/')
    src = ('/* 该文件由 tools/build.py 自动生成，请勿手工编辑。\n'
           '   赛道与排序在 build.py 的 TRACKS / CAT_ORDER 中修改。 */\n'
           'window.QB.meta = %s;\n' % payload)
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(src)


def cat_js_list(cats):
    """生成 index.html 需要的 <script src> 清单文本"""
    return ['data/' + js_filename(c['id']) for c in cats]


def sync_index_html(cats, rep):
    """自动同步 index.html 里的 data/*.js <script> 标签，避免漏加载导致 404/空题"""
    path = os.path.join(ROOT, 'index.html')
    if not os.path.isfile(path):
        rep.warn('未找到 index.html，跳过 <script> 标签自动同步')
        return False
    with open(path, 'r', encoding='utf-8') as f:
        html = f.read()
    want = ['<script src="data/index.js"></script>'] + \
           ['<script src="data/%s"></script>' % js_filename(c['id']) for c in cats]
    block = '\n'.join(want)
    m = re.search(r'(<script src="data/index\.js"></script>)(?:\s*\n\s*<script src="data/q_[^"]+"></script>)*', html)
    if not m:
        rep.warn('index.html 中未找到 data/index.js 脚本块，无法自动同步')
        return False
    new_html = html[:m.start()] + block + html[m.end():]
    if new_html == html:
        return False
    with open(path, 'w', encoding='utf-8', newline='') as f:
        f.write(new_html)
    print('  · 已自动同步 index.html 的题库 <script> 引用')
    return True


def main():
    strict = '--strict' in sys.argv
    if not os.path.isdir(DB_DIR):
        print('缺少 db 目录：%s' % DB_DIR)
        return 2
    os.makedirs(DATA_DIR, exist_ok=True)
    rep = Report()

    files = sorted(f for f in os.listdir(DB_DIR)
                   if f.lower().endswith('.json') and os.path.isfile(os.path.join(DB_DIR, f)))
    if not files:
        print('db/ 下没有任何 .json 题库文件')
        return 2

    cats, bank = [], {}
    for fn in files:
        cat, items = parse_db_file(os.path.join(DB_DIR, fn), rep)
        if cat is None:
            continue
        if any(c['id'] == cat['id'] for c in cats):
            rep.err('%s：分类 id "%s" 重复定义' % (fn, cat['id']))
            continue
        cats.append(cat)
        bank[cat['id']] = items

    # 合入 db/import/*.json（同 id 冲突时报错，保留先出现的）
    imported = load_json_packs(rep)
    for cid, items in imported.items():
        target = next((c for c in cats if c['id'] == cid), None)
        if target is None:
            track = 'math' if cid.startswith('math') else 'english' if cid.startswith('eng') else 'job'
            target = {'id': cid, 'name': cid, 'badge': cid[:2], 'color': '#8A6D3B',
                      'desc': '导入分类', 'track': track}
            cats.append(target)
            bank[cid] = []
            rep.warn('import：分类 "%s" 未在 db/ 中定义，已自动创建（建议改为正式 db/%s.json）' % (cid, cid))
        for it in items:
            if any(x['id'] == it['id'] for x in bank[cid]):
                rep.err('import：题目 id 重复 %s' % it['id'])
                continue
            bank[cid].append(it)

    def sort_key(c):
        i = CAT_ORDER.index(c['id']) if c['id'] in CAT_ORDER else 999
        return (TRACK_IDS.index(c['track']) if c['track'] in TRACK_IDS else 99, i, c['id'])
    cats.sort(key=sort_key)

    all_ids, dup = set(), []
    for cid, items in bank.items():
        for it in items:
            if it['id'] in all_ids:
                dup.append(it['id'])
            all_ids.add(it['id'])
    for d in sorted(set(dup)):
        rep.err('题目 id 重复：%s' % d)
    for cid, items in bank.items():
        for it in items:
            keep = []
            for r in it['r']:
                if r == it['id']:
                    continue
                if r in all_ids:
                    keep.append(r)
                else:
                    rep.warn('%s：关联题 "%s" 不存在，已忽略' % (it['id'], r))
            it['r'] = keep

    # 清理 db/ 中已删除分类遗留的 data 文件（避免 index.html 引用到过期数据）
    existing = set(js_filename(c['id']) for c in cats)
    for f in os.listdir(DATA_DIR):
        if f.startswith('q_') and f.endswith('.js') and f not in existing:
            try:
                os.remove(os.path.join(DATA_DIR, f))
                print('  · 清理过期数据文件 %s' % f)
            except OSError:
                pass

    total, sizes, stats = 0, {}, {}
    for c in cats:
        cid = c['id']
        items = bank.get(cid, [])
        p = os.path.join(DATA_DIR, js_filename(cid))
        sizes[cid] = dump_js(cid, items, p)
        stats[cid] = len(items)
        total += len(items)
    dump_index(TRACKS, cats, stats, os.path.join(DATA_DIR, 'index.js'))
    sync_index_html(cats, rep)

    print('=' * 70)
    print('构建完成 —— db/*.json → data/*.js')
    print('=' * 70)
    cur = None
    for c in cats:
        if c['track'] != cur:
            cur = c['track']
            t = next((x for x in TRACKS if x['id'] == cur), None)
            print('\n【%s】%s' % (t['name'] if t else cur, (t['desc'] if t else '')))
        print('  %-14s %-12s %4d 题 %8.1fKB' % (c['id'], c['name'], stats[c['id']], sizes[c['id']] / 1024.0))
    print('\n' + '-' * 70)
    by_track = {}
    for c in cats:
        by_track[c['track']] = by_track.get(c['track'], 0) + stats[c['id']]
    parts = ['%s %d 题' % (next(t['name'] for t in TRACKS if t['id'] == k), v) for k, v in by_track.items()]
    print('合计：%d 分类 · %d 题（%s）· %.1f KB'
          % (len(cats), total, '，'.join(parts), sum(sizes.values()) / 1024.0))

    if rep.warnings:
        print('\n警告 %d 条：' % len(rep.warnings))
        for w in rep.warnings[:30]:
            print('  · ' + w)
        if len(rep.warnings) > 30:
            print('  …其余 %d 条省略' % (len(rep.warnings) - 30))
    if rep.errors:
        print('\n错误 %d 条：' % len(rep.errors))
        for e in rep.errors[:40]:
            print('  ✗ ' + e)
        return 1 if strict else 0
    print('\n✓ 校验通过，无错误')
    return 0


if __name__ == '__main__':
    sys.exit(main())
