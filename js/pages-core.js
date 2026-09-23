/* =====================================================================
 * pages-core.js —— 知识地图 / 分类列表 / 阅读页（含评分与自定进度）
 * ===================================================================== */
(function (global) {
  'use strict';
  var el = UI.el, icon = UI.icon, qs = UI.qs, clear = UI.clear, sheet = UI.sheet;

  /* ========================= 首页（赛道总览） ========================= */
  Pages.home = function () {
    var tracks = Store.tracks();
    var cur = Store.activeTrack();
    var ts = Store.trackStats(cur);
    var t = Store.track(cur) || tracks[0] || { name: '全部', color: '#2F6F5E', desc: '' };
    var dp = Store.dailyProgress();
    var st = Store.stats();

    // ---- 赛道切换 ----
    var trackBar = el('div.track-tabs', tracks.map(function (tr) {
      var s2 = Store.trackStats(tr.id);
      return el('button.track-tab' + (tr.id === cur ? '.on' : ''), {
        style: tr.id === cur ? {} : {},
        onclick: function () {
          if (tr.id === cur) return;
          UI.buzz(10);
          Store.setTrack(tr.id);
          App.render();
          // 赛道多时横向滚动条：把选中 tab 横向居中（直接算 scrollLeft，不触发页面竖向滚动）
          setTimeout(scrollActiveTabIntoView, 40);
        }
      }, [
        el('span.tt-ic', { style: { background: tr.color + '1f', color: tr.color } }, icon(tr.icon || 'book')),
        el('span.tt-m', [el('span.tt-n', tr.name), el('span.tt-s', s2.total + ' 题 · ' + s2.pct + '%')])
      ]);
    }));

    // ---- 概览卡（进度环 + 今日 + 打卡）----
    var todayDone = dp.done >= dp.total && dp.total > 0;
    var hero = el('section.hero', { style: { background: 'linear-gradient(135deg,' + t.color + ' 0%,' + t.color + 'cc 100%)' } }, [
      el('div.hero-l', [
        el('div.hero-hi', t.name + ' · ' + greeting()),
        el('div.hero-desc', t.desc || ''),
        el('div.hero-stat', [
          stat('已掌握', ts.mastered + '/' + ts.total, ''),
          stat('连续打卡', st.streak + ' 天', '')
        ])
      ]),
      el('div.hero-r', [
        App.ring(ts.pct, 74, null, null),
        el('div.hero-pct', [el('b', ts.pct + ''), el('i', '%')]),
        el('div.hero-pl', t.short || t.name)
      ])
    ]);

    // ---- 今日任务条（直达练习）----
    var scopeDue = Store.trackQuestions(cur).filter(function (q) {
      var p = Store.prog(q.id);
      return p && p.due && p.box < Store.MAX_BOX && p.due <= Date.now();
    }).length;
    var todayBtn = el('div.hero-actions', [
      el('a.btn.light', { href: '#/today' }, [
        icon(todayDone ? 'check' : 'zap'),
        todayDone ? '今日已完成 · 再练一组' : '今日任务 ' + dp.done + '/' + dp.total
      ]),
      scopeDue ? el('a.btn.light.ghost-l', { href: '#/quiz?mode=due' }, [icon('clock'), scopeDue + ' 题待复习']) : null
    ]);

    // ---- 快速工具（4 个高频入口）----
    var quick = el('div.quick-row', [
      quickBtn('brain', '背诵模式', '#/recall'),
      quickBtn('target', '自测出分', '#/quiz?mode=test&n=10'),
      quickBtn('wrong', '错题本', '#/wrong', st.wrong),
      quickBtn('star', '收藏夹', '#/fav', st.fav)
    ]);

    // ---- 当前赛道分类宫格 ----
    var cats = Store.catsByTrack(cur);
    var grid = el('div.cat-grid', cats.map(function (c) {
      var cs = Store.catStats(c.id);
      return el('a.cat-tile', { href: '#/c/' + c.id, onclick: function () { UI.buzz(6); } }, [
        el('span.ct-badge', { style: { background: c.color + '1f', color: c.color } }, c.badge),
        el('div.ct-name', c.name),
        el('div.ct-sub', cs.total + ' 题'),
        el('div.ct-bar', el('i', { style: { width: cs.pct + '%', background: c.color } })),
        cs.mastered ? el('div.ct-ok', '掌握 ' + cs.mastered) : el('div.ct-ok.dim', cs.seen ? '学习中' : '未开始')
      ]);
    }));

    var node = el('div.page', [
      trackBar,
      hero, todayBtn,
      el('div.sec-h', [
        el('h2', '知识分类'),
        el('button.text-btn', { onclick: function () { App.go('/tags'); } }, [icon('list'), '标签地图'])
      ]),
      grid,
      quick,
      el('p.foot-note', tracks.length > 1 ? tracks.length + ' 大赛道进度独立统计 · 「练习」页跟随当前赛道' : '离线可用 · 进度自动保存在本机')
    ]);

    // 把选中的赛道 Tab 横向滚到可视区中间（直接赋值 scrollLeft，CSS scroll-behavior 负责平滑；
    // 不用 scrollTo({behavior:'smooth'})：实测在嵌套横滚容器上不生效）
    function scrollActiveTabIntoView() {
      var bar = document.querySelector('.track-tabs');
      var on = document.querySelector('.track-tab.on');
      if (!bar || !on) return;
      if (bar.scrollWidth <= bar.clientWidth) return;   // 一屏放得下，无需滚动
      var barR = bar.getBoundingClientRect(), onR = on.getBoundingClientRect();
      var delta = onR.left - barR.left;                 // 选中项相对滚动容器左沿的偏移
      var target = bar.scrollLeft + delta - (bar.clientWidth - on.offsetWidth) / 2;
      bar.scrollLeft = Math.max(0, Math.min(target, bar.scrollWidth - bar.clientWidth));
    }

    return {
      node: node, title: '考途', sub: ts.total + ' 题 · ' + t.name, back: false,
      onMount: function () { setTimeout(scrollActiveTabIntoView, 40); }
    };

    function stat(label, value, cls) {
      return el('div.hstat.' + (cls || ''), [el('b', value), el('i', label)]);
    }
    function quickBtn(ic, label, href, badge) {
      return el('a.qbtn', { href: href }, [
        el('span.qb-ic', icon(ic)),
        el('span.qb-lb', label),
        badge ? el('span.qb-badge', String(badge)) : null
      ]);
    }
    function greeting() {
      var h = new Date().getHours();
      return h < 5 ? '夜深了，注意休息' : h < 11 ? '早上好' : h < 14 ? '中午好' : h < 18 ? '下午好' : h < 23 ? '晚上好' : '夜深了';
    }
  };

  /* ========================= 分类列表 ========================= */
  Pages.category = function (ctx) {
    var c = Store.cat(ctx.params.id);
    if (!c) {
      return {
        node: App.empty('wrong', '分类不存在：' + ctx.params.id,
          el('a.btn.primary', { href: '#/home' }, '返回知识地图')),
        title: '未知分类', tabId: 'home'
      };
    }
    var list = Store.byCat(c.id).slice();
    var cs = Store.catStats(c.id);
    var state = { filter: 'all', sort: 'default' };

    var listBox = el('div.list-box');

    function applyFilter(arr) {
      switch (state.filter) {
        case 'new': return arr.filter(function (q) { return Store.stateOf(q.id) === 'new'; });
        case 'ing': return arr.filter(function (q) { return ['learning', 'review'].indexOf(Store.stateOf(q.id)) >= 0; });
        case 'ok': return arr.filter(function (q) { return Store.isMastered(q.id); });
        case 'hi': return arr.filter(function (q) { return q.f === 'high'; });
        case 'fav': return arr.filter(function (q) { return Store.isFav(q.id); });
        case 'wrong': return arr.filter(function (q) { return !!Store.raw.wrong[q.id]; });
        default: return arr;
      }
    }
    function applySort(arr) {
      var a = arr.slice();
      if (state.sort === 'diff') a.sort(function (x, y) { return x.d - y.d; });
      else if (state.sort === 'freq') { var fw = { high: 0, mid: 1, low: 2 }; a.sort(function (x, y) { return fw[x.f] - fw[y.f]; }); }
      else if (state.sort === 'progress') a.sort(function (x, y) { return (Store.prog(x.id) ? Store.prog(x.id).box : -1) - (Store.prog(y.id) ? Store.prog(y.id).box : -1); });
      return a;
    }
    function renderList() {
      var arr = applySort(applyFilter(list));
      clear(listBox);
      if (!arr.length) { listBox.appendChild(App.empty('check', '该筛选下没有题目')); return; }
      arr.forEach(function (q, i) {
        var p = Store.prog(q.id);
        listBox.appendChild(App.qItem(q, {
          index: i + 1,
          extra: p && p.box ? el('span.box-tag', '记忆 ' + p.box + '/7') : null,
          right: el('span.q-right', [
            Store.isFav(q.id) ? el('span.favd', icon('star')) : null,
            Store.raw.wrong[q.id] ? el('span.wrongd', icon('wrong')) : null,
            el('span.q-arrow', icon('right'))
          ])
        }));
      });
    }

    var bar = el('div.filterbar', [
      ['all', '全部', list.length], ['new', '未学', null], ['hi', '高频', null],
      ['ing', '学习中', null], ['ok', '已掌握', cs.mastered], ['fav', '收藏', null], ['wrong', '错题', null]
    ].map(function (f) {
      return el('button.fbtn' + (f[0] === 'all' ? '.on' : ''), {
        'data-f': f[0],
        onclick: function () {
          state.filter = f[0];
          UI.qsa('.fbtn', bar).forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-f') === f[0]); });
          renderList();
        }
      }, [f[1], f[2] != null ? el('i.fcount', String(f[2])) : null]);
    }));

    var sortBar = el('div.sub-bar', [
      el('span.sb-lb', [icon('filter'), '排序']),
      el('div.chips', [
        ['default', '默认'], ['freq', '频率'], ['diff', '难度'], ['progress', '进度']
      ].map(function (s) {
        return el('button.chip-btn' + (s[0] === 'default' ? '.on' : ''), {
          'data-s': s[0],
          onclick: function () {
            state.sort = s[0];
            UI.qsa('.chip-btn', sortBar).forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-s') === s[0]); });
            renderList();
          }
        }, s[1]);
      }))
    ]);

    var summary = el('div.cat-summary', [
      el('div.cs-l', [
        el('span.cs-badge', { style: { background: c.color + '1f', color: c.color } }, c.badge),
        el('div', [el('div.cs-name', c.name), el('div.cs-desc', c.desc || '')])
      ]),
      el('div.cs-r', [
        el('div.cs-num', [el('b', String(cs.mastered)), el('i', '/' + cs.total + ' 掌握')]),
        App.ring(cs.pct, 44, c.color)
      ])
    ]);

    var node = el('div.page', [
      summary,
      el('div.action-row', [
        el('button.btn.primary', {
          onclick: function () {
            var arr = applySort(applyFilter(list));
            if (!arr.length) return UI.toast('没有可学习的题目', 'warn');
            App.go('/quiz?mode=browse&cat=' + c.id + (state.filter !== 'all' ? '&f=' + state.filter : '') + (state.sort !== 'default' ? '&s=' + state.sort : ''));
          }
        }, [icon('play'), '按当前筛选刷题']),
        el('button.btn.ghost', {
          onclick: function () { App.go('/recall?cat=' + c.id); }
        }, [icon('brain'), '背诵']),
        el('button.btn.ghost', {
          onclick: function () { App.go('/quiz?mode=test&cat=' + c.id + '&n=10'); }
        }, [icon('target'), '自测 10 题'])
      ]),
      bar, sortBar,
      listBox
    ]);

    renderList();
    return {
      node: node, title: c.name, sub: cs.total + ' 题 · 掌握 ' + cs.pct + '%',
      back: true, tabId: 'home'
    };
  };

  /* ========================= 阅读页（八股卡片） ========================= */
  Pages.question = function (ctx) {
    var q = Store.get(ctx.params.id);
    if (!q) {
      return {
        node: App.empty('wrong', '找不到题目：' + ctx.params.id,
          el('a.btn.primary', { href: '#/home' }, '返回知识地图')),
        title: '题目不存在', tabId: ''
      };
    }

    Store.markSeen(q.id);

    // 词汇卡（词库类）走极简模式：题干即单词，默认展开、无目录、评级常驻，降低背单词操作成本
    var isWord = /vocab|word/.test(q.cat || '');   // imp-*-word 导入词书也走词卡极简模式
    var ansSrc = isWord ? String(q.a).replace(/^\s*##\s*卡片\s*[\r\n]+/, '') : q.a;
    var rendered = MD.render(ansSrc);
    var p = Store.prog(q.id);
    var sib = Store.sibling(q);
    var hidden = isWord ? false : Store.settings().hideUntilTap !== false;
    var state = { open: isWord || Store.settings().autoReveal || !hidden };

    // 答案内目录（词汇卡隐藏，保持简约）
    var toc = !isWord && rendered.toc.length > 2
      ? el('div.ans-toc', [el('div.ans-toc-h', [icon('list'), '本节目录']),
      el('div.ans-toc-items', rendered.toc.map(function (t) {
        return el('a.toc-i.l' + t.level, { href: '#', 'data-anchor': t.id }, t.text);
      }))])
      : null;

    var answerBox = el('div.answer-box', { id: 'answer-box', hidden: !state.open }, [
      toc,
      el('article#answer-body.md', { html: rendered.html }),
      el('div.ans-tail', [
        el('button.text-btn', {
          onclick: function () {
            UI.copyText(q.q + '\n\n' + MD.plain(q.a)).then(function (ok) { UI.toast(ok ? '题目与答案已复制（纯文本）' : '复制失败'); });
          }
        }, [icon('copy'), '复制答案']),
        el('button.text-btn', { id: 'note-btn-' + q.id, onclick: openNote }, [icon('note'), Store.note(q.id) ? '查看笔记' : '写笔记'])
      ])
    ]);

    var rateBar = el('div.rate-bar', { id: 'rate-bar', hidden: !state.open }, [
      el('button.rate.again', { onclick: function () { doGrade('again'); } }, [el('b', '不会'), el('i', '8分钟后')]),
      el('button.rate.hard', { onclick: function () { doGrade('hard'); } }, [el('b', '模糊'), el('i', '稍后')]),
      el('button.rate.good', { onclick: function () { doGrade('good'); } }, [el('b', '记住'), el('i', nextDue('good'))]),
      el('button.rate.easy', { onclick: function () { doGrade('easy'); } }, [el('b', '秒答'), el('i', nextDue('easy'))])
    ]);

    var reveal = el('button.reveal-btn', { id: 'reveal-btn', hidden: state.open, onclick: revealAns }, [
      icon('eye'), '我已经想过了，展开答案'
    ]);

    var noteHint = Store.note(q.id)
      ? el('div.note-hint', { onclick: openNote }, [icon('note'), el('span', UI.truncate(Store.note(q.id), 60)), el('em', '编辑')])
      : null;

    var rel = Store.related(q);
    if (isWord) rel = rel.slice(0, 4);   // 词卡保持简约：关联推荐最多 4 条
    var relBox = rel.length ? el('section.rel', [
      el('h3.rel-h', [icon('link'), '关联推荐']),
      el('div.rel-list', rel.map(function (r) {
        return el('a.rel-i', { href: '#/q/' + r.id }, [
          el('span.rel-cat', { style: { color: r.color } }, r.catName),
          el('span.rel-q', MD.esc(r.q)),
          Store.isMastered(r.id) ? el('span.rel-ok', '已掌握') : null
        ]);
      }))
    ]) : null;

    var meta = el('div.q-meta-row', [
      el('span.chip.chip-cat', { style: { color: q.color, background: q.color + '1a' } }, q.catName),
      el('span.chip', q.f === 'high' ? '🔥 高频' : q.f === 'low' ? '低频' : '中频'),
      el('span.chip', '难度 ' + q.d + '/5'),
      el('span.chip', sib.index + '/' + sib.total)
    ]);

    var node = el('div.page.qpage' + (isWord ? '.word-mode' : ''), [
      el('div.q-head', { id: 'q-head' }, [
        meta,
        el('h1.q-headline', q.q),
        el('div.tags', q.t.map(function (t) {
          return el('a.tag', { href: '#/tags?t=' + encodeURIComponent(t) }, '#' + t);
        })),
        el('div.q-progress-line', [
          stateLine(q),
          el('div.q-tools', [
            el('button.fav-btn' + (Store.isFav(q.id) ? '.on' : ''), {
              id: 'fav-btn',
              ariaLabel: '收藏',
              onclick: function (e) {
                e.preventDefault();
                var on = Store.toggleFav(q.id);
                this.classList.toggle('on', on);
                // 文案与 .on 状态同步：否则点收藏后仍显示「收藏」，重载后才变「已收藏」
                var lb = qs('span', this);
                if (lb) lb.textContent = on ? '已收藏' : '收藏';
                UI.toast(on ? '已加入收藏' : '已取消收藏', on ? 'ok' : 'info', 1200);
                UI.buzz(10);
              }
            }, [icon('star'), el('span', Store.isFav(q.id) ? '已收藏' : '收藏')]),
            Store.raw.wrong[q.id]
              ? el('span.wrong-tag', { title: '在错题本中', onclick: function () { App.go('/wrong'); } }, [icon('wrong'), '错题'])
              : null
          ])
        ])
      ]),
      noteHint,
      reveal,
      answerBox,
      rateBar,
      relBox,
      // 上下一题：用 flipTo（replace 语义）而非原生 a href push，连翻不堆历史
      el('div.q-pager', [
        sib.prev
          ? el('a.pager-btn', {
            href: '#/q/' + sib.prev.id,
            onclick: function (e) { e.preventDefault(); App.flipTo(sib.prev.id); }
          }, [icon('back'), el('span', UI.truncate(sib.prev.q, 14))])
          : el('span.pager-btn.dis', [icon('back'), el('span', '已是第一题')]),
        sib.next
          ? el('a.pager-btn', {
            href: '#/q/' + sib.next.id,
            onclick: function (e) { e.preventDefault(); App.flipTo(sib.next.id); }
          }, [el('span', UI.truncate(sib.next.q, 14)), icon('right')])
          : el('span.pager-btn.dis', [el('span', '已是最后一题'), icon('right')])
      ]),
      // 词卡模式：手机端不显示桌面快捷键提示（.foot-note 已用 CSS 隐藏）；桌面端换成词卡专属提示
      el('p.foot-note' + (isWord ? '.wm-hint' : ''), isWord ? '背单词：评级后自动跳下一个词；评级即计入今日任务' : '快捷键：空格 展开/收起答案 · F 收藏 · → 下一题 · ← 上一题')
    ]);

    return {
      node: node, title: q.catName, sub: '#' + q.id,
      back: true, tabId: '', scroll: false,
      actions: [{ icon: 'copy', label: '复制题目', onClick: function () { UI.copyText(q.q).then(function (ok) { UI.toast(ok ? '题干已复制' : '复制失败'); }); } }],
      onMount: function () {
        document.addEventListener('keydown', keyNav);
        UI.on('toggle-answer', toggleAns);
      },
      // 离页必卸：否则每进一题累加一个闭包，空格键会被几十个旧闭包连环触发（泄漏+劫持）
      onUnmount: function () {
        document.removeEventListener('keydown', keyNav);
        UI.off('toggle-answer', toggleAns);
      }
    };

    function keyNav(e) {
      if (openLayersLength()) return;
      if (e.key === 'ArrowRight' && sib.next) { App.flipTo(sib.next.id); }
      else if (e.key === 'ArrowLeft' && sib.prev) { App.flipTo(sib.prev.id); }
    }
    function openLayersLength() { return UI.openLayers && UI.openLayers.length > 0; }

    function revealAns() {
      if (state.open) return;
      state.open = true;
      answerBox.hidden = false;
      rateBar.hidden = false;
      reveal.hidden = true;
      UI.buzz(6);
    }
    function toggleAns() {
      state.open = !state.open;
      answerBox.hidden = !state.open;
      rateBar.hidden = !state.open;
      reveal.hidden = state.open;
    }
    function nextDue(rating) {
      var box = p ? p.box : 0;
      var nb = rating === 'easy' ? Math.min(box + 2, Store.MAX_BOX) : Math.min(box + 1, Store.MAX_BOX);
      if (nb >= Store.MAX_BOX) return '已掌握';
      var mins = Store.INTERVAL_MIN[nb];
      return mins < 1440 ? Math.round(mins / 60) + ' 小时后' : Math.round(mins / 1440) + ' 天后';
    }
    function doGrade(rating) {
      var r = Store.grade(q.id, rating);
      UI.buzz(rating === 'again' ? 30 : 12);
      var msg = rating === 'again' ? '记错了，8 分钟后重练（已进错题本）'
        : rating === 'hard' ? '有点模糊，稍后再来'
          : (r.removedWrong ? '连续答对 2 次，已移出错题本 🎉' : '记住了，下次 ' + nextDueText(r.p));
      UI.toast(msg, rating === 'again' ? 'warn' : 'ok', 1800);
      // 更新界面状态
      qProgressLine(node);
      App.updateBadges();   // 评分即计入今日进度，立即消底部红点
      if (sib.next) {
        // 自动进入下一题；守卫：若用户在 320ms 内已手动导航到别处，则不拽回
        // 用 flipTo（replace）：连背单词不会往历史栈堆 N 条，返回一次即回入口
        var fromId = q.id;
        setTimeout(function () {
          if (Store.settings().autoNext === false) return;
          var cur = (location.hash || '').split('?')[0];
          if (cur !== '#/q/' + fromId) return;
          App.flipTo(sib.next.id);
        }, 320);
      } else {
        UI.toast('本分类已到最后一题', 'info', 1500);
      }
      function nextDueText(pp) {
        if (!pp || !pp.due) return '已掌握 🎉';
        return UI.dueText(pp.due);
      }
    }
    function qProgressLine(root) {
      var line = root.querySelector('.q-progress-line');
      if (!line) return;
      var first = line.firstChild;
      if (first && first.classList && first.classList.contains('state-line')) {
        line.replaceChild(stateLine(Store.get(q.id)), first);
      }
    }
    function stateLine(item) {
      var pp = Store.prog(item.id);
      var s = Store.stateOf(item.id);
      var txt = s === 'mastered' ? '已掌握'
        : s === 'new' ? '未学习'
          : (s === 'learning' ? '学习中' : '复习中');
      var due = pp && pp.due ? ' · 下次 ' + UI.dueText(pp.due) : '';
      var box = pp ? ' · 记忆 ' + pp.box + '/7' : '';
      return el('span.state-line.' + s, [
        icon(s === 'mastered' ? 'check' : s === 'new' ? 'info' : 'clock'),
        txt + box + due
      ]);
    }

    function openNote() {
      var ta = el('textarea.ta-note', { placeholder: '用自己的话复述一遍，才是真正的掌握……\n\n支持 Markdown：## 小标题、- 列表、`代码`、**加粗**' }, Store.note(q.id));
      var savedAt = Store.note(q.id) ? el('span.note-at', '上次编辑 ' + UI.ago(Store.raw.notes[q.id].at)) : null;
      var preview = el('div.md.note-preview');
      var api = sheet([el('span', icon('note')), ' 我的笔记 · ' + UI.truncate(q.q, 26)], [
        el('div.note-head', [
          el('label.switch', [
            el('input', { type: 'checkbox', onchange: function () { doPreview(this.checked); } }),
            el('span.sl'), '预览'
          ]),
          savedAt
        ]),
        ta, preview,
        el('div.row.btn-row', [
          el('button.btn.ghost', { onclick: function () { Store.setNote(q.id, ''); api.close(); UI.toast('笔记已删除', 'info'); refresh(); } }, '清空'),
          el('button.btn.primary', {
            onclick: function () {
              Store.setNote(q.id, ta.value);
              api.close();
              UI.toast(ta.value.trim() ? '笔记已保存' : '笔记已清空', 'ok');
              refresh();
            }
          }, '保存笔记')
        ])
      ], { sheetClass: 'note-sheet' });
      function doPreview(on) {
        ta.hidden = on; preview.hidden = !on;
        if (on) { preview.innerHTML = MD.render(ta.value).html; if (!ta.value.trim()) preview.innerHTML = '<p class="hint">暂无内容</p>'; }
      }
    }
    function refresh() {
      // 局部刷新笔记提示条
      var old = node.querySelector('.note-hint');
      var txt = Store.note(q.id);
      var nw = txt ? el('div.note-hint', { onclick: openNote }, [icon('note'), el('span', UI.truncate(txt, 60)), el('em', '编辑')]) : null;
      if (old && nw) old.parentNode.replaceChild(nw, old);
      else if (old && !nw) old.parentNode.removeChild(old);
      else if (!old && nw) node.querySelector('.q-head').parentNode.insertBefore(nw, reveal);
      // 同步「写笔记/查看笔记」按钮文案（修复：删笔记后按钮文案不更新）
      var nb = document.getElementById('note-btn-' + q.id);
      if (nb) { clear(nb); UI.append(nb, [icon('note'), txt ? '查看笔记' : '写笔记']); }
    }
  };

  /* ========================= 标签浏览 ========================= */
  Pages.tags = function (ctx) {
    var tags = Store.allTags();
    var active = ctx.query && ctx.query.t ? decodeURIComponent(ctx.query.t) : null;
    var listBox = el('div.list-box');

    function render() {
      clear(listBox);
      if (active) {
        var arr = Store.all().filter(function (q) { return q.t.indexOf(active) >= 0; });
        if (!arr.length) { listBox.appendChild(App.empty('search', '该标签下暂无题目')); return; }
        arr.forEach(function (q, i) { listBox.appendChild(App.qItem(q, { index: i + 1 })); });
      } else {
        listBox.appendChild(el('div.tag-cloud', tags.map(function (t) {
          return el('button.tag-pill', {
            onclick: function () { active = t[0]; location.hash = '#/tags?t=' + encodeURIComponent(t[0]); }
          }, [t[0], el('i', String(t[1]))]);
        })));
      }
    }
    render();

    return {
      node: el('div.page', [
        el('div.sec-h', [el('h2', active ? '标签：' + active : '全部标签'), el('span.sec-x', tags.length + ' 个标签')]),
        active ? el('button.btn.ghost.sm', { onclick: function () { App.go('/tags'); } }, [icon('back'), '返回标签列表']) : null,
        listBox
      ]),
      title: active ? ('#' + active) : '标签地图',
      sub: tags.length + ' 个标签',
      back: true, tabId: 'home'
    };
  };
})(window);
