/* =====================================================================
 * store.js —— 数据层：题库索引 + 本地持久化 + 间隔重复引擎(SRS) + 搜索
 * ---------------------------------------------------------------------
 * 无任何后端，全部状态存 localStorage；localStorage 不可用时自动降级内存
 * 存储并上报，保证 App 永不崩溃（file:// 打开时尤其重要）。
 * ===================================================================== */
(function (global) {
  'use strict';

  var PREFIX = 'bagutong';
  var VER = 3;

  /* ---------------------------- 存储适配 ---------------------------- */
  var backend = 'local', mem = {};
  try {
    var probe = '__p__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
  } catch (e) { backend = 'memory'; }

  var LS = backend === 'local' ? localStorage : {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
    setItem: function (k, v) { mem[k] = String(v); },
    removeItem: function (k) { delete mem[k]; }
  };

  var listeners = [];
  function onChange(fn) { listeners.push(fn); }
  function emit(evt) { listeners.forEach(function (f) { try { f(evt); } catch (e) { console.error(e); } }); }

  /* ---------------------------- 状态结构 ---------------------------- */
  function defaults() {
    return {
      v: VER,
      progress: {},          // qid -> {box,due,reps,lapses,last,state}
      wrong: {},             // qid -> {n,streak,at}
      fav: [],               // [qid]
      notes: {},             // qid -> {text,at}
      daily: {},             // 'YYYY-MM-DD' -> {ids:[],done:[]}
      streak: { last: null, days: 0, best: 0 },
      activity: {},          // 'YYYY-MM-DD' -> 次数
      seen: {},              // qid -> 首次学习时间（读过答案即算）
      settings: { theme: 'auto', font: 1.0, goal: 10, autoReveal: false, hideUntilTap: true,
        autoSync: true, syncUrl: '', track: 'job' },   // track: 当前赛道；syncUrl: API 基地址（留空=同源）
      custom: { cats: [], q: [] },   // 用户导入的题库
      ts: Date.now()
    };
  }

  /* ---- 远程题库（服务器 db/*.json 下发，存于独立键 bagutong.remote）----
   * 全量题库并入采集词库后约 4MB，明文 JSON 会撑爆 localStorage 5MB 配额，
   * 因此统一 gzip+base64 存储（实测压到 ~35%）。老版本明文记录自动迁移。
   * 解压是异步的（DecompressionStream），boot 前须先 await Store.loadRemote()。 */
  var REMOTE_KEY = PREFIX + '.remote';
  var _remoteCache = null;

  function _str2b64(str) {
    var bytes = new TextEncoder().encode(str);
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }
  function _b642str(b64) {
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  function _canGzip() {
    return typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';
  }
  function _gzip(str) {
    return new Response(new Blob([new TextEncoder().encode(str)])
      .stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer()
      .then(function (buf) {
        var bytes = new Uint8Array(buf), bin = '';
        for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        return btoa(bin);
      });
  }
  function _gunzip(b64) {
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Response(new Blob([bytes]).stream()
      .pipeThrough(new DecompressionStream('gzip'))).text();
  }

  function remoteBank() { return _remoteCache; }

  function loadRemote() {
    try {
      var raw = LS.getItem(REMOTE_KEY);
      if (!raw) return Promise.resolve(null);
      var o = JSON.parse(raw);
      if (!o) return Promise.resolve(null);
      if (o.bank && Array.isArray(o.bank.questions) && o.bank.questions.length) {
        _remoteCache = o;   // 老格式（明文），直接可用，下次保存时自动升级
        return Promise.resolve(o);
      }
      if (o.gz && _canGzip()) {
        return _gunzip(o.gz).then(function (json) {
          var d = JSON.parse(json);
          if (d && d.bank && Array.isArray(d.bank.questions) && d.bank.questions.length) {
            _remoteCache = d;
            return d;
          }
          return null;
        }).catch(function () { return null; });
      }
    } catch (e) { /* 损坏则忽略，回退内置题库 */ }
    return Promise.resolve(null);
  }

  function saveRemoteBank(doc) {
    var payload = { version: doc.version || '', bank: doc, downloadedAt: Date.now() };
    var json = JSON.stringify(payload);
    if (!_canGzip()) {
      try {
        LS.setItem(REMOTE_KEY, json);   // 无压缩 API 时退化为明文（可能配额不足）
        _remoteCache = payload;
        return Promise.resolve(true);
      } catch (e) {
        console.warn('[store] 远程题库存储失败（配额不足）', e);
        return Promise.resolve(false);
      }
    }
    return _gzip(json).then(function (b64) {
      LS.setItem(REMOTE_KEY, JSON.stringify({ v: 2, version: payload.version, gz: b64, downloadedAt: payload.downloadedAt }));
      _remoteCache = payload;
      return true;
    }).catch(function (e) {
      console.warn('[store] 远程题库存储失败', e);
      return false;
    });
  }

  function clearRemoteBank() { _remoteCache = null; LS.removeItem(REMOTE_KEY); }

  var S = defaults();

  function load() {
    try {
      var raw = LS.getItem(PREFIX + '.state');
      if (raw) {
        var o = JSON.parse(raw);
        if (o && typeof o === 'object') {
          // 浅合并，缺字段用默认值补齐（向前兼容）
          var d = defaults();
          Object.keys(d).forEach(function (k) { if (o[k] === undefined) o[k] = d[k]; });
          o.settings = Object.assign({}, d.settings, o.settings || {});
          o.streak = Object.assign({}, d.streak, o.streak || {});
          o.custom = Object.assign({}, d.custom, o.custom || {});
          if (typeof o.v !== 'number') o.v = VER;
          S = o;
        }
      }
    } catch (e) {
      console.warn('[store] 读取本地状态失败，已重置', e);
      S = defaults();
    }
    return S;
  }

  var saveTimer = null;
  function save() {
    S.ts = Date.now();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { LS.setItem(PREFIX + '.state', JSON.stringify(S)); }
      catch (e) {
        console.warn('[store] 保存失败（可能配额已满）', e);
        try {
          LS.setItem(PREFIX + '.state', JSON.stringify(
            Object.assign({}, S, { custom: { cats: [], q: [] }, notes: S.notes })));
        } catch (e2) { /* 放弃本次持久化 */ }
      }
    }, 60);
  }

  /* ---------------------------- 题库索引 ---------------------------- */
  var CATS = [], BY_CAT = {}, BY_ID = {}, ORDER = [], INDEX = [], TRACKS = [];

  function initBank() {
    var meta = (global.QB && global.QB.meta) || { categories: [] };
    CATS = (meta.categories || []).slice();
    TRACKS = (meta.tracks || []).slice();
    var packs = (global.QB && global.QB.packs) || {};

    // 远程题库优先：服务器 DB 下发的完整题库替换内置（两者同源，内置作为离线兜底）
    var remote = remoteBank();
    if (remote) {
      var rb = remote.bank;
      if (Array.isArray(rb.tracks) && rb.tracks.length) TRACKS = rb.tracks.slice();
      if (Array.isArray(rb.categories) && rb.categories.length) {
        CATS = rb.categories.map(function (c) {
          return {
            id: c.id, name: c.name || c.id, badge: c.badge || String(c.name || c.id).slice(0, 2),
            color: c.color || '#8A6D3B', desc: c.desc || c.decr || '', track: c.track || 'job', remote: true
          };
        });
      }
      packs = {};
      var byCatRemote = {};
      (rb.questions || []).forEach(function (q) {
        byCatRemote[q.category] = byCatRemote[q.category] || [];
        byCatRemote[q.category].push(q);
      });
      packs = byCatRemote;
      // 远程缺失的内置分类仍保留（不至于因 DB 没同步某分类而丢失）
      (meta.categories || []).forEach(function (c) {
        if (!CATS.some(function (x) { return x.id === c.id; })) CATS.push(c);
      });
    }

    BY_CAT = {}; BY_ID = {}; ORDER = []; INDEX = [];
    // 1) 题库（远程或内置）
    CATS.forEach(function (c) { BY_CAT[c.id] = []; });
    CATS.forEach(function (c) {
      (packs[c.id] || []).forEach(function (q) { pushQ(c, q, false); });
    });
    if (remote) {
      // 题目 category 字段指向未知分类时兜底归档，确保不丢题
      (remote.bank.questions || []).forEach(function (q) {
        if (!BY_ID[String(q.id).toLowerCase()]) {
          var fallback = CATS[CATS.length - 1];
          if (fallback) pushQ(fallback, q, false);
        }
      });
    }
    // 2) 用户自定义分类
    ((S.custom && S.custom.cats) || []).forEach(function (c) {
      if (CATS.some(function (x) { return x.id === c.id; })) return;
      CATS.push(Object.assign({ track: 'job' }, c)); BY_CAT[c.id] = [];
    });
    ((S.custom && S.custom.q) || []).forEach(function (q) {
      var c = CATS.filter(function (x) { return x.id === q.category; })[0];
      if (!c) { c = CATS[CATS.length - 1] || { id: 'other', name: '其它', badge: '其', color: '#888', desc: '导入题目', track: 'job' }; CATS.push(c); BY_CAT[c.id] = []; }
      pushQ(c, q, true);
    });
    buildIndex();
  }

  function pushQ(c, q, isCustom) {
    var item = {
      id: String(q.id).toLowerCase(),
      cat: c.id, catName: c.name, color: c.color, track: c.track || 'job',
      q: String(q.q || q.question || '').trim(),
      a: String(q.a || q.answer || '').replace(/\r\n?/g, '\n').trim(),
      d: clampInt(q.d != null ? q.d : q.difficulty, 1, 5, 3),
      f: normFreq(q.f != null ? q.f : q.frequency),
      t: normTags(q.t || q.tags),
      r: normTags(q.r || q.related),
      custom: !!isCustom
    };
    if (BY_ID[item.id]) { console.warn('[store] 重复题目 id：' + item.id + '（后者忽略）'); return; }
    BY_ID[item.id] = item;
    BY_CAT[c.id].push(item);
    ORDER.push(item);
  }

  function clampInt(v, lo, hi, dft) { v = parseInt(v, 10); if (isNaN(v)) return dft; return Math.max(lo, Math.min(hi, v)); }
  function normFreq(f) {
    f = String(f || 'mid').toLowerCase();
    if (f === '高频' || f === 'hot') f = 'high';
    if (f === '中频') f = 'mid';
    if (f === '低频') f = 'low';
    return ['high', 'mid', 'low'].indexOf(f) >= 0 ? f : 'mid';
  }
  function normTags(t) {
    if (!t) return [];
    if (Array.isArray(t)) return t.map(function (x) { return String(x).trim(); }).filter(Boolean).slice(0, 6);
    return String(t).split(/[,，;；\/]/).map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 6);
  }

  function buildIndex() {
    INDEX = ORDER.map(function (q) {
      return { id: q.id, ref: q, hay: (q.q + ' ' + q.a + ' ' + q.t.join(' ') + ' ' + q.catName).toLowerCase() };
    });
  }

  /* ---------------------------- 查询 API ---------------------------- */
  function cats() { return CATS; }
  function cat(id) { for (var i = 0; i < CATS.length; i++) if (CATS[i].id === id) return CATS[i]; return null; }
  function tracks() {
    // 只返回实际有题的赛道（导入的自定义分类可能不在预定义赛道里）
    var ids = {};
    ORDER.forEach(function (q) { ids[q.track || 'job'] = 1; });
    var out = TRACKS.filter(function (t) { return ids[t.id]; });
    var known = {};
    TRACKS.forEach(function (t) { known[t.id] = 1; });
    Object.keys(ids).forEach(function (id) {
      if (!known[id]) out.push({ id: id, name: id, short: id, color: '#8A6D3B', desc: '', icon: 'book' });
    });
    return out;
  }
  function track(id) { var t = tracks(); for (var i = 0; i < t.length; i++) if (t[i].id === id) return t[i]; return null; }
  function catsByTrack(trackId) {
    return CATS.filter(function (c) {
      if (!BY_CAT[c.id] || !BY_CAT[c.id].length) return false;
      return !trackId || (c.track || 'job') === trackId;
    });
  }
  function trackStats(trackId) {
    var list = catsByTrack(trackId);
    var total = 0, mastered = 0, seen = 0, wrong = 0;
    var ids = {};
    list.forEach(function (c) {
      var s = catStats(c.id);
      total += s.total; mastered += s.mastered; seen += s.seen; wrong += s.wrong;
    });
    // 赛道内的待复习数（庆祝弹窗/练习结算用，避免混入其它赛道数字）
    var due = 0;
    trackQuestions(trackId).forEach(function (q) {
      ids[q.id] = 1;
      var p = S.progress[q.id];
      if (p && p.box < MAX_BOX && p.due && p.due <= Date.now()) due++;
    });
    return { total: total, mastered: mastered, seen: seen, wrong: wrong, due: due, cats: list.length,
      pct: total ? Math.round(mastered / total * 100) : 0 };
  }
  function all() { return ORDER; }
  function get(id) { return BY_ID[String(id || '').toLowerCase()] || null; }
  function count() { return ORDER.length; }
  function byCat(id) { return BY_CAT[id] || []; }
  function allTags() {
    var m = {};
    ORDER.forEach(function (q) { q.t.forEach(function (t) { m[t] = (m[t] || 0) + 1; }); });
    return Object.keys(m).map(function (k) { return [k, m[k]]; }).sort(function (a, b) { return b[1] - a[1]; });
  }
  function related(q) {
    var out = [];
    (q.r || []).forEach(function (id) { var x = get(id); if (x) out.push(x); });
    // 补充：同分类同标签
    if (out.length < 4) {
      var tags = q.t || [];
      byCat(q.cat).forEach(function (o) {
        if (o.id === q.id || out.some(function (y) { return y.id === o.id; })) return;
        if ((o.t || []).some(function (t) { return tags.indexOf(t) >= 0; })) out.push(o);
      });
    }
    return out.slice(0, 6);
  }
  /** 同分类下的上一题 / 下一题 */
  function sibling(q) {
    var arr = byCat(q.cat), i = -1;
    for (var k = 0; k < arr.length; k++) if (arr[k].id === q.id) { i = k; break; }
    return { prev: i > 0 ? arr[i - 1] : null, next: i >= 0 && i < arr.length - 1 ? arr[i + 1] : null, index: i + 1, total: arr.length };
  }

  /* ---------------------------- SRS 引擎 ---------------------------- */
  // 各 box 的复习间隔（分钟）：8分钟 / 1天 / 2天 / 4天 / 7天 / 15天 / 30天
  var INTERVAL_MIN = [8, 1440, 2880, 5760, 10080, 21600, 43200];
  var MAX_BOX = INTERVAL_MIN.length;   // box >= MAX_BOX 视为已掌握

  function prog(id) { return S.progress[id] || null; }
  function touch(id) {
    if (!S.progress[id]) S.progress[id] = { box: 0, due: null, reps: 0, lapses: 0, last: 0, state: 'new' };
    return S.progress[id];
  }
  function stateOf(id) {
    var p = S.progress[id];
    if (!p) return 'new';
    return p.state;
  }
  function isMastered(id) { var p = S.progress[id]; return !!(p && p.box >= MAX_BOX); }
  function isSeen(id) { return !!S.seen[id]; }

  /** 打开题目（读过题即算接触），首次记录时间 */
  function markSeen(id) {
    if (!S.seen[id]) { S.seen[id] = Date.now(); save(); }
    bumpActivity();
  }

  /**
   * 记忆评分：again 不会 / hard 模糊 / good 记住 / easy 秒答
   * 返回 {p, removedWrong}
   */
  function grade(id, rating) {
    var q = get(id); if (!q) return null;
    var p = touch(id), now = Date.now();
    var removedWrong = false;

    if (rating === 'again') {
      p.lapses++; p.box = 0; p.due = now + INTERVAL_MIN[0] * 60000;
      addWrong(id);
    } else if (rating === 'hard') {
      p.due = now + Math.round(INTERVAL_MIN[Math.min(p.box, INTERVAL_MIN.length - 1)] * 1.2) * 60000;
      if (S.wrong[id]) { S.wrong[id].streak = 0; S.wrong[id].at = now; }
    } else if (rating === 'good') {
      p.box = Math.min(p.box + 1, MAX_BOX);
      p.due = p.box >= MAX_BOX ? null : now + INTERVAL_MIN[p.box] * 60000;
      removedWrong = hitWrong(id);
    } else if (rating === 'easy') {
      p.box = Math.min(p.box + 2, MAX_BOX);
      p.due = p.box >= MAX_BOX ? null : now + Math.round(INTERVAL_MIN[Math.min(p.box, INTERVAL_MIN.length - 1)] * 1.6) * 60000;
      removedWrong = hitWrong(id);
    }
    p.reps++; p.last = now;
    p.state = p.box >= MAX_BOX ? 'mastered' : (p.box >= 3 ? 'review' : 'learning');
    markSeen(id); bumpActivity(); checkIn();
    dailyDone(id);   // 评分即视为「今日任务已处理」——修复：评完级今日列表/红点纹丝不动
    save(); emit({ t: 'grade', id: id, rating: rating });
    return { p: p, removedWrong: removedWrong };
  }

  function addWrong(id) {
    var w = S.wrong[id] || { n: 0, streak: 0, at: 0 };
    w.n++; w.streak = 0; w.at = Date.now();
    S.wrong[id] = w; save();
  }
  function hitWrong(id) {
    if (!S.wrong[id]) return false;
    S.wrong[id].streak++;
    if (S.wrong[id].streak >= 2) { delete S.wrong[id]; save(); return true; }
    save(); return false;
  }
  function wrongList() {
    var arr = Object.keys(S.wrong).map(function (id) {
      var q = get(id); if (!q) return null;
      return { q: q, n: S.wrong[id].n, streak: S.wrong[id].streak, at: S.wrong[id].at };
    }).filter(Boolean);
    arr.sort(function (a, b) { return b.at - a.at; });
    return arr;
  }
  function clearWrong(id) { if (id) delete S.wrong[id]; else S.wrong = {}; save(); emit({ t: 'wrong' }); }

  /* ---------------------------- 收藏 / 笔记 ---------------------------- */
  function isFav(id) { return S.fav.indexOf(id) >= 0; }
  function toggleFav(id) {
    var i = S.fav.indexOf(id);
    if (i >= 0) { S.fav.splice(i, 1); save(); emit({ t: 'fav', id: id, on: false }); return false; }
    S.fav.unshift(id); save(); bumpActivity(); emit({ t: 'fav', id: id, on: true }); return true;
  }
  function favList() {
    return S.fav.map(function (id) { return get(id); }).filter(Boolean);
  }
  function note(id) { return (S.notes[id] && S.notes[id].text) || ''; }
  function setNote(id, text) {
    text = String(text || '');
    if (!text.trim()) delete S.notes[id]; else S.notes[id] = { text: text, at: Date.now() };
    save(); emit({ t: 'note', id: id });
  }
  function noteList() {
    return Object.keys(S.notes).map(function (id) {
      var q = get(id); if (!q) return null;
      return { q: q, text: S.notes[id].text, at: S.notes[id].at };
    }).filter(Boolean).sort(function (a, b) { return b.at - a.at; });
  }

  /* ---------------------------- 复习队列 ---------------------------- */
  function dueList(now) {
    now = now || Date.now();
    var out = [];
    Object.keys(S.progress).forEach(function (id) {
      var p = S.progress[id];
      if (p.box >= MAX_BOX) return;
      if (!p.due) return;
      if (p.due <= now) { var q = get(id); if (q) out.push({ q: q, p: p }); }
    });
    out.sort(function (a, b) { return a.p.due - b.p.due; });
    return out;
  }
  /** 未学过、非掌握的题（按频率优先） */
  function freshList(catId) {
    var src = catId ? byCat(catId) : ORDER;
    return src.filter(function (q) { return !S.progress[q.id] || (!isMastered(q.id) && !isSeen(q.id)); });
  }
  function unmastered(catId) {
    var src = catId ? byCat(catId) : ORDER;
    return src.filter(function (q) { return !isMastered(q.id); });
  }

  /* ---------------------------- 每日任务 / 打卡 ---------------------------- */
  function dateKey(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  // 以日期为种子的稳定排序，保证「今日 10 题」当天不变、隔天变
  function seededSort(arr, seedStr) {
    var seed = 0;
    for (var i = 0; i < seedStr.length; i++) seed = (seed * 31 + seedStr.charCodeAt(i)) | 0;
    function rnd() { seed = (seed * 1664525 + 1013904223) | 0; return ((seed >>> 8) & 0xffff) / 65536; }
    var a = arr.slice();
    for (var j = a.length - 1; j > 0; j--) {
      var k = Math.floor(rnd() * (j + 1));
      var t = a[j]; a[j] = a[k]; a[k] = t;
    }
    return a;
  }

  /** 当前赛道与切换 */
  function activeTrack() {
    var id = S.settings.track || 'job';
    return track(id) ? id : (tracks()[0] ? tracks()[0].id : 'job');
  }
  function setTrack(id) {
    if (!id) return;
    S.settings.track = id;
    // 切赛道时重排今日任务（保留已完成的评级进度）
    var key = dateKey();
    var old = S.daily[key];
    delete S.daily[key];
    ensureDaily();
    if (old && old.done && S.daily[key]) {
      S.daily[key].done = old.done.filter(function (qid) {
        return S.daily[key].ids.indexOf(qid) >= 0;
      });
    }
    save(); emit({ t: 'track', id: id });
  }
  /** 赛道内的题目集合（无赛道参数则全量） */
  function trackQuestions(trackId) {
    if (!trackId) return ORDER;
    var ids = {};
    catsByTrack(trackId).forEach(function (c) { ids[c.id] = 1; });
    return ORDER.filter(function (q) { return ids[q.cat]; });
  }

  /** 生成（或读取）今日任务题目 id 列表（限当前赛道） */
  function ensureDaily() {
    var key = dateKey(), n = Math.max(3, Math.min(40, parseInt(S.settings.goal, 10) || 10));
    var d = S.daily[key];
    var curTrack = S.settings.track || 'job';
    if (d && d.track !== curTrack) d = null;   // 赛道变了 → 重排
    if (d && Array.isArray(d.ids) && d.ids.length) return d;
    var pool = [];
    var scope = trackQuestions(curTrack);
    // 待复习优先（限当前赛道）
    dueList().forEach(function (x) { if (scope.indexOf(x.q) >= 0) pool.push(x.q); });
    // 未掌握高频题补充
    var rest = scope.filter(function (q) { return !isMastered(q.id) && pool.indexOf(q) < 0; });
    var fw = { high: 0, mid: 1, low: 2 };
    rest.sort(function (a, b) { return (fw[a.f] - fw[b.f]) || (a.d - b.d); });
    rest = seededSort(rest.slice(0, Math.min(rest.length, n * 6)), key);
    pool = pool.concat(rest);
    var seen = {}, ids = [];
    for (var i = 0; i < pool.length && ids.length < n; i++) {
      if (!seen[pool[i].id]) { seen[pool[i].id] = 1; ids.push(pool[i].id); }
    }
    d = { ids: ids, done: [], at: Date.now(), track: curTrack };
    S.daily[key] = d;
    // 只保留最近 300 天记录
    var keys = Object.keys(S.daily).sort();
    if (keys.length > 300) keys.slice(0, keys.length - 300).forEach(function (k) { delete S.daily[k]; });
    save();
    return d;
  }
  function daily() { return ensureDaily(); }
  function dailyDone(id) {
    ensureDaily();   // 先确保当日任务存在（切赛道后直接评级时 S.daily[today] 可能为 undefined）
    var key = dateKey();
    if (S.daily[key] && S.daily[key].done.indexOf(id) < 0) {
      S.daily[key].done.push(id); save();
    }
    return S.daily[key];
  }
  function dailyProgress() {
    var d = ensureDaily();
    return { total: d.ids.length, done: d.ids.filter(function (id) { return d.done.indexOf(id) >= 0; }).length };
  }

  function bumpActivity() {
    var k = dateKey();
    S.activity[k] = (S.activity[k] || 0) + 1;
  }

  /** 打卡：任何有效学习行为都会推进连续天数 */
  function checkIn() {
    var today = dateKey();
    var st = S.streak;
    if (st.last === today) return st;
    var y = new Date(); y.setDate(y.getDate() - 1);
    if (st.last === dateKey(y)) { st.days = (st.days || 0) + 1; }
    else if (!st.last) { st.days = 1; }
    else { st.days = 1; }
    st.last = today;
    st.best = Math.max(st.best || 0, st.days);
    save();
    return st;
  }
  function isTodayChecked() { return S.streak.last === dateKey(); }

  /* ---------------------------- 统计 ---------------------------- */
  function catStats(catId) {
    var arr = byCat(catId), total = arr.length;
    var mastered = 0, seen = 0, wrong = 0;
    arr.forEach(function (q) {
      if (isMastered(q.id)) mastered++;
      if (isSeen(q.id)) seen++;
      if (S.wrong[q.id]) wrong++;
    });
    return {
      total: total, mastered: mastered, seen: seen, wrong: wrong,
      pct: total ? Math.round(mastered / total * 100) : 0,
      seenPct: total ? Math.round(seen / total * 100) : 0
    };
  }
  function stats() {
    var total = ORDER.length, mastered = 0, seen = 0;
    ORDER.forEach(function (q) { if (isMastered(q.id)) mastered++; if (isSeen(q.id)) seen++; });
    var wrong = Object.keys(S.wrong).length;
    var noteN = Object.keys(S.notes).length;
    var acts = 0; Object.keys(S.activity).forEach(function (k) { acts += S.activity[k]; });
    return {
      total: total, mastered: mastered, seen: seen, wrong: wrong,
      fav: S.fav.length, notes: noteN, actions: acts,
      pct: total ? Math.round(mastered / total * 100) : 0,
      streak: S.streak.days || 0, best: S.streak.best || 0,
      due: dueList().length,
      today: S.activity[dateKey()] || 0
    };
  }
  /** 最近 n 天热力图数据 */
  function heatmap(days) {
    days = days || 120;
    var out = [], d = new Date();
    for (var i = days - 1; i >= 0; i--) {
      var x = new Date(d.getTime() - i * 86400000);
      var k = dateKey(x);
      out.push({ key: k, n: S.activity[k] || 0, date: x });
    }
    return out;
  }

  /* ---------------------------- 搜索 ---------------------------- */
  /**
   * 多关键词 AND 匹配 + 打分排序
   * 打分：题干命中 > 标签命中 > 答案命中；高频/低难度加权
   */
  function search(kw, opts) {
    kw = String(kw || '').trim().toLowerCase();
    if (!kw) return [];
    opts = opts || {};
    var words = kw.split(/\s+/).filter(Boolean);
    if (opts.cat) words = words;
    var res = [];
    for (var i = 0; i < INDEX.length; i++) {
      var e = INDEX[i], q = e.ref;
      if (opts.cat && q.cat !== opts.cat) continue;
      if (opts.favOnly && !isFav(q.id)) continue;
      if (opts.wrongOnly && !S.wrong[q.id]) continue;
      if (opts.tag && q.t.indexOf(opts.tag) < 0) continue;
      var score = 0, ok = true, snippets = [];
      for (var w = 0; w < words.length; w++) {
        var t = words[w];
        if (!t) continue;
        var inQ = q.q.toLowerCase().indexOf(t) >= 0;
        var inT = q.t.join(' ').toLowerCase().indexOf(t) >= 0;
        var inC = q.catName.toLowerCase().indexOf(t) >= 0;
        var pos = e.hay.indexOf(t);
        if (pos < 0 && !inQ && !inT && !inC) { ok = false; break; }
        score += (inQ ? 100 : 0) + (inT ? 60 : 0) + (inC ? 40 : 0) + (pos >= 0 ? 30 - Math.min(20, Math.floor(pos / 200)) : 0);
        if (!inQ) { var s = snippet(q.a, t); if (s) snippets.push(s); }
      }
      if (!ok) continue;
      score += (q.f === 'high' ? 12 : q.f === 'mid' ? 6 : 0) + (6 - q.d);
      res.push({ q: q, score: score, snippet: snippets[0] || snippet(q.a, words[0]) || MD.digest(q.a) });
    }
    res.sort(function (a, b) { return b.score - a.score || a.q.id.localeCompare(b.q.id); });
    return opts.limit ? res.slice(0, opts.limit) : res;
  }

  function snippet(text, word) {
    if (!text || !word) return '';
    var low = text.toLowerCase(), p = low.indexOf(word);
    if (p < 0) return '';
    var st = Math.max(0, p - 24), ed = Math.min(text.length, p + word.length + 56);
    var s = MD.plain(text.slice(st, ed));
    return (st > 0 ? '…' : '') + s + (ed < text.length ? '…' : '');
  }

  /* ---------------------------- 设置 / 主题 ---------------------------- */
  function settings() { return S.settings; }
  function setSetting(k, v) {
    S.settings[k] = v; save();
    applyTheme();
    emit({ t: 'settings' });
  }
  function applyTheme() {
    var th = S.settings.theme;
    var mode = th === 'auto'
      ? (global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : th;
    document.documentElement.setAttribute('data-theme', mode);
    document.documentElement.setAttribute('data-theme-choice', th);
    var mc = document.querySelector('meta[name="theme-color"]');
    if (mc) mc.setAttribute('content', mode === 'dark' ? '#12161A' : '#F4F6F4');
  }

  /* ---------------------------- 备份 / 导入 / 重置 ---------------------------- */
  function exportData(withCustomBank) {
    var o = {
      app: 'bagutong', format: 'backup', version: VER, exportedAt: new Date().toISOString(),
      progress: S.progress, wrong: S.wrong, fav: S.fav, notes: S.notes,
      daily: S.daily, streak: S.streak, activity: S.activity, seen: S.seen, settings: S.settings
    };
    if (withCustomBank) o.custom = S.custom;
    return o;
  }

  /**
   * 导入：
   *  - format:'backup' → 恢复学习数据
   *  - format:'qpack' 或 含 questions 数组 → 追加题库
   */
  function importData(doc) {
    doc = doc || {};
    var added = 0, skipped = 0;
    if (doc.format === 'qpack' || doc.questions || (Array.isArray(doc) && doc[0] && doc[0].question)) {
      var list = Array.isArray(doc) ? doc : doc.questions;
      var cats = (S.custom.cats = S.custom.cats || []), qs = (S.custom.q = S.custom.q || []);
      var packTrack = String(doc.track || '').trim() || 'job';   // 包级赛道归属（tools/fetch_datasets.py 产物携带）
      (list || []).forEach(function (it) {
        var id = String(it.id || '').toLowerCase().trim();
        if (!id || BY_ID[id]) { skipped++; return; }
        var q = it.q || it.question, a = it.a != null ? it.a : it.answer;
        if (!q || !a) { skipped++; return; }
        var cid = String(it.category || id.split('-')[0] || 'custom').trim();
        if (!cat(cid)) {
          if (!cats.some(function (c) { return c.id === cid; })) {
            // 题级 _track 优先于包级 track，保证导入的题落在正确赛道 Tab 下
            var trk = String(it._track || '').trim() || packTrack;
            cats.push({ id: cid, name: (it.categoryName || cid), badge: String(it.categoryName || cid).slice(0, 2), color: '#8A6D3B', desc: '导入题库', track: trk });
          }
        }
        qs.push({ id: id, category: cid, q: String(q).trim(), a: String(a), d: it.d || it.difficulty || 3, f: it.f || it.frequency || 'mid', t: it.t || it.tags || [], r: it.r || it.related || [] });
        added++;
      });
      initBank();
      save(); emit({ t: 'bank' });
      return { ok: true, added: added, skipped: skipped, type: 'qpack' };
    }
    // 备份恢复：合并进度
    var merged = 0;
    ['progress', 'wrong', 'notes', 'seen', 'activity', 'daily'].forEach(function (k) {
      if (doc[k] && typeof doc[k] === 'object') {
        Object.keys(doc[k]).forEach(function (id) {
          var cur = S[k][id];
          if (!cur || (doc[k][id] && (doc[k][id].last || 0) >= (cur.last || 0))) { S[k][id] = doc[k][id]; merged++; }
        });
      }
    });
    if (Array.isArray(doc.fav)) {
      doc.fav.forEach(function (id) { if (S.fav.indexOf(id) < 0) S.fav.unshift(id); });
      merged += doc.fav.length;
    }
    if (doc.streak) S.streak = Object.assign({}, S.streak, doc.streak);
    if (doc.settings) S.settings = Object.assign({}, S.settings, doc.settings);
    if (doc.custom && doc.custom.q && doc.custom.q.length) { S.custom = doc.custom; initBank(); }
    save(); applyTheme(); emit({ t: 'restore' });
    return { ok: true, merged: merged, type: 'backup' };
  }

  function resetProgress() {
    var keep = { custom: S.custom, settings: S.settings };
    S = defaults();
    S.custom = keep.custom; S.settings = keep.settings;
    initBank(); save(); emit({ t: 'reset' });
  }

  /* 用户端「新增一题」（我的 → 自建题目） */
  function addCustomQuestion(o) {
    var id = String(o.id || '').toLowerCase().trim();
    if (!id) id = 'my-' + Date.now().toString(36);
    if (!/^[a-z0-9\-]+$/.test(id)) return { ok: false, msg: '题目 ID 只能用小写字母/数字/连字符' };
    if (BY_ID[id]) return { ok: false, msg: 'ID 已存在：' + id };
    if (!o.q || !String(o.q).trim()) return { ok: false, msg: '题干不能为空' };
    if (!o.a || String(o.a).trim().length < 10) return { ok: false, msg: '答案至少 10 字' };
    var cid = o.cat || 'custom';
    if (!cat(cid)) {
      S.custom.cats = S.custom.cats || [];
      S.custom.cats.push({ id: cid, name: o.catName || '我的题库', badge: String(o.catName || '我').slice(0, 2), color: '#8A6D3B', desc: '自建题目' });
    }
    S.custom.q = S.custom.q || [];
    S.custom.q.push({
      id: id, category: cid, q: String(o.q).trim(), a: String(o.a || ''),
      d: clampInt(o.d, 1, 5, 3), f: normFreq(o.f), t: normTags(o.t), r: []
    });
    initBank(); save(); emit({ t: 'bank' });
    return { ok: true, id: id };
  }

  function removeCustom(id) {
    if (!S.custom.q) return false;
    var n = S.custom.q.length;
    S.custom.q = S.custom.q.filter(function (q) { return q.id !== id; });
    if (S.custom.q.length === n) return false;
    delete S.progress[id]; delete S.wrong[id]; delete S.notes[id];
    var i = S.fav.indexOf(id); if (i >= 0) S.fav.splice(i, 1);
    initBank(); save(); emit({ t: 'bank' });
    return true;
  }

  /* ---------------------------- init ---------------------------- */
  load();
  initBank();
  applyTheme();
  if (global.matchMedia) {
    try {
      global.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
        if (S.settings.theme === 'auto') applyTheme();
      });
    } catch (e) { /* Safari 旧版 */ }
  }

  global.Store = {
    backend: backend, INTERVAL_MIN: INTERVAL_MIN, MAX_BOX: MAX_BOX,
    remoteBank: remoteBank, loadRemote: loadRemote, saveRemoteBank: saveRemoteBank, clearRemoteBank: clearRemoteBank,
    get raw() { return S; },
    cats: cats, cat: cat, all: all, get: get, count: count, byCat: byCat,
    tracks: tracks, track: track, catsByTrack: catsByTrack, trackStats: trackStats,
    activeTrack: activeTrack, setTrack: setTrack, trackQuestions: trackQuestions,
    allTags: allTags, related: related, sibling: sibling,
    prog: prog, stateOf: stateOf, isMastered: isMastered, isSeen: isSeen,
    grade: grade, markSeen: markSeen,
    wrongList: wrongList, clearWrong: clearWrong,
    isFav: isFav, toggleFav: toggleFav, favList: favList,
    note: note, setNote: setNote, noteList: noteList,
    dueList: dueList, freshList: freshList, unmastered: unmastered,
    daily: daily, dailyDone: dailyDone, dailyProgress: dailyProgress, ensureDaily: ensureDaily,
    dateKey: dateKey, checkIn: checkIn, isTodayChecked: isTodayChecked,
    catStats: catStats, stats: stats, heatmap: heatmap, search: search, snippet: snippet,
    settings: settings, setSetting: setSetting, applyTheme: applyTheme,
    exportData: exportData, importData: importData, resetProgress: resetProgress,
    addCustomQuestion: addCustomQuestion, removeCustom: removeCustom,
    save: save, onChange: onChange, reload: function () { load(); initBank(); emit({ t: 'reload' }); }
  };
})(window);
