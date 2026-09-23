#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""全网题库采集器 —— 拉取公开 JSON 数据 → json数据/ 文件夹（供手机端导入）
================================================================================
数据源（开源可商用 redistribution 的词书数据）：
  kajweb/dict (GitHub)  —— 背单词类 App 离线词书包（CET4/CET6/考研等），
                           zip 内为 JSON Lines，每行一个词条，含音标/释义/
                           真题例句/短语/同近义词/记忆法/选择题。

产出（全部落在 json数据/ 下）：
  raw/<词书>.jsonl        原始数据备份（zip 解压后的 JSONL）
  qpack-<分类>.json       App 可直接导入的题库包（format: qpack）
                          服务器会直接下发（db.py 自动合并 json数据/qpack-*.json），
                          手机端：我的 → 一键下载在线题库 即可拿到
  _manifest.json          本次采集清单（来源/条数/字节数/时间）

用法：
  python tools/fetch_datasets.py                # 默认抓 四级/六级/考研 乱序词书
  python tools/fetch_datasets.py --books CET4_1 # 只抓指定词书关键字
  python tools/fetch_datasets.py --limit 500    # 每本词书最多转换 500 词

设计说明：
  - 转换后的词条沿用 db/cet4-vocab.json 的词卡 Markdown 风格
    （卡片/常考搭配/真题语境/同义替换/记忆），App 词卡模式直接可用
  - 词书内选择题(exam)转为选项卡（题干+四个选项，答案解析在答案区）
  - qpack 的 category ID 避开内置分类（如 cet4-vocab），用 imp-* 前缀，
    导入后自动生成「导入题库」分类，不会污染内置题库；重复 ID 自动跳过
