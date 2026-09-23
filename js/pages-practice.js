/* =====================================================================
 * pages-practice.js —— 今日 / 自测 / 背诵 / 错题 / 收藏 / 笔记
 * ===================================================================== */
(function (global) {
  'use strict';
  var el = UI.el, icon = UI.icon, clear = UI.clear, sheet = UI.sheet;

  /* ========================= 今日 ========================= */
  Pages.today = function () {
    var d = Store.daily();
    var dp = Store.dailyProgress();
    var st = Store.stats();
    var t = Store.track(Store.activeTrack()) || { name: '', color: '#2F6F5E' };
    // 到期复习仅统计当前赛道
    var scopeSet = {};
    Store.trackQuestions(Store.activeTrack()).forEach(function (q) { scopeSet[q.id] = 1; });
    var due = Store.dueList().filter(function (x) { return scopeSet[x.q.id]; });
    var box = el('div.list-box');

    function renderBox() {
      clear(box);
      if (!d.ids.length) {
        box.appendChild(App.empty('check', '题库为空，请先在「我的 → 数据」一键下载在线题库'));
        return;
      }
      d.ids.forEach(function (id, i) {
        var q = Store.get(id); if (!q) return;
        var done = d.done.indexOf(id) >= 0;
        box.appendChild(el('div.daily-i' + (done ? '.done' : ''), [
          el('span.d-num', done ? icon('check') : String(i + 1)),
          el('a.q-item.plain', { href: '#/q/' + id }, [
            el('div.q-body', [
              el('div.q-title', q.q),
              el('div.q-meta', [
                el('span.chip.chip-cat', { style: { color: q.color, background: q.color + '1a' } }, q.catName),
                done ? el('span.state.ok', '已完成') : el('span.state.new', (Store.isSeen(id) ? '复习' : '待学习')),
                q.f === 'high' ? el('span.freq.hi', '高频') : null
              ])
            ]),
            el('span.q-arrow', icon('right'))
          ]),
          done
            ? el('button.mini-btn.und', { title: '撤销完成', onclick: function () { undo(id); } }, icon('refresh'))
            : el('button.mini-btn', { title: '标记会了', onclick: function () { quickDone(q, i); } }, icon('check'))
        ]));
      });
    }

    function quickDone(q, i) {
      // 未打开就自评：默认按「记住了」处理，可在弹层里改评级
      var api = sheet('快速评级 · ' + UI.truncate(q.q, 20), [
        el('p.hint', '没展开答案就直接评？还是先去读一遍更稳。'),
        el('div.grid-2', [
          el('a.btn.primary', { href: '#/q/' + q.id, onclick: function () { api.close(); } }, [icon('book'), '去阅读并评分'])
        ]),
        el('div.rate-bar.v', [
          el('button.rate.again', { onclick: function () { finish('again'); } }, [el('b', '不会')]),
          el('button.rate.hard', { onclick: function () { finish('hard'); } }, [el('b', '模糊')]),
          el('button.rate.good', { onclick: function () { finish('good'); } }, [el('b', '记住')]),
          el('button.rate.easy', { onclick: function () { finish('easy'); } }, [el('b', '秒答')])
        ])
      ], { center: true });
      function finish(rating) {
        Store.grade(q.id, rating);
        api.close();
        UI.buzz(12);
        UI.toast(rating === 'again' ? '已记录，进错题本' : '已完成今日第 ' + (i + 1) + ' 题', rating === 'again' ? 'warn' : 'ok');
        refreshAll();
      }
    }
    function undo(id) {
      var key = Store.dateKey();
      var arr = Store.raw.daily[key].done;
      var i = arr.indexOf(id);
      if (i >= 0) arr.splice(i, 1);
      Store.save();
      refreshAll();
    }
    function refreshAll() {
      var nd = Store.dailyProgress(), ns = Store.stats();
      var pg = page.querySelector('.today-prog');
      if (pg) pg.parentNode.replaceChild(progCard(nd, ns), pg);
      renderBox();
      App.updateBadges();
      if (nd.done >= nd.total && nd.total) celebrate();
    }
    function celebrate() {
      Store.checkIn();
      var s = Store.stats();
      var ts = Store.trackStats(Store.activeTrack());   // 赛道内统计，不混入其它赛道数字
      var api = sheet(null, [
        el('div.cele', [
          el('div.cele-ic', '🎉'),
          el('h2', '今日任务完成！'),
          el('p', '连续打卡 ' + s.streak + ' 天' + (s.best > s.streak ? '（最佳 ' + s.best + ' 天）' : '（新纪录！）')),
          el('div.cele-stat', [
            el('div', [el('b', String(ts.mastered)), el('i', '已掌握')]),
            el('div', [el('b', String(ts.due)), el('i', '待复习')]),
            el('div', [el('b', String(ts.wrong)), el('i', '错题')])
          ]),
          el('div.row.btn-row', [
            el('button.btn.ghost', { onclick: function () { api.close(); } }, '知道了'),
            el('a.btn.primary', { href: '#/recall', onclick: function () { api.close(); } }, [icon('brain'), '再来一轮背诵'])
          ])
        ])
      ], { center: true });
      UI.buzz([20, 60, 30]);
    }

    function progCard(p, s) {
      var pct = p.total ? Math.round(p.done / p.total * 100) : 0;
      return el('div.today-prog', [
        el('div.tp-l', [
          el('div.tp-t', p.done >= p.total && p.total ? '今日已完成，干得漂亮' : '今日进度'),
          el('div.tp-n', [el('b', String(p.done)), el('span', ' / ' + p.total + ' 题')]),
          el('div.tp-bar', el('i', { style: { width: pct + '%' } })),
          el('div.tp-x', [
            el('span.streak', [icon('flame'), s.streak + ' 天']),
            el('span', s.today ? '今日 ' + s.today + ' 次学习行为' : '今天还没开始，加油'),
          ])
        ]),
        App.ring(pct, 78)
      ]);
    }

    var dueCard = el('div.due-card', { onclick: function () { App.go('/quiz?mode=due'); } }, [
      el('span.dc-ic', icon('clock')),
      el('div.dc-m', [
        el('div.dc-t', due.length ? '有 ' + due.length + ' 道题到期该复习了' : '没有到期的复习任务'),
        el('div.dc-s', due.length ? '间隔重复：按艾宾浩斯曲线安排，现在复习记得最牢' : '读完题并点「记住」后，系统会自动安排下次复习时间')
      ]),
      el('span.dc-go', icon('right'))
    ]);

    var page = el('div.page', [
      progCard(dp, st),
      dueCard,
      el('div.sec-h', [
        el('h2', '今日任务 · ' + t.name),
        el('button.text-btn', { onclick: function () { regen(); } }, '换一批')
      ]),
      box,
      el('div.action-row', [
        el('a.btn.ghost', { href: '#/quiz?mode=random&n=10' }, [icon('zap'), '随机来 10 题']),
        el('a.btn.ghost', { href: '#/recall' }, [icon('brain'), '背诵模式'])
      ]),
      el('p.foot-note', '任务与复习均限定在「' + t.name + '」赛道内；切换赛道在首页顶部')
    ]);

    function regen() {
      var key = Store.dateKey();
      UI.confirm({ title: '重新生成今日任务？', text: '会按当前待复习与未掌握题目重新抽题，已完成评级不受影响。', okText: '重新抽题' }).then(function (ok) {
        if (!ok) return;
        delete Store.raw.daily[key];
        Store.ensureDaily();
        Store.save();
        App.render();
        UI.toast('今日任务已更新', 'ok');
      });
    }

    renderBox();
    return {
      node: page, title: '今日学习', sub: dp.done + '/' + dp.total + ' · 待复习 ' + due.length,
      back: false, tabId: 'today',
      actions: [{ icon: 'brain', label: '背诵模式', onClick: function () { App.go('/recall'); } }]
    };
  };

  /* ========================= 自测 / 刷题 / 复习队列 ========================= */
  // mode: browse 顺序浏览当前集合 / test 自测（先隐藏答案，自评） / due 到期复习 / random 随机
  Pages.quiz = function (ctx) {
    var q0 = ctx.query || {};
    var mode = q0.mode || 'browse';
    var catId = q0.cat || '';
    var wantN = Math.min(60, Math.max(1, parseInt(q0.n, 10) || (mode === 'test' ? 10 : 20)));

    // 组装题目池（未指定分类时，范围限定在当前赛道）
    var scopeAll = catId ? Store.byCat(catId) : Store.trackQuestions(Store.activeTrack());
    var pool;
    if (mode === 'due') {
      var scopeSet = {};
      scopeAll.forEach(function (q) { scopeSet[q.id] = 1; });
      pool = Store.dueList().filter(function (x) { return scopeSet[x.q.id]; }).map(function (x) { return x.q; });
    } else if (mode === 'random') {
      var src = scopeAll.filter(function (q) { return !Store.isMastered(q.id); });
      pool = shuffle(src).slice(0, wantN);
    } else if (mode === 'test') {
      var base = scopeAll;
      // 自测优先未掌握 + 错题
      var w = base.filter(function (q) { return !!Store.raw.wrong[q.id]; });
      var rest = base.filter(function (q) { return !Store.isMastered(q.id) && !Store.raw.wrong[q.id]; });
      var hi = rest.filter(function (q) { return q.f === 'high'; });
      var mid = rest.filter(function (q) { return q.f !== 'high'; });
      pool = shuffle(w).concat(shuffle(hi), shuffle(mid)).slice(0, wantN);
    } else {
      // browse：按分类页传入的筛选/排序
      var list = scopeAll.slice();
      var f = q0.f || 'all', s = q0.s || 'default';
      if (f === 'new') list = list.filter(function (q) { return Store.stateOf(q.id) === 'new'; });
      else if (f === 'ing') list = list.filter(function (q) { return ['learning', 'review'].indexOf(Store.stateOf(q.id)) >= 0; });
      else if (f === 'ok') list = list.filter(function (q) { return Store.isMastered(q.id); });
      else if (f === 'hi') list = list.filter(function (q) { return q.f === 'high'; });
      else if (f === 'fav') list = list.filter(function (q) { return Store.isFav(q.id); });
      else if (f === 'wrong') list = list.filter(function (q) { return !!Store.raw.wrong[q.id]; });
      if (s === 'diff') list.sort(function (x, y) { return x.d - y.d; });
      else if (s === 'freq') { var fw = { high: 0, mid: 1, low: 2 }; list.sort(function (x, y) { return fw[x.f] - fw[y.f]; }); }
      else if (s === 'progress') list.sort(function (x, y) { return (Store.prog(x.id) ? Store.prog(x.id).box : -1) - (Store.prog(y.id) ? Store.prog(y.id).box : -1); });
      pool = list;
    }

    var cfg = Store.cat(catId);
    var trk = Store.track(Store.activeTrack()) || { name: '全部' };
    var titles = { due: '到期复习', random: '随机刷题', test: '自测模式', browse: (cfg ? cfg.name : trk.name) };

    if (!pool.length) {
      return {
        node: App.empty('check',
          mode === 'due' ? '当前没有到期复习的题目，去知识地图学点新的吧' : '该范围内没有题目',
          el('a.btn.primary', { href: '#/home' }, '返回知识地图')),
        title: titles[mode] || '刷题', back: true, tabId: 'today'
      };
    }

    var idx = 0;
    var results = { ok: 0, no: 0, hard: 0 };
    var container = el('div.quiz-stage');
    var finished = false;

    function draw() {
      if (idx >= pool.length) return finish();
      var q = pool[idx];
      Store.markSeen(q.id);
      var rendered = MD.render(q.a);
      var opened = mode === 'browse';

      var card = el('div.quiz-card', { id: 'quiz-card' }, [
        el('div.qc-top', [
          el('span.qc-idx', (idx + 1) + ' / ' + pool.length),
          el('span.chip.chip-cat', { style: { color: q.color, background: q.color + '1a' } }, q.catName),
          el('button.icon-btn.sm', {
            ariaLabel: '收藏',
            onclick: function () {
              var on = Store.toggleFav(q.id);
              this.classList.toggle('on', on);
              UI.toast(on ? '已收藏' : '已取消收藏', on ? 'ok' : 'info', 1100);
            }
          }, icon('star')),
          el('span.qc-fill')
        ]),
        el('div.qc-progress', el('i', { style: { width: ((idx) / pool.length * 100).toFixed(1) + '%' } })),
        el('h2.qc-q', q.q),
        el('div.qc-tags', q.t.slice(0, 4).map(function (t) { return el('span.tag-sm', '#' + t); })),
        el('div.qc-ans', { id: 'qc-ans', hidden: !opened }, [
          rendered.toc.length > 2 ? el('div.ans-toc', [el('div.ans-toc-h', [icon('list'), '本节目录']), el('div.ans-toc-items', rendered.toc.map(function (t) { return el('a.toc-i.l' + t.level, { href: '#', 'data-anchor': t.id }, t.text); }))]) : null,
          el('article.md', { html: rendered.html })
        ]),
        opened ? null : el('button.reveal-btn.qc-reveal', { onclick: function () { openAns(); } }, [icon('eye'), '先自己答一遍，再看答案']),
        el('div.qc-rate', { hidden: !opened }, [
          el('button.rate.again', { onclick: function () { judge('again'); } }, [el('b', '不会'), el('i', '8分钟后')]),
          el('button.rate.hard', { onclick: function () { judge('hard'); } }, [el('b', '模糊')]),
          el('button.rate.good', { onclick: function () { judge('good'); } }, [el('b', '记住'), el('i', nextOf(q, 'good'))]),
          el('button.rate.easy', { onclick: function () { judge('easy'); } }, [el('b', '秒答'), el('i', nextOf(q, 'easy'))])
        ]),
        el('div.qc-nav', [
          idx > 0 ? el('button.text-btn', { onclick: function () { idx--; draw(); } }, [icon('back'), '上一题']) : el('span'),
          el('a.text-btn', { href: '#/q/' + q.id }, [icon('book'), '完整页']),
          el('button.text-btn.primary', { onclick: function () { judge(null); } }, ['下一题', icon('right')])
        ])
      ]);

      function openAns() {
        var a = card.querySelector('#qc-ans');
        a.hidden = false;
        card.querySelector('.qc-reveal').remove();
        card.querySelector('.qc-rate').hidden = false;
        UI.buzz(6);
        a.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      function judge(rating) {
        if (rating) {
          Store.grade(q.id, rating);
          if (rating === 'good' || rating === 'easy') results.ok++;
          else if (rating === 'hard') results.hard++;
          else results.no++;
        }
        UI.buzz(8);
        idx++;
        draw();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      function nextOf(item, rating) {
        var pp = Store.prog(item.id), box = pp ? pp.box : 0;
        var nb = rating === 'easy' ? Math.min(box + 2, Store.MAX_BOX) : Math.min(box + 1, Store.MAX_BOX);
        return nb >= Store.MAX_BOX ? '已掌握' : UI.dueText(Date.now() + Store.INTERVAL_MIN[nb] * 60000);
      }

      clear(container).appendChild(card);
    }

    function finish() {
      if (finished) return;
      finished = true;
      var rated = results.ok + results.hard + results.no;   // 只统计真正评过级的题
      var skipped = pool.length - rated;
      var score = rated ? Math.round((results.ok + results.hard * 0.5) / rated * 100) : 0;
      if (rated) Store.checkIn();   // 一题未评不触发打卡
      var trkWrong = Store.trackStats(Store.activeTrack()).wrong;
      var box = el('div.quiz-done', [
        el('div.qd-ic', rated === 0 ? '📝' : score >= 80 ? '🏆' : score >= 60 ? '💪' : '📖'),
        el('h2', rated === 0 ? '浏览完成' : mode === 'test' ? '自测完成' : '本轮完成'),
        rated
          ? el('div.qd-score', [el('b', score + ''), el('i', '分')])
          : el('p.qd-tip', '本轮没有评分记录，分数不计入。下次点「不会/模糊/记住/秒答』才能统计掌握情况。'),
        rated ? el('div.qd-stat', [
          el('div.ok', [el('b', String(results.ok)), el('i', '记住')]),
          el('div.hard', [el('b', String(results.hard)), el('i', '模糊')]),
          el('div.no', [el('b', String(results.no)), el('i', '不会')]),
          skipped ? el('div', [el('b', String(skipped)), el('i', '未评级')]) : null
        ]) : null,
        rated ? el('p.qd-tip', advice(score, mode)) : null,
        results.no ? el('a.btn.ghost', { href: '#/wrong' }, [icon('wrong'), '去错题本复盘 ' + trkWrong + ' 题']) : null,
        el('div.row.btn-row', [
          el('a.btn.primary', { href: '#/home' }, [icon('home'), '回到知识地图']),
          rated || mode !== 'browse' ? el('button.btn.ghost', { onclick: function () { idx = 0; finished = false; results = { ok: 0, no: 0, hard: 0 }; draw(); } }, [icon('refresh'), '再来一轮']) : null
        ])
      ]);
      clear(container).appendChild(box);
      App.updateBadges();
      UI.buzz([25, 50, 25]);
    }

    function advice(score) {
      if (score >= 90) return '正确率很高！建议开启「背诵模式」练口头输出——答案要能连着原理完整说出来才算过关。';
      if (score >= 70) return '掌握得不错。把「模糊」的题重读一遍答案开头的一句话结论，两天后再复测一轮。';
      if (score >= 40) return '基础还不牢：先去错题本把「不会」的题清干净，重点记每题的第一段结论，再回来复测。';
      return '先别急着刷题量。挑本分类前 10 题逐题展开答案做笔记，用自己的话复述一遍再继续。';
    }

    draw();
    return {
      node: container,
      title: titles[mode] || '刷题',
      sub: pool.length + ' 题' + (cfg ? ' · ' + cfg.name : ''),
      back: true, tabId: 'today', scroll: false
    };

    function shuffle(a) {
      var arr = a.slice();
      for (var i = arr.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
      }
      return arr;
    }
  };

  /* ========================= 背诵模式（抽卡） ========================= */
  Pages.recall = function (ctx) {
    var q0 = ctx.query || {};
    var catId = q0.cat || '';
    var onlyNew = q0.only === 'new';
    var src = catId ? Store.byCat(catId) : Store.trackQuestions(Store.activeTrack());
    if (onlyNew) src = src.filter(function (q) { return !Store.isSeen(q.id); });
    var pool = src.filter(function (q) { return !Store.isMastered(q.id); });
    if (!pool.length) pool = catId ? Store.byCat(catId) : Store.trackQuestions(Store.activeTrack());
    if (!pool.length) {
      return { node: App.empty('check', '该赛道题目都已掌握，切到首页换赛道试试', el('a.btn.primary', { href: '#/home' }, '返回首页')), title: '背诵模式', back: true };
    }

    var order = pool.slice();
    var idx = Math.floor(Math.random() * order.length);
    var flipped = false;
    var wrap = el('div.recall-stage');
    var cfg = Store.cat(catId);
    // 键盘处理只定义/注册一次（旧实现每次 draw 都加一个监听器，翻卡多了会一次连跳 N 张）
    var liveFlip = null, liveMove = null;

    function current() { return order[idx % order.length]; }

    function spaceFlip(e) {
      if (UI.openLayers.length) return;   // 弹层打开时不劫持按键
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (liveFlip) liveFlip(); }
      else if (e.key === 'ArrowRight' && liveMove) { e.preventDefault(); liveMove(1); }
      else if (e.key === 'ArrowLeft' && liveMove) { e.preventDefault(); liveMove(-1); }
    }

    function draw() {
      var q = current();
      flipped = false;
      var rendered = MD.render(q.a);
      var front = el('div.rc-face.rc-front', [
        el('div.rc-kicker', [
          el('span.chip.chip-cat', { style: { color: q.color, background: q.color + '1a' } }, q.catName),
          el('span.rc-n', ((idx % order.length) + 1) + ' / ' + order.length),
        ]),
        el('h2.rc-q', q.q),
        el('div.rc-hint', [icon('info'), '先在心里把答案说一遍，再翻面']),
        el('div.rc-tags', q.t.slice(0, 5).map(function (t) { return el('span.tag-sm', '#' + t); }))
      ]);
      var back = el('div.rc-face.rc-back', { hidden: true }, [
        el('div.rc-kicker', [el('span.rc-n', '答案'), el('span.rc-tap', '再点一次翻回正面')]),
        el('article.md.rc-md', { html: rendered.html }),
        el('div.ans-tail', [
          el('button.text-btn', { onclick: function () { UI.copyText(q.q + '\n\n' + MD.plain(q.a)).then(function (ok) { UI.toast(ok ? '已复制' : '复制失败'); }); } }, [icon('copy'), '复制']),
          el('a.text-btn', { href: '#/q/' + q.id }, [icon('book'), '完整页'])
        ])
      ]);

      var card = el('div.rc-card', { id: 'rc-card' }, [front, back]);
      card.addEventListener('click', function (e) {
        if (e.target.closest('a, button')) return;
        flip();
      });

      var grade = el('div.rc-rate', [
        el('button.rate.again', { onclick: function () { doRate('again'); } }, [el('b', '不会'), el('i', '留在这轮')]),
        el('button.rate.good', { onclick: function () { doRate('good'); } }, [el('b', '记住了')]),
        el('button.rate.easy', { onclick: function () { doRate('easy'); } }, [el('b', '很熟')])
      ]);
      grade.hidden = true;

      clear(wrap).appendChild(el('div.rc-inner', [
        card, grade,
        el('div.rc-nav', [
          el('button.text-btn', { onclick: function () { move(-1); } }, [icon('back'), '上一张']),
          el('button.text-btn', { onclick: function () { move(1); } }, ['下一张', icon('right')])
        ]),
        el('div.rc-opt', [
          el('label.switch.sm', [
            el('input', { type: 'checkbox', checked: Store.settings().autoNext !== false, onchange: function () { Store.setSetting('autoNext', this.checked); } }),
            el('span.sl'), '评级后自动下一张 '
          ]),
          el('span.rc-tip', [icon('info'), '点击卡片翻面 · 空格也可翻面'])
        ])
      ]));

      function flip() {
        flipped = !flipped;
        front.hidden = flipped;
        back.hidden = !flipped;
        grade.hidden = !flipped;
        card.classList.toggle('flip', flipped);
        wrap.scrollTop = 0;
        if (flipped) { Store.markSeen(q.id); UI.buzz(6); }
      }
      function doRate(rating) {
        var removed = Store.grade(q.id, rating);
        UI.buzz(rating === 'again' ? 30 : 12);
        if (rating === 'again') {
          UI.toast('保留在本轮末尾', 'warn', 1200);
          order.push(q);   // 本轮再来一次
        } else if (Store.isMastered(q.id)) {
          UI.toast('🎉 该题已彻底掌握，移出背诵队列', 'ok', 1600);
        } else {
          UI.toast(removed && removed.removedWrong ? '已移出错题本' : '记住了，' + UI.dueText(Store.prog(q.id).due), 'ok', 1200);
        }
        App.updateBadges();
        if (Store.settings().autoNext !== false) setTimeout(function () { move(1); }, 180);
      }
      function move(step) {
        idx = ((idx + step) % order.length + order.length) % order.length;
        draw();
      }
      liveFlip = flip; liveMove = move;   // 更新为当前卡的闭包
    }

    draw();
    return {
      node: wrap, title: '背诵模式',
      sub: (cfg ? cfg.name + ' · ' : '') + order.length + ' 张卡片',
      back: true, tabId: 'today',
      actions: [{
        icon: 'refresh', label: '打乱顺序', onClick: function () {
          order = order.slice();
          for (var i = order.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = order[i]; order[i] = order[j]; order[j] = t; }
          idx = 0; draw(); UI.toast('已打乱', 'ok', 1000);
        }
      }],
      onMount: function () { document.addEventListener('keydown', spaceFlip); },
      onUnmount: function () { document.removeEventListener('keydown', spaceFlip); }
    };
  };

  /* ========================= 错题本 ========================= */
  Pages.wrong = function () {
    var list = Store.wrongList();
    var box = el('div.list-box');
    var head = el('div.page-head', [
      el('h2', '错题本'),
      el('p.sub', [
        '自评「不会」的题目会自动进入这里；', el('br'),
        '在任意模式连续答对（记住/秒答）', el('b', ' 2 次'), '后自动移出。'
      ])
    ]);

    function render() {
      var arr = Store.wrongList();
      clear(box);
      if (!arr.length) {
        box.appendChild(App.empty('check', '太棒了，错题本是空的', el('a.btn.primary', { href: '#/home' }, '去学习新题')));
        return;
      }
      // 按分类分组
      var byCat = {};
      arr.forEach(function (x) { (byCat[x.q.cat] = byCat[x.q.cat] || []).push(x); });
      Object.keys(byCat).forEach(function (cid) {
        var c = Store.cat(cid), items = byCat[cid];
        box.appendChild(el('div.grp-h', [
          el('span.grp-dot', { style: { background: c ? c.color : '#888' } }),
          el('b', c ? c.name : cid),
          el('i', items.length + ' 题')
        ]));
        items.forEach(function (x) {
          box.appendChild(el('div.wrong-row', [
            App.qItem(x.q, {
              extra: el('span.chip', '错 ' + x.n + ' 次'),
              right: el('span.q-right', [
                el('span.streak-tag' + (x.streak ? '.on' : ''), x.streak ? ('连对 ' + x.streak + '/2') : '未连对'),
                el('span.q-arrow', icon('right'))
              ])
            }),
            el('button.mini-btn.danger', {
              title: '移出错题本',
              onclick: function () {
                Store.clearWrong(x.q.id);
                UI.toast('已移出错题本', 'ok');
                render(); App.updateBadges();
              }
            }, icon('trash'))
          ]));
        });
      });
    }
    render();

    return {
      node: el('div.page', [
        head,
        list.length ? el('div.action-row', [
          el('button.btn.primary', { onclick: function () { App.go('/quiz?mode=test&n=' + Math.min(20, list.length)); } }, [icon('target'), '错题重做（抽 ' + Math.min(20, list.length) + ' 题）']),
          el('button.btn.ghost.danger-text', {
            onclick: function () {
              UI.confirm({ title: '清空错题本？', text: '将移除全部 ' + list.length + ' 条错题记录，题目内容不受影响。', danger: true, okText: '清空' }).then(function (ok) {
                if (!ok) return;
                Store.clearWrong(); render(); App.updateBadges(); UI.toast('已清空', 'ok');
              });
            }
          }, [icon('trash'), '清空'])
        ]) : null,
        box
      ]),
      title: '错题本', sub: list.length + ' 道待攻克', back: true, tabId: 'tools'
    };
  };

  /* ========================= 收藏夹 ========================= */
  Pages.fav = function () {
    var box = el('div.list-box');
    var state = { cat: '' };
    var bar = el('div.filterbar');

    function renderBar() {
      var list = Store.favList();
      var cats = [];
      var seen = {};
      list.forEach(function (q) { if (!seen[q.cat]) { seen[q.cat] = 1; cats.push(q.cat); } });
      clear(bar);
      [['', '全部', list.length]].concat(cats.map(function (cid) {
        var c = Store.cat(cid);
        return [cid, c ? c.name : cid, list.filter(function (q) { return q.cat === cid; }).length];
      })).forEach(function (f) {
        bar.appendChild(el('button.fbtn' + (state.cat === f[0] ? '.on' : ''), {
          onclick: function () { state.cat = f[0]; renderBar(); render(); }
        }, [f[1], el('i.fcount', String(f[2]))]));
      });
      if (!cats.length) bar.appendChild(el('span.hint', '暂无分类'));
    }
    function render() {
      var list = Store.favList();
      if (state.cat) list = list.filter(function (q) { return q.cat === state.cat; });
      clear(box);
      if (!list.length) {
        box.appendChild(App.empty('star', '还没有收藏题目', el('p.hint', '阅读页点右上角星标或按 F 键即可收藏')));
        return;
      }
      list.forEach(function (q, i) {
        box.appendChild(el('div.fav-row', [
          App.qItem(q, { index: i + 1, extra: el('span.chip', Store.isMastered(q.id) ? '已掌握' : '未掌握') }),
          el('button.mini-btn', {
            title: '取消收藏', onclick: function () {
              Store.toggleFav(q.id); UI.toast('已取消收藏', 'info'); renderBar(); render(); App.updateBadges();
            }
          }, icon('close'))
        ]));
      });
    }
    renderBar(); render();

    var list = Store.favList();
    return {
      node: el('div.page', [
        el('div.page-head', [el('h2', '收藏夹'), el('p.sub', list.length + ' 道题 · 面试前重点过一遍')]),
        list.length ? el('div.action-row', [
          el('a.btn.primary', { href: '#/recall' }, [icon('brain'), '背诵模式']),
          el('button.btn.ghost', {
            onclick: function () {
              var md = list.map(function (q) { return '# ' + q.q + '\n\n' + q.a; }).join('\n\n---\n\n');
              var head = '# 考途 · 我的收藏（' + list.length + ' 题）\n\n导出时间：' + UI.fmtDate(Date.now(), true) + '\n\n---\n\n';
              UI.download('我的收藏_' + Store.dateKey() + '.md', head + md, 'text/markdown;charset=utf-8');
            }
          }, [icon('down'), '导出 Markdown'])
        ]) : null,
        bar, box
      ]),
      title: '收藏夹', sub: list.length + ' 道', back: true, tabId: 'tools'
    };
  };

  /* ========================= 我的笔记 ========================= */
  Pages.notes = function () {
    var box = el('div.list-box');
    var kw = '';

    function render() {
      var list = Store.noteList();
      if (kw) {
        var k = kw.toLowerCase();
        list = list.filter(function (x) { return (x.q.q + x.text).toLowerCase().indexOf(k) >= 0; });
      }
      clear(box);
      if (!list.length) {
        box.appendChild(App.empty('note', kw ? '没有匹配的笔记' : '还没有写过笔记',
          el('p.hint', '在阅读页点「写笔记」，用自己的话复述答案——这是最有效的记忆方式')));
        return;
      }
      list.forEach(function (x) {
        var preview = MD.plain(x.text);
        box.appendChild(el('div.note-card', [
          el('div.nc-head', [
            el('span.chip.chip-cat', { style: { color: x.q.color, background: x.q.color + '1a' } }, x.q.catName),
            el('span.nc-at', UI.ago(x.at))
          ]),
          el('a.nc-q', { href: '#/q/' + x.q.id }, x.q.q),
          el('div.nc-txt', UI.truncate(preview, 200)),
          el('div.nc-ops', [
            el('button.text-btn', { onclick: function () { location.hash = '#/q/' + x.q.id; } }, [icon('book'), '看原题'])
          ])
        ]));
      });
      return list;
    }
    var rendered = render();

    var input = el('input.search-input', {
      type: 'search', placeholder: '搜索笔记内容或题目…', value: kw,
      oninput: function () { kw = this.value.trim(); render(); }
    });

    return {
      node: el('div.page', [
        el('div.page-head', [el('h2', '我的笔记'), el('p.sub', Store.noteList().length + ' 条个人理解记录')]),
        Store.noteList().length ? el('div.search-bar', input) : null,
        Store.noteList().length ? el('div.action-row', [
          el('button.btn.primary', {
            onclick: function () {
              var list = Store.noteList();
              var md = '# 考途 · 我的笔记（' + list.length + ' 条）\n\n导出时间：' + UI.fmtDate(Date.now(), true) + '\n\n' +
                list.map(function (x) {
                  return '## ' + x.q.q + '\n\n> 分类：' + x.q.catName + '　难度：' + x.q.d + '/5\n\n### 我的理解\n\n' + x.text + '\n\n### 标准答案\n\n' + x.q.a + '\n\n---\n';
                }).join('\n');
              UI.download('我的八股笔记_' + Store.dateKey() + '.md', md, 'text/markdown;charset=utf-8');
            }
          }, [icon('down'), '导出全部笔记（含标准答案）']),
          el('button.btn.ghost.danger-text', {
            onclick: function () {
              UI.confirm({ title: '删除全部笔记？', text: '此操作不可撤销，建议先导出备份。', danger: true, okText: '删除' }).then(function (ok) {
                if (!ok) return;
                Store.raw.notes = {}; Store.save(); App.render(); UI.toast('已删除全部笔记', 'ok');
              });
            }
          }, [icon('trash'), '清空'])
        ]) : null,
        box
      ]),
      title: '我的笔记', sub: Store.noteList().length + ' 条', back: true, tabId: 'tools'
    };
  };
})(window);
