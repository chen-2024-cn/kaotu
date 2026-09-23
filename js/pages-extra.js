/* =====================================================================
 * pages-extra.js —— 全局搜索 / 工具箱 / 学习统计 / 我的 / 数据备份 / 出题器 / 指南
 * ===================================================================== */
(function (global) {
  'use strict';
  var el = UI.el, icon = UI.icon, clear = UI.clear, sheet = UI.sheet;

  /* ========================= 全局搜索 ========================= */
  Pages.search = function (ctx) {
    var q0 = ctx.query || {};
    var state = { kw: q0.q || '', cat: '', tag: q0.t || '' };
    var listBox = el('div.list-box');
    var hot = el('div.hot-row');
    var input = el('input.search-input', {
      type: 'search', placeholder: state.tag ? ('标签「' + state.tag + '」内搜索…') : '搜索题干、答案、标签…（空格分隔 = 同时满足）',
      value: state.kw, enterkeyhint: 'search', autocomplete: 'off'
    });

    // 历史词（本地）
    var HIST_KEY = 'bagutong.searchhist';
    function hist() {
      try { return JSON.parse(localStorage.getItem(HIST_KEY) || '[]'); } catch (e) { return []; }
    }
    function pushHist(w) {
      if (!w) return;
      var a = hist().filter(function (x) { return x !== w; });
      a.unshift(w);
      try { localStorage.setItem(HIST_KEY, JSON.stringify(a.slice(0, 12))); } catch (e) { }
    }

    var HOT_WORDS = ['HashMap', 'MVCC', 'synchronized', '线程池', '索引失效', 'B+树',
      '循环依赖', '自动配置', '缓存穿透', '三次握手', '秒杀', 'volatile', '事务失效', 'AQS'];

    function renderHot() {
      clear(hot);
      var h = hist();
      if (h.length) {
        hot.appendChild(el('div.hot-lb', '最近搜索'));
        hot.appendChild(el('div.hot-chips', h.slice(0, 8).map(function (w) {
          return el('button.hot-i', { onclick: function () { state.kw = w; input.value = w; run(); } }, w);
        })));
      }
      hot.appendChild(el('div.hot-lb', '高频考点'));
      hot.appendChild(el('div.hot-chips', HOT_WORDS.map(function (w) {
        return el('button.hot-i.hi', { onclick: function () { state.kw = w; input.value = w; run(); } }, w);
      })));
    }

    var catBar = el('div.chips.scrolly');
    function renderCatBar() {
      clear(catBar);
      catBar.appendChild(el('button.chip-btn' + (state.cat === '' ? '.on' : ''), { onclick: function () { setCat(''); } }, '全部分类'));
      Store.cats().filter(function (c) { return Store.byCat(c.id).length; }).forEach(function (c) {
        catBar.appendChild(el('button.chip-btn' + (state.cat === c.id ? '.on' : ''), {
          onclick: function () { setCat(c.id); }
        }, [c.name, el('i', String(Store.byCat(c.id).length))]));
      });
    }
    function setCat(id) { state.cat = id; renderCatBar(); run(); }

    var stat = el('div.search-stat');

    function run() {
      var kw = state.kw.trim();
      clear(listBox); clear(stat);
      if (!kw && !state.tag) {
        hot.hidden = false;
        renderHot();
        listBox.appendChild(el('div.empty.soft', [icon('search'), el('p', '输入关键词开始搜索'), el('p.hint', '多关键词用空格分隔，例如「索引 最左前缀」；支持搜答案正文')]));
        return;
      }
      hot.hidden = true;
      var t0 = performance.now();
      var searchKw = kw || (state.tag || '的');   // 纯标签浏览：用必中字符占位，靠 tag 过滤
      var res = Store.search(searchKw, { cat: state.cat, tag: state.tag, limit: 200 });
      if (!kw && state.tag) res = res.filter(function (r) { return r.q.t.indexOf(state.tag) >= 0; });
      var cost = (performance.now() - t0).toFixed(1);
      if (kw) pushHist(kw);
      stat.appendChild(el('div.sstat', [
        el('b', String(res.length)), el('span', ' 条结果'),
        state.tag ? el('span.tag-pill', '#' + state.tag) : null,
        el('i', '耗时 ' + cost + 'ms'),
        res.length > 50 ? el('span.trim', '（仅显示前 50 条，请补充关键词）') : null
      ]));
      if (!res.length) {
        listBox.appendChild(App.empty('search', (kw ? '没有找到「' + kw + '」相关的题目' : '标签「#' + state.tag + '」下没有题目'), [
          el('p.hint', '试试更短的关键词，或去掉筛选'),
          el('button.btn.ghost.sm', { onclick: function () { state.cat = ''; state.tag = ''; renderCatBar(); App.go('/search' + (kw ? '?q=' + encodeURIComponent(kw) : '')); } }, '清除筛选')
        ]));
        return;
      }
      res.slice(0, 50).forEach(function (r, i) {
        var titleHtml = MD.esc(r.q.q);
        var snipHtml = MD.esc(r.snippet || MD.digest(r.q.a));
        listBox.appendChild(App.qItem(r.q, {
          index: i + 1,
          htmlTitle: titleHtml,
          snippet: '<span class="snip">' + snipHtml + '</span>',
          extra: el('span.chip', App.freqText(r.q.f)),
          right: el('span.q-right', [
            Store.isMastered(r.q.id) ? el('span.okd', icon('check')) : null,
            el('span.q-arrow', icon('right'))
          ])
        }));
      });
      // 命中词高亮
      var words = kw ? kw.split(/\s+/).filter(function (w) { return w.length > 0; }) : [];
      var hits = words.length ? MD.highlight(listBox, words) : 0;
      var hs = stat.querySelector('.sstat');
      if (hs && hits) hs.appendChild(el('i', '· 命中 ' + hits + ' 处'));
    }

    var tmr = null;
    input.addEventListener('input', function () {
      state.kw = this.value;
      clearTimeout(tmr);
      tmr = setTimeout(run, 180);
    });
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { clearTimeout(tmr); run(); this.blur(); } });

    renderCatBar(); run();
    return {
      node: el('div.page', [
        el('div.search-bar', [input,
        el('button.icon-btn', { ariaLabel: '清空', onclick: function () { state.kw = ''; input.value = ''; input.focus(); run(); } }, icon('close'))]),
        catBar, stat, hot, listBox
      ]),
      title: '全局搜索', sub: Store.count() + ' 道题内检索', back: true, tabId: 'tools',
      onMount: function () { if (!state.kw) setTimeout(function () { input.focus(); }, 200); }
    };
  };

  /* ========================= 工具箱 ========================= */
  Pages.tools = function () {
    var st = Store.stats();
    var groups = [
      {
        name: '练习与复习', items: [
          { icon: 'zap', label: '随机刷题', desc: '随机抽题，覆盖全部分类', href: '/quiz?mode=random&n=20' },
          { icon: 'clock', label: '到期复习', desc: st.due ? st.due + ' 道题按曲线到期了' : '暂无到期任务', href: '/quiz?mode=due', badge: st.due },
          { icon: 'target', label: '自测模式', desc: '隐藏答案抽 10 题，结束出分', href: '/quiz?mode=test&n=10' },
          { icon: 'brain', label: '背诵模式', desc: '翻卡片练口述，像抽单词卡', href: '/recall' },
          { icon: 'wrong', label: '错题本', desc: st.wrong ? st.wrong + ' 题待攻克' : '空的，很好', href: '/wrong', badge: st.wrong }
        ]
      },
      {
        name: '我的内容', items: [
          { icon: 'star', label: '收藏夹', desc: st.fav ? st.fav + ' 道精选题' : '星标你关心的题', href: '/fav', badge: st.fav },
          { icon: 'note', label: '我的笔记', desc: st.notes ? st.notes + ' 条自己的理解' : '用自己的话复述一遍', href: '/notes', badge: st.notes },
          { icon: 'list', label: '标签地图', desc: '按知识标签横向串联', href: '/tags' }
        ]
      },
      {
        name: '效率工具', items: [
          { icon: 'search', label: '全局搜索', desc: '题干、答案、标签全文检索', href: '/search' },
          { icon: 'chart', label: '学习统计', desc: '热力图、掌握度雷达、频率分布', href: '/stats' },
          { icon: 'plus', label: '自建题目', desc: '把自己被问住的题加进来', href: '/add' },
          { icon: 'info', label: '使用指南', desc: '怎么背最有效、快捷键、扩充题库', href: '/guide' }
        ]
      }
    ];

    var node = el('div.page', [
      el('div.tool-hero', [
        el('div.th-l', [
          el('div.th-t', '工具箱'),
          el('div.th-s', '把碎片时间变成 offer 的一部分')
        ]),
        el('div.th-r', [
          el('div.th-n', [el('b', String(st.mastered)), el('i', '/' + st.total)]),
          el('div.th-lb', '已掌握')
        ])
      ]),
      el('div.quick-4', [
        quickStat('连续打卡', st.streak + ' 天', 'flame'),
        quickStat('今日行为', String(st.today), 'zap'),
        quickStat('待复习', String(st.due), 'clock'),
        quickStat('错题', String(st.wrong), 'wrong')
      ])
    ].concat(groups.map(function (g) {
      return el('section.tool-sec', [
        el('h3.sec-t', g.name),
        el('div.tool-list', g.items.map(function (it) {
          return el('a.tool-i', { href: '#' + it.href, onclick: function () { UI.buzz(6); } }, [
            el('span.ti-ic', icon(it.icon)),
            el('div.ti-m', [
              el('div.ti-l', [it.label, it.badge ? el('span.ti-badge', String(it.badge)) : null]),
              el('div.ti-d', it.desc)
            ]),
            el('span.ti-go', icon('right'))
          ]);
        }))
      ]);
    })));

    return { node: node, title: '工具箱', sub: Store.count() + ' 题在手', back: false, tabId: 'tools' };

    function quickStat(label, value, ic) {
      return el('div.qs', [el('span.qs-ic', icon(ic)), el('div.qs-m', [el('b', value), el('i', label)])]);
    }
  };

  /* ========================= 学习统计 ========================= */
  Pages.stats = function () {
    var st = Store.stats();
    var hm = Store.heatmap(126);
    var max = 1;
    hm.forEach(function (d) { if (d.n > max) max = d.n; });

    // 热力图（18周 × 7天）
    var weeks = [];
    var first = hm[0];
    if (first) {
      var start = new Date(first.date);
      start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); // 对齐周一
      var byKey = {}; hm.forEach(function (d) { byKey[d.key] = d.n; });
      var total = hm.length;
      var wi = 0, di = 0;
      // 从 start 到 hm 最后一天
      var cursor = new Date(start);
      var end = new Date(hm[hm.length - 1].date);
      while (cursor <= end) {
        if (di === 0) weeks.push([]);
        var k = Store.dateKey(cursor);
        weeks[wi].push({ key: k, n: byKey[k] || 0, past: cursor <= end && k >= hm[0].key });
        cursor.setDate(cursor.getDate() + 1);
        di = (di + 1) % 7;
        if (di === 0) wi++;
      }
    }

    var heat = el('div.heat', weeks.map(function (w) {
      return el('div.hweek', w.map(function (d) {
        var lv = d.n === 0 ? 0 : d.n <= 2 ? 1 : d.n <= 5 ? 2 : d.n <= 12 ? 3 : 4;
        return el('span.hcell.l' + lv, { title: d.key + '：' + d.n + ' 次学习' });
      }));
    }));

    // 各分类掌握度（雷达用条形替代更清晰，同时给雷达 SVG）
    var cats = Store.cats().filter(function (c) { return Store.byCat(c.id).length; });
    // 雷达标签用短名：badge 优先；跨赛道重名（如 CET-6/CET-4 的「听力」）加赛道前缀消歧义
    var seen = {};
    cats.forEach(function (c) { var b = c.badge || c.name.slice(0, 2); seen[b] = (seen[b] || 0) + 1; });
    var radar = radarChart(cats.map(function (c) {
      var b = c.badge || c.name.slice(0, 2);
      var trk = Store.track(c.track);
      return {
        label: seen[b] > 1 && trk ? trk.short + b : b,
        full: c.name, value: Store.catStats(c.id).pct, color: c.color
      };
    }));

    var bars = el('div.bars', cats.map(function (c) {
      var cs = Store.catStats(c.id);
      return el('a.bar-row', { href: '#/c/' + c.id }, [
        el('span.br-n', c.name),
        el('span.br-bar', [
          el('i.br-ok', { style: { width: cs.pct + '%', background: c.color } }),
          el('i.br-seen', { style: { width: Math.max(0, cs.seenPct - cs.pct) + '%', background: c.color, opacity: .3 } })
        ]),
        el('span.br-v', cs.mastered + '/' + cs.total)
      ]);
    }));

    // 频率分布
    var fr = { high: 0, mid: 0, low: 0 }, ok = { high: 0, mid: 0, low: 0 };
    Store.all().forEach(function (q) { fr[q.f]++; if (Store.isMastered(q.id)) ok[q.f]++; });
    var frRows = [['high', '高频', '🔥'], ['mid', '中频', '·'], ['low', '低频', '。']].map(function (f) {
      var tot = fr[f[0]] || 0, done = ok[f[0]] || 0;
      var pct = tot ? Math.round(done / tot * 100) : 0;
      return el('div.fr-row', [
        el('span.fr-n', f[1]),
        el('span.fr-bar', el('i', { style: { width: pct + '%' } })),
        el('span.fr-v', done + '/' + tot + ' · ' + pct + '%')
      ]);
    });

    var node = el('div.page', [
      el('div.stat-grid', [
        statCard('总进度', st.pct + '%', st.mastered + ' / ' + st.total + ' 题掌握', 'target'),
        statCard('连续打卡', st.streak + ' 天', '最佳 ' + st.best + ' 天', 'flame'),
        statCard('学习行为', String(st.actions), '累计操作次数', 'zap'),
        statCard('待复习', String(st.due), '按记忆曲线到期', 'clock'),
        statCard('错题', String(st.wrong), '连对 2 次自动移出', 'wrong'),
        statCard('笔记与收藏', String(st.notes + st.fav), st.notes + ' 条笔记 · ' + st.fav + ' 道收藏', 'note')
      ]),

      el('section.card-block', [
        el('h3.cb-t', [icon('clock'), '学习热力图']),
        el('p.cb-s', '最近 18 周。颜色越深代表当天学习行为越多，断更一眼就能看出来。'),
        heat,
        el('div.heat-legend', [el('span', '少'),
        el('span.hcell.l0'), el('span.hcell.l1'), el('span.hcell.l2'), el('span.hcell.l3'), el('span.hcell.l4'),
        el('span', '多')])
      ]),

      el('section.card-block', [
        el('h3.cb-t', [icon('chart'), '各分类掌握度雷达']),
        el('p.cb-s', '短板一目了然——面试前优先补最低的三个角。'),
        radar
      ]),

      el('section.card-block', [
        el('h3.cb-t', [icon('layers'), '分类明细']),
        el('p.cb-s', '浅色部分表示「读过但未掌握」，深色表示「已掌握」。'),
        bars
      ]),

      el('section.card-block', [
        el('h3.cb-t', [icon('zap'), '按面试频率的掌握情况']),
        el('p.cb-s', '高频题没掌握是最危险的，优先清掉。'),
        frRows,
        fr.high - ok.high > 0 ? el('button.btn.ghost.sm', {
          onclick: function () {
            var arr = Store.all().filter(function (q) { return q.f === 'high' && !Store.isMastered(q.id); });
            if (!arr.length) return UI.toast('高频题已全部掌握 🎉', 'ok');
            // 直接跳到随机刷题（高频由排序保证）
            App.go('/quiz?mode=test&n=' + Math.min(20, arr.length));
          }
        }, [icon('target'), '专攻未掌握的高频题']) : null
      ]),

      st.mastered ? el('p.foot-note', '继续保持：每天 ' + (Store.settings().goal || 10) + ' 题，' +
        Math.max(1, Math.ceil((st.total - st.mastered) / (Store.settings().goal || 10))) + ' 天可过完整个题库') : null
    ]);

    return { node: node, title: '学习统计', sub: '总进度 ' + st.pct + '%', back: true, tabId: 'tools' };

    function statCard(t, v, s, ic) {
      return el('div.stat-card', [
        el('span.sc-ic', icon(ic)),
        el('div.sc-m', [el('b', v), el('i', t), el('span', s)])
      ]);
    }
  };

  /** SVG 掌握度雷达图 */
  function radarChart(items) {
    var n = items.length;
    if (n < 3) return el('p.hint', '分类数不足，无法绘制雷达图');
    // 分类多时加大画布；viewBox 横向外扩，容纳左右两侧外伸的标签文字
    var dense = n > 16;
    var size = dense ? 400 : 300, cx = size / 2, cy = size / 2, R = size / 2 - (dense ? 56 : 44);
    var pad = dense ? 46 : 24;
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', (-pad) + ' 0 ' + (size + pad * 2) + ' ' + size);
    svg.setAttribute('class', 'radar');
    function pt(i, r) {
      var ang = -Math.PI / 2 + i * 2 * Math.PI / n;
      return [cx + Math.cos(ang) * r, cy + Math.sin(ang) * r];
    }
    function poly(arr) { return arr.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' '); }
    // 网格
    [0.25, 0.5, 0.75, 1].forEach(function (f) {
      var g = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      g.setAttribute('points', poly(items.map(function (_, i) { return pt(i, R * f); })));
      g.setAttribute('class', 'rgrid');
      svg.appendChild(g);
    });
    items.forEach(function (_, i) {
      var p = pt(i, R), l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      l.setAttribute('x1', cx); l.setAttribute('y1', cy);
      l.setAttribute('x2', p[0]); l.setAttribute('y2', p[1]);
      l.setAttribute('class', 'rline');
      svg.appendChild(l);
    });
    // 数据面
    var data = items.map(function (it, i) { return pt(i, R * Math.max(0.03, (it.value || 0) / 100)); });
    var area = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    area.setAttribute('points', poly(data));
    area.setAttribute('class', 'rarea');
    svg.appendChild(area);
    items.forEach(function (it, i) {
      var p = data[i], c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('cx', p[0]); c.setAttribute('cy', p[1]); c.setAttribute('r', 3);
      c.setAttribute('fill', it.color || '#2F6F5E');
      svg.appendChild(c);
      // 标签：分类少时直接写名字；密集（>16）时顶点只标序号，名字交给图例，彻底避免标签互相压盖
      var lp = pt(i, R + (dense ? 13 : 20));
      var t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      t.setAttribute('x', lp[0]); t.setAttribute('y', lp[1]);
      t.setAttribute('class', 'rlabel');
      if (dense) { t.setAttribute('font-size', '8.5'); t.setAttribute('text-anchor', 'middle'); }
      else t.setAttribute('text-anchor', lp[0] < cx - 6 ? 'end' : lp[0] > cx + 6 ? 'start' : 'middle');
      var ttl = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      ttl.textContent = (it.full || it.label) + ' ' + it.value + '%';
      t.appendChild(ttl);
      t.appendChild(document.createTextNode(dense ? String(i + 1) : it.label + ' ' + it.value + '%'));
      svg.appendChild(t);
    });
    // 密集模式：图例承担命名职责（序号 + 全名 + 掌握率），色点与顶点颜色一致
    var legend = dense ? el('div.radar-legend', items.map(function (it, i) {
      return el('span.rl-i', [
        el('i', { style: { background: it.color || '#2F6F5E' } }),
        (i + 1) + ' ' + (it.full || it.label) + ' ' + it.value + '%'
      ]);
    })) : null;
    var holder = el('div.radar-holder', [svg, legend]);
    return holder;
  }

  /* ========================= 我的 ========================= */
  Pages.me = function () {
    var st = Store.stats();
    var s = Store.settings();
    var t = Store.track(Store.activeTrack()) || { name: '学习', color: '#2F6F5E' };
    var ts = Store.trackStats(Store.activeTrack());
    var node = el('div.page', [
      el('div.me-hero', {
        style: { background: 'linear-gradient(135deg,' + t.color + ' 0%,' + t.color + 'cc 100%)' }
      }, [
        el('div.mh-av', '🎯'),
        el('div.mh-m', [
          el('div.mh-t', t.name + ' · ' + (st.streak ? '坚持中' : '已就绪')),
          el('div.mh-s', st.streak ? ('已连续打卡 ' + st.streak + ' 天 · 本赛道掌握 ' + ts.mastered + '/' + ts.total + ' 题') : '选一个赛道，开始第一天')
        ]),
        App.ring(ts.pct || st.pct, 56)
      ]),

      el('div.me-stats', [
        ms('掌握', st.mastered), ms('收藏', st.fav), ms('错题', st.wrong), ms('笔记', st.notes), ms('累计行为', st.actions)
      ]),

      el('section.card-block', [
        el('h3.cb-t', [icon('layers'), '工具']),
        el('div.me-links', [
          ml('search', '全局搜索 · 题干答案标签全文检索', '/search'),
          ml('chart', '学习统计 · 热力图与掌握度', '/stats'),
          ml('note', '我的笔记 · 导出 Markdown', '/notes'),
          ml('star', '收藏夹 · 导出精选面经', '/fav'),
          ml('wrong', '错题本 · 复盘自评不会的题', '/wrong'),
          ml('plus', '自建题目 · 记录被问住的题', '/add'),
          ml('info', '使用指南与学习建议', '/guide')
        ])
      ]),

      el('section.card-block', [
        el('h3.cb-t', [icon('settings'), '阅读偏好']),
        el('div.set-row', [
          el('span.set-l', [icon('moon'), '主题']),
          el('div.seg', [
            ['auto', '跟随系统'], ['light', '浅色'], ['dark', '深色']
          ].map(function (o) {
            return el('button.seg-i' + (s.theme === o[0] ? '.on' : ''), {
              onclick: function () { Store.setSetting('theme', o[0]); App.render(); UI.toast('主题：' + o[1], 'ok', 900); }
            }, o[1]);
          }))
        ]),
        el('div.set-row', [
          el('span.set-l', [icon('book'), '字号 ' + Math.round(s.font * 100) + '%']),
          el('input.range', { type: 'range', min: '0.9', max: '1.35', step: '0.05', value: String(s.font), oninput: function () { applyFont(this.value); } })
        ]),
        el('div.set-row', [
          el('span.set-l', [icon('zap'), '每日目标']),
          el('div.chips', [5, 10, 15, 20, 30].map(function (n) {
            return el('button.chip-btn' + (Number(s.goal) === n ? '.on' : ''), {
              onclick: function () { Store.setSetting('goal', n); delete Store.raw.daily[Store.dateKey()]; Store.save(); App.render(); UI.toast('每日目标已设为 ' + n + ' 题', 'ok'); }
            }, n + ' 题');
          }))
        ]),
        el('div.set-row', [
          el('span.set-l', [icon('eye'), '答案默认折叠']),
          switchBox('hideUntilTap', s.hideUntilTap, '关掉后进阅读页直接显示答案')
        ]),
        el('div.set-row', [
          el('span.set-l', [icon('right'), '评级后自动下一题']),
          switchBox('autoNext', s.autoNext !== false, '刷题/背诵时连点更顺手')
        ]),
        el('p.set-tip', '字号与主题实时生效；答案默认折叠是为了强制你先自己想一遍——这一步省不掉。')
      ]),

      el('section.card-block', [
        el('h3.cb-t', [icon('import'), '数据']),
        buildDownloadCard()
      ]),

      el('section.card-block', [
        el('h3.cb-t', [icon('info'), '关于']),
        el('div.about', [
          ['题库规模', Store.count() + ' 道题 · ' + Store.cats().filter(function (c) { return Store.byCat(c.id).length; }).length + ' 个分类 · ' + Store.tracks().length + ' 大赛道'],
          ['存储方式', Store.backend === 'local' ? 'localStorage（本机持久化）' : '内存模式（当前环境不支持持久化）'],
          ['运行模式', App.isStandalone() ? '已安装为独立应用' : (location.protocol === 'file:' ? '本地文件模式（file://）' : '浏览器模式 · ' + location.host)],
          ['网络依赖', '离线可用；在线同步仅在主动检查时联网'],
          ['版本', 'v2.3.6']
        ].map(function (r) { return el('div.ab-row', [el('b', r[0]), el('span', r[1])]); }))
      ]),

      el('div.danger-zone', [
        el('button.btn.ghost.danger-text.sm', {
          onclick: function () {
            UI.confirm({
              title: '重置全部学习进度？', text: '将清空进度、错题、收藏、笔记与打卡记录。自建题库与下载的在线题库会保留。', danger: true, okText: '我确定，重置'
            }).then(function (ok) {
              if (!ok) return;
              Store.resetProgress();
              UI.toast('已重置到全新状态', 'ok');
              App.go('/home');
              App.render();
            });
          }
        }, [icon('trash'), '重置学习进度'])
      ]),
      el('p.foot-note', '「考途」· 离线学习工具 · 数据只存在你自己的设备上')
    ]);

    function ms(l, v) { return el('div.ms', [el('b', String(v)), el('i', l)]); }
    function ml(ic, label, href) { return el('a.me-link', { href: '#' + href }, [el('span.ml-ic', icon(ic)), el('span.ml-l', label), el('span.ml-go', icon('right'))]); }
    function switchBox(key, val, tip) {
      return el('label.switch', { title: tip || '' }, [
        el('input', { type: 'checkbox', checked: !!val, onchange: function () { Store.setSetting(key, this.checked); UI.toast('已' + (this.checked ? '开启' : '关闭'), 'ok', 900); } }),
        el('span.sl')
      ]);
    }
    function applyFont(v) {
      v = Math.max(0.9, Math.min(1.35, parseFloat(v) || 1));
      document.documentElement.style.setProperty('--font-scale', String(v));
      Store.setSetting('font', v);
    }

    // 数据卡：只保留「一键下载在线题库」。同源(http)直接连本站 API；
    // file:// 的 APK/单文件版无法同源，用打包时注入的默认公网地址兜底，
    // 并允许就地修改服务器地址（域名变更时无需重新打包）。
    function buildDownloadCard() {
      // 单文件版/APK 打包时已把服务器地址注入 settings.syncUrl（见 make_single_file.py），
      // 这里的常量仅作 file:// 极端兜底与输入框占位；同源(http)模式地址由页面域名决定。
      // 占位符 __PUBLIC_API__ 由打包器（make_single_file.py / build_apk.py）从本机 .public_api 注入；
      // 真实公网域名永不写进源码仓库（安全红线）。
      var DEFAULT_API = '__PUBLIC_API__';
      var isFile = location.protocol === 'file:';
      var info = Sync.state();

      var urlInput = el('input.inp', {
        placeholder: DEFAULT_API,
        value: (Store.settings().syncUrl || ''),
        disabled: !isFile   // 同源模式地址由页面域名决定，无需也不应手填
      });
      var statusLine = el('div.sync-status');
      var label = el('span', '立即从服务器下载');
      var btn = el('button.btn.primary', { onclick: doDownload }, [icon('refresh'), label]);

      function renderStatus(msg, cls) {
        clear(statusLine);
        var local = Store.remoteBank();
        statusLine.appendChild(el('div.ss-row', [
          el('span.ss-k', '当前题库'),
          el('span.ss-v', local
            ? ('在线版 · ' + local.bank.questions.length + ' 题 · 版本 ' + (local.version || '?'))
            : ('内置版 · ' + Store.count() + ' 题'))
        ]));
        statusLine.appendChild(el('div.ss-row', [
          el('span.ss-k', '服务器'),
          el('span.ss-v', info.remoteVersion ? ('版本 ' + info.remoteVersion) : '（未检查）')
        ]));
        statusLine.appendChild(el('div.ss-row', [
          el('span.ss-k', '上次下载'),
          el('span.ss-v', info.lastCheck ? UI.ago(info.lastCheck) : '从未')
        ]));
        if (msg) statusLine.appendChild(el('div.ss-msg.' + (cls || 'info'), msg));
        else if (info.lastError) statusLine.appendChild(el('div.ss-msg.err', '上次失败：' + info.lastError));
      }

      function doDownload() {
        if (isFile) Sync.setSyncUrl(urlInput.value || DEFAULT_API);   // file:// 下保存/兜底地址
        btn.disabled = true;
        label.textContent = '正在从服务器下载…';
        Sync.sync({ force: true, silent: true }).then(function (r) {
          btn.disabled = false;
          label.textContent = '立即从服务器下载';
          info = Sync.state();
          if (r.status === 'updated') {
            renderStatus('🎉 已更新到 ' + r.to + '（' + r.questions + ' 题）', 'ok');
            UI.toast('题库已更新（' + r.questions + ' 题），即将刷新', 'ok', 2600);
            setTimeout(function () { App.render(); }, 900);
          } else if (r.status === 'same') {
            renderStatus('✓ 已是最新版本 ' + r.serverVersion + '（' + r.questions + ' 题）', 'ok');
            UI.toast('题库已是最新（' + r.questions + ' 题）', 'ok', 2000);
          } else if (r.status === 'disabled') {
            renderStatus(r.msg, 'err');
          } else {
            renderStatus(((r.status === 'offline' || r.status === 'timeout') ? '连不上服务器：' : '下载失败：') + (r.msg || ''), 'err');
            UI.toast('连不上题库服务器，可继续用本地题库', 'warn', 3000);
          }
        });
      }

      renderStatus();
      return el('div.online-dl', [
        el('div.od-t', [icon('down'), '一键下载在线题库']),
        el('p.od-s', '从服务器拉取全部题库到本机（含在线扩充的四级/六级/考研完整词库），下载后离线也能用；学习进度只存本机、不会被覆盖。'),
        isFile ? el('div.set-row', [el('span.set-l', [icon('link'), '服务器']), urlInput]) : null,
        btn,
        statusLine
      ]);
    }

    return { node: node, title: '我的', sub: t.name + ' · ' + ts.pct + '% 掌握', back: false };
  };

  /* ========================= 自建题目（出题器） ========================= */
  Pages.add = function () {
    var cats = Store.cats();
    var fCat = el('select.sel'), fId = el('input.inp', { placeholder: '留空则自动生成，如 my-xxxxx' }),
      fQ = el('textarea.ta-sm', { placeholder: '例：ThreadPoolExecutor 的核心线程会被回收吗？', rows: '2' }),
      fA = el('textarea.ta-md', { placeholder: '支持 Markdown：\n\n## 一句话结论\n\n……\n\n## 原理\n\n1. ……\n\n```java\n// 代码\n```\n\n## 面试追问\n\n- ……', rows: '14' }),
      fD = el('input.inp', { type: 'number', min: '1', max: '5', value: '3' }),
      fF = el('select.sel'), fT = el('input.inp', { placeholder: '逗号分隔，如：线程池,JUC' });
    cats.forEach(function (c) {
      var trk = Store.track(c.track);
      var nm = trk ? trk.short + ' · ' + c.name : c.name;   // 同名分类（如 CET-6/CET-4 的听力技巧）加赛道前缀消歧义
      fCat.appendChild(el('option', { value: c.id }, nm));
    });
    [['high', '高频'], ['mid', '中频'], ['low', '低频']].forEach(function (o) { fF.appendChild(el('option', { value: o[0] }, o[1])); });
    var preview = el('article.md.prev');

    var previewBtn = el('button.btn.ghost.sm', {
      onclick: function () {
        preview.innerHTML = fA.value.trim() ? MD.render(fA.value).html : '<p class="hint">先在答案框写点内容</p>';
        preview.hidden = !preview.hidden;
        this.textContent = preview.hidden ? '预览渲染效果' : '收起预览';
      }
    }, '预览渲染效果');
    preview.hidden = true;

    var saveBtn = el('button.btn.primary', { onclick: save }, [icon('check'), '保存到我的题库']);

    function save() {
      var r = Store.addCustomQuestion({
        id: fId.value.trim(), cat: fCat.value, q: fQ.value, a: fA.value,
        d: fD.value, f: fF.value, t: fT.value
      });
      if (!r.ok) { UI.toast(r.msg, 'err', 3000); return; }
      UI.toast('已保存：' + r.id, 'ok');
      UI.buzz(15);
      refreshList();   // 保存后立即刷新「我建的题」列表（此前只在进页时构建一次）
      fQ.value = ''; fA.value = ''; fT.value = ''; fId.value = '';
      preview.innerHTML = ''; preview.hidden = true; previewBtn.textContent = '预览渲染效果';
      fQ.focus();
      UI.confirm({ title: '去看一眼这道题？', text: '保存成功，可以立即阅读并评级，也可继续录入下一题。', okText: '立即查看', cancelText: '继续录题' }).then(function (ok) {
        if (ok) App.go('/q/' + r.id);
      });
    }

    // 列表容器：保存/删除后局部重绘，避免整页 render() 打断连续录题的表单焦点
    var listBox = el('section.card-block');
    function refreshList() {
      clear(listBox);
      var arr = (Store.raw.custom.q || []).slice();
      listBox.appendChild(el('h3.cb-t', [icon('list'), '我建的题（' + arr.length + '）']));
      listBox.appendChild(arr.length ? el('div.list-box.tight', arr.map(function (q) {
        var item = Store.get(q.id);
        return el('div.fav-row', [
          App.qItem(item || { id: q.id, q: q.q, cat: q.category, catName: q.category, color: '#8A6D3B', t: q.t || [], f: q.f, d: q.d }),
          el('button.mini-btn.danger', {
            title: '删除', onclick: function () {
              UI.confirm({ title: '删除这道自建题？', text: q.q, danger: true, okText: '删除' }).then(function (ok) {
                if (!ok) return;
                Store.removeCustom(q.id); UI.toast('已删除', 'ok'); refreshList();
              });
            }
          }, icon('trash'))
        ]);
      })) : el('p.hint', '还没有自建题目'));
    }
    refreshList();

    var el2 = el('div.page', [
      el('div.page-head', [
        el('h2', '自建题目'),
        el('p.sub', '面试被问住、面经看到的题，随手记进来，和内置题库一样享受复习曲线、错题本、笔记。')
      ]),
      el('section.card-block', [
        el('div.set-row.col', [
          label('所属分类'), fCat,
          label('题干 *'), fQ,
          el('div.row.between', [label('答案（Markdown）*'), previewBtn]),
          fA, preview,
          el('div.row.gap', [
            el('div.grow', [label('难度 1~5'), fD]),
            el('div.grow', [label('出现频率'), fF])
          ]),
          label('标签（逗号分隔）'), fT,
          label('题目 ID（选填，留空自动生成）'), fId,
          saveBtn
        ])
      ]),
      el('section.card-block', [
        el('h3.cb-t', [icon('info'), '写作建议']),
        el('ul.ml', [
          el('li', '答案第一句一定是「一句话结论」——面试时先抛结论，再展开原理，这是加分项'),
          el('li', '把面试官的追问也记进「面试追问」小节，下次不会被同一问题二次击穿'),
          el('li', '用自己的话写，不要复制标准答案；写不出来说明还没真懂')
        ])
      ]),
      listBox
    ]);

    function label(t) { return el('label.fld-l', t); }
    return { node: el2, title: '自建题目', sub: '把被问住的题收进来', back: true, tabId: 'tools' };
  };

  /* ========================= 使用指南 ========================= */
  Pages.guide = function () {
    var st = Store.stats();
    var node = el('div.page', [
      el('div.page-head', [el('h2', '使用指南'), el('p.sub', '三分钟看完，把 App 用出最大价值')]),

      el('section.card-block', [
        el('h3.cb-t', [icon('zap'), '推荐学习节奏']),
        el('div.steps', [
          step(1, '扫盲', '在知识地图挑一个分类，按「顺序」把题目读一遍答案，读到能说出「一句话结论」为止'),
          step(2, '自评', '读完后立刻点「记住 / 模糊 / 不会」——系统按艾宾浩斯曲线（8分钟/1天/2天/4天/7天/15天/30天）安排复习'),
          step(3, '复盘', '「不会」的题自动进错题本，当天必须回来再看一次；连对 2 次自动移出'),
          step(4, '口述', '用背诵模式翻卡片练口头表达。面试是说出来，不是认出来'),
          step(5, '沉淀', '把关键题写上自己的笔记，导出 Markdown 就是你的专属面经')
        ])
      ]),

      el('section.card-block', [
        el('h3.cb-t', [icon('brain'), '记忆算法说明']),
        el('p.cb-s', '每道题有 0~7 级记忆盒。评级决定升级速度与下次复习时间：'),
        el('div.twrap', el('table.mtbl', [
          el('thead', el('tr', ['你的评级', '记忆盒变化', '下次复习'].map(function (h) { return el('th', h); }))),
          el('tbody', [
            ['不会', '掉回 0 级 + 进错题本', '8 分钟后'],
            ['模糊', '维持当前级别', '当前间隔 × 1.2'],
            ['记住', '+1 级', '1/2/4/7/15 天递进'],
            ['秒答', '+2 级', '间隔 × 1.6，更快脱离队列']
          ].map(function (r) { return el('tr', r.map(function (c) { return el('td', c); })); }))
        ])),
        el('p.cb-s', '升到 7 级即判定「已掌握」，从每日任务和背诵队列中移除。这就是间隔重复比"从头刷一遍"高效的原因。')
      ]),

      el('section.card-block', [
        el('h3.cb-t', [icon('settings'), '快捷键与手势']),
        el('ul.ml', [
          el('li', '空格：展开 / 收起答案（阅读页、背诵模式）'),
          el('li', 'F：收藏当前题'),
          el('li', '← / →：上一题 / 下一题'),
          el('li', '点击代码块右上角「复制」：一键复制代码'),
          el('li', '点击答案中的 [题号] 蓝色链接：跳转到关联题'),
          el('li', '弹层下滑或点遮罩关闭，Esc 亦可')
        ])
      ]),

      el('section.card-block', [
        el('h3.cb-t', [icon('plus'), '扩充题库的三种方式']),
        el('ol.ml', [
          el('li', [el('b', '一键下载在线题库'), '：我的 → 数据，服务器上的全部题库（含在线扩充词典）一次拉齐']),
          el('li', [el('b', 'App 内自建'), '：我的 → 自建题目，适合零散补充，随时可删']),
          el('li', [el('b', '改 db/*.json'), '：直接编辑 db/ 下的 JSON 文件（JSON 即数据库），改完服务器 API 立即生效，手机点「一键下载」即可拿到；采集扩充词库用 ', el('code.ic', 'python tools/fetch_datasets.py')])
        ]),
        el('p.cb-s', 'JSON 格式见 db/ 下任一文件：每文件一个分类，含 track（job/math/english/cet6/cet4）、name、questions 数组；构建器会校验 ID 重复、关联题缺失、答案过薄、公式未闭合等问题。')
      ]),

      el('section.card-block', [
        el('h3.cb-t', [icon('target'), '面试答题万能框架']),
        el('p.cb-s', '遇到任何八股题，按这四步说，基本不会翻车：'),
        el('ol.ml', [
          el('li', [el('b', '一句话结论'), '：先给判断，例如「B+ 树矮胖，磁盘 IO 更少」']),
          el('li', [el('b', '原理支撑'), '：说清楚为什么，最好点到源码/结构层面']),
          el('li', [el('b', '工程场景'), '：我在项目里怎么用/踩过什么坑，体现真实性']),
          el('li', [el('b', '权衡取舍'), '：什么情况下不用它、替代方案与代价，体现工程师思维'])
        ]),
        el('p.cb-s2', '当前你的掌握度：' + st.pct + '%（' + st.mastered + '/' + st.total + '），高频未掌握 ' +
          Store.all().filter(function (q) { return q.f === 'high' && !Store.isMastered(q.id); }).length + ' 道——这是最该优先清掉的。')
      ])
    ]);

    function step(n, t, d) {
      return el('div.step', [el('span.st-n', String(n)), el('div.st-m', [el('b', t), el('p', d)])]);
    }
    return { node: node, title: '使用指南', sub: '玩法与记忆算法', back: true, tabId: 'me' };
  };
})(window);
