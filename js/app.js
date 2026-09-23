/* =====================================================================
 * app.js —— 应用外壳：启动 / 哈希路由 / 底部导航 / 共享组件
 * ===================================================================== */
window.QB = window.QB || {};
window.QB.packs = window.QB.packs || {};
window.QB.add = function (catId, arr) { window.QB.packs[catId] = arr || []; };

(function (global) {
  'use strict';

  var el = UI.el, qs = UI.qs, icon = UI.icon, clear = UI.clear;
  var Pages = global.Pages = {};
  var ROUTES = {};

  /* ---------------------------- 路由注册 ---------------------------- */
  function route(path, name) { ROUTES[path] = name; }

  function parseHash() {
    var h = (location.hash || '#/home').replace(/^#/, '');
    if (!h || h === '/') h = '/home';
    var qi = h.indexOf('?');
    var query = {};
    if (qi >= 0) {
      h.slice(qi + 1).split('&').forEach(function (kv) {
        if (!kv) return;
        var p = kv.split('=');
        query[decodeURIComponent(p[0])] = decodeURIComponent((p[1] || '').replace(/\+/g, ' '));
      });
      h = h.slice(0, qi);
    }
    var segs = h.split('/').filter(function (s) { return s !== ''; });
    return { path: h, segs: segs, query: query };
  }

  var current = null, scrollMemo = {};

  function go(path, replace) {
    if (path.charAt(0) !== '#') path = '#' + (path.charAt(0) === '/' ? path : '/' + path);
    if (replace) location.replace(path);
    else location.hash = path;
  }

  /**
   * 同分类内「翻题」专用导航（自动下一题 / 左右方向键 / 上下一题按钮）。
   * 用 replaceState 顶替当前历史条目 + openStack 栈顶，而不是压新栈：
   * 连背 N 个词后点一次返回即可回到分类/背诵入口，而非逐词后退。
   * （区别于「关联推荐」等主动跳转：那些仍用 go() 压栈，返回可回原题）
   */
  function flipTo(id) {
    pendingReplace = true;
    var href = '#/q/' + id;
    try {
      history.replaceState(null, '', href);   // replaceState 不触发 hashchange，需手动 render
      render();
    } catch (e) {
      // file:// 等受限环境可能抛异常：退回 hash push（pendingReplace 仍生效，左上角返回键照样一次回到入口）
      location.hash = href;
    }
  }

  /* ---------------------------- 启动 ---------------------------- */
  function boot() {
    Store.reload();  // 确保自定义题库与设置已加载
    buildChrome();
    window.addEventListener('hashchange', render);
    Store.onChange(function () { UI.fire('store-change'); });
    render();
    initPWA();
    initGlobalHandlers();
    if (Store.backend === 'memory') {
      setTimeout(function () {
        UI.toast('当前环境无法写入本地存储，学习进度不会被保存', 'warn', 4200);
      }, 900);
    }
    // 统计总量，首屏提示
    console.info('%c考途%c 题库 ' + Store.count() + ' 道 / ' + Store.cats().length + ' 个分类',
      'background:#2F6F5E;color:#fff;padding:2px 6px;border-radius:4px', 'color:#666');
  }

  function buildChrome() {
    var app = qs('#app');
    if (!app) return;
    if (qs('#view', app)) return;
    clear(app);
    app.appendChild(el('header#topbar.topbar', [
      el('button#tb-back.icon-btn', { ariaLabel: '返回', onclick: onBack }, icon('back')),
      el('div.tb-mid', [
        el('div#tb-title.tb-title', ''),
        el('div#tb-sub.tb-sub', '')
      ]),
      el('div#tb-actions.tb-actions')
    ]));
    app.appendChild(el('main#view.view'));
    app.appendChild(el('nav#tabbar.tabbar'));
    renderTabbar();
  }

  var TABS = [
    { id: 'home', label: '学习', icon: 'grid' },
    { id: 'today', label: '练习', icon: 'zap' },
    { id: 'me', label: '我的', icon: 'user' }
  ];

  /* 页面 → 所属 Tab 的高亮映射（含工具箱等非 Tab 页） */
  var TAB_OF = {
    home: 'home', category: 'home', tags: 'home', question: 'home',
    today: 'today', quiz: 'today', recall: 'today',
    me: 'me', search: 'me', wrong: 'me', fav: 'me', notes: 'me',
    stats: 'me', add: 'me', guide: 'me', tools: 'me'
  };

  function renderTabbar() {
    var tb = qs('#tabbar'); if (!tb) return;
    clear(tb);
    TABS.forEach(function (t) {
      var b = el('button.tab', {
        route: t.id,
        onclick: function () {
          UI.buzz(8);
          go('/' + t.id);
        }
      }, [
        el('span.tab-ic', [icon(t.icon)]),
        el('span.tab-lb', t.label),
        el('span.tab-dot', { hidden: true })
      ]);
      if (t.id === 'today') b.setAttribute('data-badge', '');
      tb.appendChild(b);
    });
    updateBadges();
  }

  function updateBadges() {
    var tb = qs('#tabbar'); if (!tb) return;
    // 角标 = 当前赛道的（到期复习数 与 今日未完成数 的较大者）
    var scope = {};
    var trk = Store.activeTrack();
    Store.trackQuestions(trk).forEach(function (q) { scope[q.id] = 1; });
    var due = Store.dueList().filter(function (x) { return scope[x.q.id]; }).length;
    var dp = Store.dailyProgress();
    var pending = Math.max(due, dp.total - dp.done);
    UI.qsa('.tab[data-badge]', tb).forEach(function (b) {
      var dot = qs('.tab-dot', b);
      if (dot) { dot.hidden = pending <= 0; dot.textContent = pending > 99 ? '99+' : String(pending); }
    });
  }

  function onBack() {
    UI.buzz(8);
    var l = openStack;
    if (l.length > 1) {
      location.hash = '#' + l[l.length - 2];
    } else if (history.length > 1) {
      history.back();
    } else {
      go('/home', true);
    }
  }

  var openStack = [];
  var lastRouteKey = null;
  var pendingReplace = false;  // 下一次 render 的路由栈更新用 replace 语义（连续翻题不压历史）
  var pendingUnmount = null;   // 上一页的卸载钩子（移除全局监听器，防泄漏/防跨页按键劫持）

  /* ---------------------------- 渲染 ---------------------------- */
  function render() {
    var r = parseHash();
    var key = r.path + JSON.stringify(r.query);
    // 立即消费 replace 标志：下方有 3 个 early-return 分支，若留到路由栈段再清会泄漏到下次导航
    var replaceTop = pendingReplace;
    pendingReplace = false;

    // 记录上一个页面滚动位置
    if (lastRouteKey) scrollMemo[lastRouteKey] = window.pageYOffset || qs('#view').scrollTop || 0;

    var name = matchRoute(r);
    var page = Pages[name];
    var view = qs('#view');
    if (!view) return;

    if (!page) {
      setChrome({ title: '页面不存在', back: false, tabId: '', actions: [] });
      clear(view).appendChild(el('div.empty', [icon('wrong'), el('p', '没有匹配的内容'), el('button.btn.primary', { onclick: function () { go('/home'); } }, '回到知识地图')]));
      return;
    }

    // 渲染新页前，先卸载上一页注册的全局监听器（题目页 keydown / 背诵页空格翻卡等）
    if (pendingUnmount) { try { pendingUnmount(); } catch (e) { console.error(e); } pendingUnmount = null; }
    // 路由切换必关弹层：否则确认框悬浮在新页之上，且 body 的 no-scroll 锁死不释放
    if (UI.closeAllLayers) { try { UI.closeAllLayers(); } catch (e) { console.error(e); } }

    var ctx = { route: r, query: r.query, params: r.params || {} };
    var res;
    try {
      res = page(ctx) || {};
    } catch (err) {
      console.error('[render] 页面渲染异常:', name, err);
      clear(view).appendChild(el('div.err-box', [
        el('h3', '页面加载出现异常'),
        el('pre', String(err && err.stack || err)),
        el('p.hint', '这不影响已保存的数据，可在「我的」页重置进度后重试，或反馈错误信息。'),
        el('button.btn.primary', { onclick: function () { go('/home'); } }, '返回首页')
      ]));
      return;
    }

    clear(view).appendChild(res.node || el('div'));
    setChrome({
      title: res.title, sub: res.sub, back: res.back !== false,
      page: name, tabId: res.tab || '', actions: res.actions || []
    });

    // 恢复滚动位置（setTimeout 代替 rAF，防后台标签页节流）
    var memo = scrollMemo[key];
    setTimeout(function () {
      window.scrollTo(0, res.scroll === false ? 0 : (memo || 0));
    }, 30);

    if (res.onMount) { try { res.onMount(view); } catch (e) { console.error(e); } }
    pendingUnmount = res.onUnmount || null;

    // 路由栈
    if (key !== lastRouteKey) {
      var idx = openStack.indexOf(r.path);
      // 连续翻题（replaceTop）：顶替栈顶而非压栈，返回键一次回入口
      if (idx >= 0) openStack = openStack.slice(0, idx + 1);
      else if (replaceTop && openStack.length) openStack[openStack.length - 1] = r.path;
      else openStack.push(r.path);
      if (openStack.length > 30) openStack.shift();
    }
    lastRouteKey = key;

    updateBadges();
    UI.fire('page:change', { name: name, ctx: ctx });
  }

  function matchRoute(r) {
    var segs = r.segs;
    var head = segs[0] || 'home';
    if (head === 'q' && segs[1]) { r.params = { id: segs[1] }; return 'question'; }
    if (head === 'c' && segs[1]) { r.params = { id: segs[1] }; return 'category'; }
    var alias = {
      home: 'home', today: 'today', tools: 'tools', me: 'me', search: 'search',
      quiz: 'quiz', recall: 'recall', wrong: 'wrong', fav: 'fav', notes: 'notes',
      stats: 'stats', add: 'add', guide: 'guide', tags: 'tags',
      backup: 'me'   // 「数据与备份」页已下线，旧链接/书签重定向到「我的」的数据卡
    };
    return alias[head] || '';
  }

  function setChrome(o) {
    o = o || {};
    var t = qs('#tb-title'), s = qs('#tb-sub'), b = qs('#tb-back'), a = qs('#tb-actions');
    if (t) t.textContent = o.title || '';
    if (s) { s.textContent = o.sub || ''; s.hidden = !o.sub; }
    if (b) b.hidden = o.back === false;
    if (a) {
      clear(a);
      (o.actions || []).forEach(function (act) {
        if (!act) return;
        var btn = el('button.icon-btn', {
          ariaLabel: act.label || '', title: act.label || '',
          onclick: function (e) { e.preventDefault(); UI.buzz(8); act.onClick && act.onClick(); }
        }, act.html ? null : icon(act.icon || 'info'));
        if (act.html) btn.innerHTML = act.html;
        if (act.badge) {
          btn.appendChild(el('span.dot-badge', String(act.badge)));
        }
        a.appendChild(btn);
      });
    }
    // 首页 title 即品牌名时不重复拼接（避免「考途 · 考途」）
    document.title = (o.title && o.title !== '考途' ? o.title + ' · ' : '') + '考途';
    var tabId = TAB_OF[o.page] || o.tabId || '';
    UI.qsa('#tabbar .tab').forEach(function (tab) {
      tab.classList.toggle('on', tab.getAttribute('route') === tabId);
    });
  }

  /* ---------------------------- 共享组件 ---------------------------- */
  /** 进度环 */
  function ring(pct, size, color, track) {
    size = size || 40;
    var r = (size - 5) / 2, c = 2 * Math.PI * r;
    var p = Math.max(0, Math.min(100, pct || 0));
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 ' + size + ' ' + size);
    svg.setAttribute('class', 'ring');
    svg.style.width = svg.style.height = size + 'px';
    var t = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    t.setAttribute('cx', size / 2); t.setAttribute('cy', size / 2); t.setAttribute('r', r);
    t.setAttribute('class', 'ring-bg');
    var f = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    f.setAttribute('cx', size / 2); f.setAttribute('cy', size / 2); f.setAttribute('r', r);
    f.setAttribute('class', 'ring-fg');
    f.setAttribute('stroke-dasharray', c.toFixed(2));
    f.setAttribute('stroke-dashoffset', (c * (1 - p / 100)).toFixed(2));
    f.setAttribute('transform', 'rotate(-90 ' + size / 2 + ' ' + size / 2 + ')');
    if (color) f.style.stroke = color;
    if (track) t.style.stroke = track;
    svg.appendChild(t); svg.appendChild(f);
    return svg;
  }

  /** 章节条目卡片 */
  function catCard(c, stats) {
    var n = el('a.cat-card', { href: '#/c/' + c.id }, [
      el('span.cat-badge', { style: { background: c.color + '1f', color: c.color } }, c.badge || c.name.slice(0, 2)),
      el('div.cat-main', [
        el('div.cat-name', c.name),
        el('div.cat-desc', c.desc || '')
      ]),
      el('div.cat-right', [
        el('div.cat-num', [String(stats.mastered), el('i', ' / ' + stats.total)]),
        ring(stats.pct, 34, c.color)
      ])
    ]);
    return n;
  }

  /** 题干列表项（列表页 / 搜索结果通用） */
  function qItem(q, opts) {
    opts = opts || {};
    var st = Store.stateOf(q.id);
    var stateCls = st === 'mastered' ? 'ok' : st === 'new' ? 'new' : 'ing';
    var stateTxt = st === 'mastered' ? '已掌握' : st === 'new' ? '未学' : st === 'review' ? '复习中' : '学习中';
    return el('a.q-item', {
      href: '#/q/' + q.id,
      onclick: function () { UI.buzz(6); }
    }, [
      opts.index != null ? el('span.q-idx', String(opts.index)) : null,
      el('div.q-body', [
        el('div.q-title', { html: opts.htmlTitle || null }, opts.htmlTitle ? null : MD.esc(q.q)),
        opts.snippet ? el('div.q-snip', { html: opts.snippet }) : null,
        el('div.q-meta', [
          el('span.chip.chip-cat', { style: { color: q.color, background: q.color + '1a' } }, q.catName),
          el('span.state.' + stateCls, stateTxt),
          q.f === 'high' ? el('span.freq.hi', '高频') : q.f === 'low' ? el('span.freq.lo', '低频') : null,
          opts.extra || null
        ])
      ]),
      opts.right || el('span.q-arrow', icon('right'))
    ]);
  }

  /** 频率文本 */
  function freqText(f) { return f === 'high' ? '高频' : f === 'low' ? '低频' : '中频'; }

  /** 空状态 */
  function empty(ico, text, btn) {
    return el('div.empty', [icon(ico || 'info'), el('p', text || '暂无内容'), btn || null]);
  }

  /** 顶部吸顶筛选条 */
  function filterBar(filters, active, onChange) {
    return el('div.filterbar', filters.map(function (f) {
      return el('button.fbtn' + (active === f.id ? '.on' : ''), {
        onclick: function () { onChange(f.id); }
      }, [f.icon ? icon(f.icon) : null, f.label, f.count != null ? el('i.fcount', String(f.count)) : null]);
    }));
  }

  /* ---------------------------- 全局代理事件 ---------------------------- */
  function initGlobalHandlers() {
    document.addEventListener('click', function (e) {
      // 代码复制
      var cp = e.target.closest ? e.target.closest('[data-copy]') : null;
      if (cp) {
        var box = cp.closest('figure.codebox');
        var code = box ? box.querySelector('code') : null;
        UI.copyText(code ? code.textContent : cp.getAttribute('data-copy')).then(function (ok) {
          var old = cp.textContent;
          cp.textContent = ok ? '已复制' : '复制失败';
          cp.classList.add('done');
          setTimeout(function () { cp.textContent = old; cp.classList.remove('done'); }, 1400);
        });
        return;
      }
      // 跳题链接
      var lk = e.target.closest ? e.target.closest('a.qlink') : null;
      if (lk) {
        e.preventDefault();
        var id = lk.getAttribute('data-qid') || (lk.getAttribute('href') || '').split('/').pop();
        if (Store.get(id)) go('/q/' + id); else UI.toast('题目不存在：' + id, 'warn');
        return;
      }
      // 答案内标题 → 目录滚动
      var th = e.target.closest ? e.target.closest('[data-anchor]') : null;
      if (th) {
        e.preventDefault();
        var target = document.getElementById(th.getAttribute('data-anchor'));
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          target.classList.add('flash');
          setTimeout(function () { target.classList.remove('flash'); }, 1200);
        }
      }
    });
  }

  /* ---------------------------- PWA ---------------------------- */
  var deferredPrompt = null;
  function initPWA() {
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault(); deferredPrompt = e;
      UI.fire('install-available');
    });
    window.addEventListener('appinstalled', function () {
      deferredPrompt = null;
      UI.toast('安装成功，可在桌面找到「考途」', 'ok', 3000);
    });
    // 注册 Service Worker（file:// 下会失败，静默降级）
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js').then(function () {
          console.info('[PWA] Service Worker 已注册');
        }).catch(function (err) { console.warn('[PWA] SW 注册失败', err); });
      });
    }
  }
  function canInstall() { return !!deferredPrompt; }
  function promptInstall() {
    if (!deferredPrompt) {
      UI.toast(isIOS() ? 'iOS 请点击分享按钮 → 添加到主屏幕' : '浏览器未提供安装入口，可从菜单中选择「安装应用」', 'info', 3600);
      return Promise.resolve(false);
    }
    deferredPrompt.prompt();
    return deferredPrompt.userChoice.then(function (r) {
      var ok = r.outcome === 'accepted';
      deferredPrompt = null;
      if (ok) UI.toast('正在安装…', 'ok');
      return ok;
    }).catch(function () { return false; });
  }
  function isIOS() { return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
  function isStandalone() {
    return window.matchMedia && (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true);
  }

  /* ---------------------------- 导出 ---------------------------- */
  global.App = {
    boot: boot, go: go, flipTo: flipTo, render: render, route: route,
    ring: ring, catCard: catCard, qItem: qItem, empty: empty, filterBar: filterBar,
    freqText: freqText, scrollMemo: scrollMemo,
    canInstall: canInstall, promptInstall: promptInstall,
    isIOS: isIOS, isStandalone: isStandalone,
    updateBadges: updateBadges, parseHash: parseHash,
    TABS: TABS
  };
})(window);