"""
import argparse
import io
import json
import os
import re
import sys
import time
import urllib.request
import zipfile
from datetime import datetime, timezone

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:  # noqa: BLE001
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, 'json数据')
RAW_DIR = os.path.join(OUT_DIR, 'raw')

BOOK_API = 'https://api.github.com/repos/kajweb/dict/contents/book'
RAW_BASE = 'https://raw.githubusercontent.com/kajweb/dict/master/book/'

# 默认抓取计划：关键字 → (分类前缀, 中文名, 赛道)
# 每本词书拆两个 qpack：<前缀>-word 词卡（走词卡极简模式）+ <前缀>-exam 真题单选
# 关键字用于匹配 book/ 目录下的 zip 文件名
DEFAULT_BOOKS = [
    ('CET4luan_1',   'imp-cet4',   '四级核心词', 'cet4'),
    ('CET6luan_1',   'imp-cet6',   '六级核心词', 'cet6'),
    ('KaoYanluan_1', 'imp-kaoyan', '考研核心词', 'english'),
]

UA = {'User-Agent': 'Mozilla/5.0 (compatible; bagutong-fetcher/1.0)'}


def log(msg):
    print(msg, flush=True)


# ---------------------------------------------------------------- 下载 ----

def http_get(url, timeout=60, retries=3):
    last = None
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(1.5 * (i + 1))
    raise RuntimeError('下载失败 %s: %r' % (url, last))


def list_book_files():
    """列出 kajweb/dict book/ 目录下所有 zip 文件名"""
    data = http_get(BOOK_API, timeout=30)
    items = json.loads(data.decode('utf-8'))
    return [it['name'] for it in items if it['name'].endswith('.zip')]


def resolve_zip_name(keyword, all_names):
    for n in all_names:
        if keyword in n:
            return n
    return None


# ---------------------------------------------------------------- 转换 ----

def esc_cell(s):
    """Markdown 表格单元转义竖线"""
    return str(s).replace('|', '\\|').replace('\n', ' ').strip()


def build_word_answer(w):
    """把一个词条拼成词卡 Markdown（沿用 db/cet4-vocab 的风格）"""
    c = (w.get('content') or {}).get('word', {}).get('content', {})
    head = w.get('headWord') or c.get('wordHead', '')
    parts = []
    # 标题卡：单词 + 音标 + 释义
    phone = c.get('phone') or ''
    uk, us = c.get('ukphone') or '', c.get('usphone') or ''
    ph_bits = []
    if phone:
        ph_bits.append('/%s/' % phone.strip())
    else:
        if uk:
            ph_bits.append('英 /%s/' % uk.strip())
        if us:
            ph_bits.append('美 /%s/' % us.strip())
    title = '**%s**' % head
    if ph_bits:
        title += '　' + '　'.join(ph_bits)
    parts.append('## 卡片\n\n' + title)
    trans = c.get('trans') or []
    if trans:
        lines = []
        for t in trans:
            pos = (t.get('pos') or '').strip()
            cn = (t.get('tranCn') or t.get('tran') or '').strip()
            if not cn:
                continue
            lines.append('- %s %s' % (('%s.' % pos) if pos else '', cn))
        if lines:
            parts.append('\n'.join(lines))
    # 常考搭配
    phrases = (c.get('phrase') or {}).get('phrases') or []
    if phrases:
        rows = ['## 常考搭配']
        for p in phrases[:8]:
            rows.append('- %s %s' % (esc_cell(p.get('pContent', '')), esc_cell(p.get('pCn', ''))))
        parts.append('\n'.join(rows))
    # 真题语境（优先真题例句，不足补普通例句）
    real = (c.get('realExamSentence') or {}).get('sentences') or []
    plain = (c.get('sentence') or {}).get('sentences') or []
    if real or plain:
        rows = ['## 真题语境']
        picked = real[:2] or plain[:2]
        for i, s in enumerate(picked):
            sc = (s.get('sContent') or '').strip()
            cn = (s.get('sCn') or '').strip()
            src = s.get('sourceInfo') or {}
            tag = ''
            if src:
                bits = [str(x) for x in (src.get('level'), src.get('year'), src.get('type')) if x]
                if bits:
                    tag = '　——' + ' '.join(bits)
            rows.append('> %s%s' % (sc, tag))
            if cn:
                rows.append('> %s' % cn)
            if i < len(picked) - 1:
                rows.append('>')
        parts.append('\n'.join(rows))
    # 同义替换
    synos = (c.get('syno') or {}).get('synos') or []
    if synos:
        rows = ['## 同义替换']
        for s in synos[:3]:
            ws = [x.get('w', '') for x in (s.get('hwds') or []) if x.get('w')]
            if not ws:
                continue
            pos = (s.get('pos') or '').strip()
            tran = (s.get('tran') or '').strip()
            rows.append('- %s%s：%s' % (('%s. ' % pos) if pos else '', tran, ' / '.join(ws)))
        if len(rows) > 1:
            parts.append('\n'.join(rows))
    # 记忆方法
    rem = (c.get('remMethod') or {}).get('val') or ''
    if rem:
        parts.append('## 记忆\n\n' + rem.strip())
    # 同根词
    rels = (c.get('relWord') or {}).get('rels') or []
    if rels:
        rows = ['## 同根词']
        for r in rels[:4]:
            ws = ['%s %s' % (x.get('hwd', ''), esc_cell(x.get('tran', ''))) for x in (r.get('words') or []) if x.get('hwd')]
            if ws:
                rows.append('- %s.%s' % ((r.get('pos') or ''), '；'.join(ws)))
        if len(rows) > 1:
            parts.append('\n'.join(rows))
    return head, '\n\n'.join(parts)


def build_exam_answer(e):
    """把词书选择题转成 Markdown 答案（正确项 + 解析）"""
    ans = e.get('answer') or {}
    choices = e.get('choices') or []
    right = ans.get('rightIndex')
    lines = ['## 选项']
    for ch in choices:
        mark = ' ✅' if ch.get('choiceIndex') == right else ''
        lines.append('- %s. %s%s' % (ch.get('choiceIndex'), esc_cell(ch.get('choice', '')), mark))
    explain = (ans.get('explain') or '').strip()
    if explain:
        lines.append('\n## 解析\n\n' + explain)
    return '\n'.join(lines)


_DECODER = json.JSONDecoder()


def iter_json_objects(text):
    """健壮扫描：部分词书条目带换行/缩进，非严格逐行 JSONL，用 raw_decode 连续解码"""
    idx, n = 0, len(text)
    while idx < n:
        while idx < n and text[idx] in ' \r\n\t':
            idx += 1
        if idx >= n:
            break
        try:
            obj, end = _DECODER.raw_decode(text, idx)
        except ValueError:
            # 跳过坏字符继续扫描下一个 '{'
            nxt = text.find('{', idx + 1)
            if nxt < 0:
                break
            idx = nxt
            continue
        idx = end
        if isinstance(obj, dict):
            yield obj


def convert_book(text, prefix, cat_name, track, limit=None):
    """词书文本 → (词卡题列表, 真题单选题列表)；拆两个分类便于词卡极简模式"""
    words, exams = [], []
    seen_ids = set()
    for w in iter_json_objects(text):
        if limit and len(words) >= limit:
            break
        if not w.get('headWord') and not w.get('content'):
            continue
        head, answer = build_word_answer(w)
        if not head or not answer:
            continue
        rank = w.get('wordRank') or (len(words) + 1)
        wid = '%s-word-%04d' % (prefix, rank)
        if wid in seen_ids:
            continue
        seen_ids.add(wid)
        letter = head[0].lower()
        words.append({
            'id': wid,
            'category': prefix + '-word',
            'categoryName': cat_name + '·词卡',
            'question': head,
            'answer': answer,
            'difficulty': 2,
            'frequency': 'high',
            'tags': ['导入词汇', '%s开头' % letter],
            'related': [],
            '_track': track,
        })
        # 附带的真题选择题（每词最多 2 道）
        exam_list = ((w.get('content') or {}).get('word', {}).get('content', {}) or {}).get('exam') or []
        for e in exam_list[:2]:
            q_text = (e.get('question') or '').strip()
            a_text = build_exam_answer(e)
            if not q_text or not a_text or not (e.get('choices')):
                continue
            eid = '%s-exam-%04d-%d' % (prefix, rank, len(exams))
            if eid in seen_ids:
                continue
            seen_ids.add(eid)
            exams.append({
                'id': eid,
                'category': prefix + '-exam',
                'categoryName': cat_name + '·真题单选',
                'question': q_text,
                'answer': a_text,
                'difficulty': 3,
                'frequency': 'mid',
                'tags': ['导入词汇', '真题单选'],
                'related': [wid],
                '_track': track,
            })
    return words, exams


# ---------------------------------------------------------------- 主流程 ----

def main():
    ap = argparse.ArgumentParser(description='全网题库采集 → json数据/')
    ap.add_argument('--books', nargs='*', default=None,
                    help='只抓指定的词书关键字（默认 CET4luan_1 CET6luan_1 KaoYanluan_1）')
    ap.add_argument('--limit', type=int, default=None, help='每本词书最多转换的词条数')
    ap.add_argument('--skip-raw', action='store_true', help='不保留 raw/*.jsonl 原始备份')
    args = ap.parse_args()

    os.makedirs(OUT_DIR, exist_ok=True)
    if not args.skip_raw:
        os.makedirs(RAW_DIR, exist_ok=True)

    plan = DEFAULT_BOOKS
    if args.books:
        wanted = set(args.books)
        plan = [p for p in DEFAULT_BOOKS if any(k in p[0] for k in wanted)]
        if not plan:
            log('!! --books %s 不在默认计划中；可用关键字：%s'
                % (args.books, ', '.join(p[0] for p in DEFAULT_BOOKS)))
            sys.exit(2)

    log('== 采集开始：%s ==' % datetime.now().strftime('%Y-%m-%d %H:%M'))
    log('输出目录：%s' % OUT_DIR)

    log('\n[1/3] 获取词书文件清单 ...')
    all_names = list_book_files()
    log('  仓库共 %d 个词书包' % len(all_names))

    manifest = {
        'app': 'bagutong', 'fetched_at': datetime.now(timezone.utc).isoformat(),
        'source': 'https://github.com/kajweb/dict',
        'packs': [],
    }
    total_q = 0

    for i, (keyword, cat_id, cat_name, track) in enumerate(plan, 1):  # cat_id 为分类前缀
        zip_name = resolve_zip_name(keyword, all_names)
        if not zip_name:
            log('\n[!] 词书 %s 未在仓库中找到，跳过' % keyword)
            continue
        log('\n[%d/%d] 下载 %s ...' % (i, len(plan), zip_name))
        data = http_get(RAW_BASE + zip_name, timeout=120)
        log('  %s（%.1f KB）' % (zip_name, len(data) / 1024))

        zf = zipfile.ZipFile(io.BytesIO(data))
        members = [m.filename for m in zf.infolist() if m.filename.lower().endswith('.json')]
        if not members:
            log('  [!] zip 内无 JSON，跳过')
            continue
        text = zf.read(members[0]).decode('utf-8')

        if not args.skip_raw:
            raw_path = os.path.join(RAW_DIR, os.path.splitext(members[0])[0] + '.jsonl')
            with open(raw_path, 'w', encoding='utf-8') as f:
                f.write(text)
            log('  raw 备份 → %s' % os.path.relpath(raw_path, ROOT))

        log('  转换词条（limit=%s）...' % args.limit)
        words, exams = convert_book(text, cat_id, cat_name, track, args.limit)

        for questions, sub_name in ((words, '词卡'), (exams, '真题单选')):
            if not questions:
                continue
            cat = questions[0]['category']
            pack = {
                'app': 'bagutong',
                'format': 'qpack',
                'source': 'kajweb/dict@github · %s' % zip_name,
                'fetched_at': manifest['fetched_at'],
                'track': track,
                'category': {'id': cat, 'name': questions[0]['categoryName']},
                'questions': questions,
            }
            out_name = 'qpack-%s.json' % cat
            out_path = os.path.join(OUT_DIR, out_name)
            with open(out_path, 'w', encoding='utf-8') as f:
                json.dump(pack, f, ensure_ascii=False, separators=(',', ':'))
            size = os.path.getsize(out_path)
            log('  ✓ %s（%s）：%d 题，%.1f KB' % (out_name, sub_name, len(questions), size / 1024))
            manifest['packs'].append({
                'file': out_name, 'category': cat, 'name': questions[0]['categoryName'],
                'track': track, 'count': len(questions), 'kind': sub_name,
                'bytes': size, 'zip': zip_name,
            })
            total_q += len(questions)

    mp = os.path.join(OUT_DIR, '_manifest.json')
    with open(mp, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)
    log('\n[3/3] 清单 → %s' % os.path.relpath(mp, ROOT))
    log('== 采集完成：共 %d 个题库包 / %d 道题 ==' % (len(manifest['packs']), total_q))
    log('生效方式：启动服务器（启动服务器.bat）→ 手机 App「我的」→ 一键下载在线题库')


if __name__ == '__main__':
    main()
