/* =====================================================================
 * ui.js —— 通用 UI 原语 + 工具函数（零依赖）
 * ===================================================================== */
(function (global) {
  'use strict';

  /* ---------------------------- DOM 构建 ---------------------------- */
  /**
   * el('div.card#id[data-x=1]', children?, attrs?)
   * 参数顺序自适应：第二参为「纯对象」时视为 attrs（第三参为 children），
   * 否则第二参为 children、第三参为 attrs。两种调用风格都支持，避免调用方写错顺序。
   */
  function isAttrs(x) {
    return !!x && typeof x === 'object' && !Array.isArray(x) &&
      !(x instanceof global.Node) && !x.nodeType;
  }

  function el(spec, a, b) {
    var children, attrs;
    if (isAttrs(a)) { attrs = a; children = b; }
    else { children = a; attrs = b; }
    // 防御：attrs 只允许纯对象。字符串/数字/Node 误传到第三参时并入 children，
    // 避免 Object.keys('文字') 展开成索引 '0','1' 后 setAttribute('0',…) 报错
    //（Chrome 容忍数字开头的属性名，Android WebView 会直接抛异常）
    if (attrs != null && !isAttrs(attrs)) {
      children = children == null ? attrs
        : (Array.isArray(children) ? children.concat([attrs]) : [children, attrs]);
      attrs = null;
    }

    var head = spec.match(/^([a-zA-Z0-9\-]*)/)[1];
    var tag = head || 'div';
    var node = document.createElement(tag);
    // 解析 .class #id [attr=val]
    var tail = spec.slice(head.length);
    var re = /([.#])([^.#\[]+)|\[([^=\]]+)=([^\]]*)\]/g, mm;
    while ((mm = re.exec(tail)) !== null) {
      if (mm[1] === '.') node.classList.add(mm[2].trim());
      else if (mm[1] === '#') node.id = mm[2].trim();
      else if (mm[3]) node.setAttribute(mm[3], mm[4]);
    }
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v == null || v === false) return;
        if (k === 'class') node.className += (node.className ? ' ' : '') + v;
        else if (k === 'html') node.innerHTML = v;
        else if (k === 'text') node.textContent = v;
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
        else node.setAttribute(k, v === true ? '' : v);
      });
    }
    append(node, children);
    return node;
  }

  function append(node, children) {
    if (children == null || children === false) return node;
    if (Array.isArray(children)) { children.forEach(function (c) { append(node, c); }); return node; }
    if (children instanceof global.Node) { node.appendChild(children); return node; }
    if (typeof children === 'object' && children.nodeType) { node.appendChild(children); return node; }
    node.appendChild(document.createTextNode(String(children)));
    return node;
  }

  function frag(items, fn) {
    var f = document.createDocumentFragment();
    (items || []).forEach(function (it, idx) {
      var c = fn ? fn(it, idx) : it;
      if (c) f.appendChild(c);
    });
    return f;
  }

  function clear(node) { while (node && node.firstChild) node.removeChild(node.firstChild); return node; }

  function qs(s, r) { return (r || document).querySelector(s); }
  function qsa(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

  /* ---------------------------- 图标 ---------------------------- */
  var ICONS = {
    home: 'M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
    book: 'M4 4a2 2 0 0 1 2-2h13v18H6a2 2 0 0 0-2 2z M4 20a2 2 0 0 1 2-2h13',
    search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
    star: 'M12 3.5l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 10l6.1-.9z',
    starF: 'M12 3.5l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 10l6.1-.9z',
    user: 'M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM4 21a8 8 0 0 1 16 0',
    back: 'M15 5l-7 7 7 7',
    right: 'M9 5l7 7-7 7',
    close: 'M6 6l12 12M18 6L6 18',
    check: 'M4 12.5l5.5 5.5L20 6.5',
    clock: 'M12 6v6l4.5 2.5M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
    flame: 'M12 22c4 0 6.5-2.6 6.5-6 0-4.5-4.5-6-4.5-10 0 0-2.5 1.5-2.5 4.5 0-2-1.5-3-2.5-3.5.5 2-.5 3-1.5 4.5C6 13 5.5 14.2 5.5 16c0 3.4 2.5 6 6.5 6z',
    note: 'M5 3h9l5 5v13H5zM14 3v5h5M8 13h8M8 17h5',
    wrong: 'M12 3l9.5 17H2.5zM12 9v5M12 17h.01',
    grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
    chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
    layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17l9 5 9-5',
    down: 'M12 4v11M7 11l5 5 5-5M4 20h16',
    up: 'M12 20V9M7 13l5-5 5 5M4 4h16',
    copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
    eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    eyeOff: 'M4 4l16 16M10 6.2A9.6 9.6 0 0 1 12 6c6 0 10 6 10 6a17 17 0 0 1-2.6 3.2M6.7 8C3.9 9.7 2 12 2 12s4 6 10 6a9.8 9.8 0 0 0 3.4-.6',
    play: 'M7 4l13 8-13 8z',
    refresh: 'M20 12a8 8 0 1 1-2.6-5.9M20 4v5h-5',
    moon: 'M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z',
    sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v3M12 20v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M1 12h3M20 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1',
    trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
    plus: 'M12 5v14M5 12h14',
    filter: 'M3 5h18l-7 8v6l-4 2v-8z',
    link: 'M10 14a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1',
    card: 'M3 5h18v14H3zM3 9h18',
    target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
    settings: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7.5 19.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 13.9H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 7.5l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 10 3.1V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z',
    info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8h.01',
    zap: 'M13 2L4 14h6l-1 8 9-12h-6z',
    list: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
    brain: 'M9 3a3 3 0 0 0-3 3 3 3 0 0 0-1 5.8V15a4 4 0 0 0 4 4 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3zM15 3a3 3 0 0 1 3 3 3 3 0 0 1 1 5.8V15a4 4 0 0 1-4 4 3 3 0 0 1-3-3V6a3 3 0 0 1 3-3z',
    share: 'M4 12v8h16v-8M12 3v12M8 7l4-4 4 4',
    import: 'M12 3v11M8 10l4 4 4-4M4 20h16',
    award: 'M12 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM8.5 14L7 22l5-2.5L17 22l-1.5-8',
    sigma: 'M18 5H6l6 7-6 7h12',
    code: 'M9 18l-6-6 6-6M15 6l6 6-6 6',
    bookOpen: 'M12 7v14M3 5h5a4 4 0 0 1 4 4v12a3 3 0 0 0-3-3H3zM21 5h-5a4 4 0 0 0-4 4v12a3 3 0 0 1 3-3h6z',
    compass: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM15.5 8.5l-2 5-5 2 2-5z',
    swap: 'M4 8h13l-3-3M20 16H7l3 3',
    layers2: 'M12 3l9 4.5-9 4.5-9-4.5zM3 12l9 4.5L21 12M3 16.5L12 21l9-4.5',
    medal: 'M7 3h10l-2 5a5 5 0 1 1-6 0zM12 12a3 3 0 1 0 0 6 3 3 0 0 0 0-6z'
  };

  function icon(name, cls) {
    var d = ICONS[name] || ICONS.info;
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('class', 'ico ' + (cls || ''));
    s.setAttribute('aria-hidden', 'true');
    d.split(/\s*(?=M\d)/).forEach(function (part) {
      part = part.trim();
      if (!part) return;
      var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', part);
      s.appendChild(p);
    });
    return s;
  }

  /* ---------------------------- 文本工具 ---------------------------- */
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function fmtDate(ts, withTime) {
    if (!ts) return '—';
    var d = new Date(ts);
    var s = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    return withTime ? s + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) : s;
  }
  function ago(ts) {
    if (!ts) return '从未';
    var diff = Date.now() - ts;
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前';
    if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小时前';
    if (diff < 2592000000) return Math.floor(diff / 86400000) + ' 天前';
    return fmtDate(ts);
  }
  function dueText(due) {
    if (!due) return '已掌握';
    var diff = due - Date.now();
    if (diff <= 0) return '待复习';
    if (diff < 3600000) return Math.max(1, Math.round(diff / 60000)) + ' 分钟后';
    if (diff < 86400000) return Math.round(diff / 3600000) + ' 小时后';
    return Math.round(diff / 86400000) + ' 天后';
  }
  function truncate(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

  /* ---------------------------- 通知条 ---------------------------- */
  function toast(msg, type, ms) {
    var holder = qs('#toast-holder') || (function () {
      var d = el('div#toast-holder.toast-holder');
      document.body.appendChild(d); return d;
    })();
    var t = el('div.toast.' + (type || 'info'), [msg == null ? '' : String(msg)]);
    holder.appendChild(t);
    // 不用 rAF：后台标签页会被节流，导致入场动画类不生效
    setTimeout(function () { t.classList.add('in'); }, 20);
    setTimeout(function () {
      t.classList.remove('in');
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 280);
    }, ms || 2000);
    return t;
  }

  /* ---------------------------- 弹层（底部抽屉 / 居中对话框） ---------------------------- */
  var openLayers = [];

  function layer(contentNode, opts) {
    opts = opts || {};
    var mask = el('div.mask' + (opts.center ? '.center' : ''));
    var sheet = el('div.sheet' + (opts.center ? '.dialog' : ''), contentNode);
    if (opts.sheetClass) sheet.classList.add(opts.sheetClass);
    mask.appendChild(sheet);
    document.body.appendChild(mask);
    document.body.classList.add('no-scroll');
    setTimeout(function () { mask.classList.add('in'); }, 20);

    var api = {
      node: sheet, mask: mask,
      close: function () {
        mask.classList.remove('in');
        document.body.classList.remove('no-scroll');
        setTimeout(function () { if (mask.parentNode) mask.parentNode.removeChild(mask); }, 240);
        var i = openLayers.indexOf(api); if (i >= 0) openLayers.splice(i, 1);
        if (opts.onClose) opts.onClose();
      }
    };
    openLayers.push(api);
    if (opts.dismissible !== false) {
      mask.addEventListener('click', function (e) { if (e.target === mask) api.close(); });
    }
    // 下滑关闭
    var sy = null;
    sheet.addEventListener('touchstart', function (e) {
      sy = e.touches[0].clientY;
    }, { passive: true });
    sheet.addEventListener('touchmove', function (e) {
      if (sy == null) return;
      var dy = e.touches[0].clientY - sy;
      if (dy > 0 && sheet.scrollTop <= 0) sheet.style.transform = 'translateY(' + dy + 'px)';
    }, { passive: true });
    sheet.addEventListener('touchend', function (e) {
      var dy = e.changedTouches[0].clientY - (sy == null ? e.changedTouches[0].clientY : sy);
      sheet.style.transform = '';
      if (dy > 90 && opts.dismissible !== false) api.close();
      sy = null;
    }, { passive: true });
    return api;
  }

  /** 底部抽屉：title + 内容 */
  function sheet(title, bodyNode, opts) {
    opts = opts || {};
    var head = el('header.sheet-head', [
      el('span.sheet-grip'),
      el('div.sheet-title', title == null ? '' : title),
      el('button.icon-btn', { ariaLabel: '关闭', onclick: function () { api.close(); } }, icon('close'))
    ]);
    var wrap = el('div.sheet-body', bodyNode);
    var api = layer([head, wrap], opts);
    return api;
  }

  /** 确认框 */
  function confirmBox(o) {
    o = o || {};
    return new Promise(function (resolve) {
      var body = el('div.cfm', [
        o.title ? el('h3.cfm-t', o.title) : null,
        o.text ? el('p.cfm-x', o.text) : null,
        o.html ? el('div.cfm-h', { html: o.html }) : null,
        el('div.cfm-btns', [
          el('button.btn.ghost', { onclick: done.bind(null, false) }, o.cancelText || '取消'),
          el('button.btn.' + (o.danger ? 'danger' : 'primary'), { onclick: done.bind(null, true) }, o.okText || '确定')
        ])
      ]);
      var api = layer(body, { center: true, onClose: function () { resolve(false); } });
      function done(v) { api.__closing = true; api.close(); api.__closing = false; resolve(v); }
    });
  }

  /* ---------------------------- 剪贴板 ---------------------------- */
  function copyText(text) {
    text = String(text == null ? '' : text);
    function fallback() {
      try {
        var ta = el('textarea.copy-ta');
        ta.value = text;
        ta.setAttribute('readonly', '');
        document.body.appendChild(ta);
        ta.select();
        ta.setSelectionRange(0, text.length);
        var ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
      } catch (e) { return false; }
    }
    if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext !== false) {
      return navigator.clipboard.writeText(text).then(
        function () { return true; },
        function () { return fallback(); });
    }
    return Promise.resolve(fallback());
  }

  /* ---------------------------- 文件下载（避开 file:// 的 a[download] 限制） ---------------------------- */
  function download(filename, content, mime) {
    filename = String(filename || 'export.txt');
    mime = mime || 'application/json;charset=utf-8';
    try {
      var blob = new Blob([content], { type: mime });
      if (navigator.msSaveBlob) { navigator.msSaveBlob(blob, filename); toast('文件已保存：' + filename, 'ok'); return; }
      var url = URL.createObjectURL(blob);
      var a = el('a');
      a.href = url; a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1500);
      toast('文件已保存：' + filename, 'ok');
    } catch (e) {
      // file:// 下部分浏览器会拦截：改为弹窗展示，用户可手动全选复制
      var ta = el('textarea.mono.ta-full');
      ta.value = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
      ta.setAttribute('readonly', '');
      var api = sheet('无法自动下载，请手动复制保存', [
        el('p.hint', '当前以本地文件方式打开，浏览器限制了下载。请复制以下内容并保存为 ' + filename),
        ta,
        el('div.row', [el('button.btn.primary', { onclick: function () { ta.select(); copyText(ta.value).then(function (ok) { toast(ok ? '已复制到剪贴板' : '复制失败'); }); } }, '复制全部内容')])
      ]);
      setTimeout(function () { ta.select(); }, 100);
    }
  }

  /* ---------------------------- 文件读取 ---------------------------- */
  function readFile(input, cb) {
    var f = input.files && input.files[0];
    if (!f) return;
    var fr = new FileReader();
    fr.onerror = function () { toast('文件读取失败', 'err'); };
    fr.onload = function () { cb(String(fr.result), f); };
    fr.readAsText(f, 'utf-8');
  }

  /* ---------------------------- 震动 / 触感 ---------------------------- */
  function buzz(ms) { if (navigator.vibrate) { try { navigator.vibrate(ms || 12); } catch (e) { } } }

  /* ---------------------------- 滚动锁 ---------------------------- */
  function lockScroll(on) { document.body.classList[on ? 'add' : 'remove']('no-scroll'); }

  /** 关闭全部弹层（路由切换时调用，防确认框跨页残留 + body 锁滚动不释放） */
  function closeAllLayers() {
    openLayers.slice().forEach(function (api) {
      if (api && !api.__closing) api.close();
    });
  }

  /* ---------------------------- 简易事件总线 ---------------------------- */
  var bus = {};
  function on(evt, fn) { (bus[evt] = bus[evt] || []).push(fn); }
  function off(evt, fn) { if (!bus[evt]) return; bus[evt] = bus[evt].filter(function (f) { return f !== fn; }); }
  function fire(evt, data) { (bus[evt] || []).slice().forEach(function (f) { try { f(data); } catch (e) { console.error('[bus]', evt, e); } }); }

  /* ---------------------------- ESC 关闭 ---------------------------- */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      var top = openLayers[openLayers.length - 1];
      if (top && !top.__closing) top.close();
    }
    // 阅读页快捷键
    if (!openLayers.length && !/INPUT|TEXTAREA/.test((e.target.tagName || ''))) {
      if (e.key === ' ') {
        var ans = qs('#answer-body');
        if (ans) { e.preventDefault(); fire('toggle-answer'); }
      }
      if (e.key.toLowerCase() === 'f') { var fb = qs('#fav-btn'); if (fb) { e.preventDefault(); fb.click(); } }
    }
  });

  global.UI = {
    el: el, append: append, frag: frag, clear: clear, qs: qs, qsa: qsa,
    ICONS: ICONS, icon: icon,
    pad: pad, fmtDate: fmtDate, ago: ago, dueText: dueText, truncate: truncate,
    toast: toast, layer: layer, sheet: sheet, confirm: confirmBox,
    copyText: copyText, download: download, readFile: readFile,
    buzz: buzz, lockScroll: lockScroll, on: on, off: off, fire: fire,
    openLayers: openLayers, closeAllLayers: closeAllLayers
  };
})(window);
