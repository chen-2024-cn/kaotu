/* =====================================================================
 * sync.js —— 在线题库同步（服务器 db/*.json → App）
 * ---------------------------------------------------------------------
 * 流程：GET {base}/api/version（轻量）→ 与本地版本比对
 *      → 不同则 GET {base}/api/bank 下载全量 → 存 bagutong.remote
 *      → Store 重建索引 → UI 提示刷新
 * 原则：
 *  - 任何失败都静默降级（离线/服务器挂了照常使用本地数据）
 *  - 同一版本不重复下载（省流量）
 *  - 学习进度永远不参与同步，不会被服务器覆盖
 * ===================================================================== */
(function (global) {
  'use strict';

  var KEY_STATE = 'bagutong.sync';   // {lastCheck, lastOk, version, errors}

  function apiBase() {
    var s = Store.settings() || {};
    var u = String(s.syncUrl || '').trim().replace(/\/+$/, '');
    if (u) return u;
    // 同源模式（http/https 打开时），API 与页面同域
    if (location.protocol === 'http:' || location.protocol === 'https:') return '';
    return null;   // file:// 且未配置 → 无法同步
  }

  function loadState() {
    try { return JSON.parse(localStorage.getItem(KEY_STATE) || '{}'); } catch (e) { return {}; }
  }
  function saveState(o) {
    try { localStorage.setItem(KEY_STATE, JSON.stringify(o)); } catch (e) { }
  }
  function state() {
    var st = loadState();
    var rb = Store.remoteBank();
    return {
      base: apiBase(),
      localVersion: rb ? rb.version : '',
      downloadedAt: rb ? rb.downloadedAt : 0,
      questionCount: rb && rb.bank ? rb.bank.questions.length : 0,
      lastCheck: st.lastCheck || 0,
      lastOk: st.lastOk || 0,
      lastError: st.lastError || '',
      remoteVersion: st.version || ''
    };
  }

  var TIMEOUT = 12000;
  // _t 时间戳：穿透 CDN/静态托管缓存（bank.json 可能被 Pages/OSS 边缘缓存）
  function bust(url) { return url + (url.indexOf('?') >= 0 ? '&' : '?') + '_t=' + Date.now(); }
  function getJSON(url) {
    var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, TIMEOUT) : null;
    var headers = { 'Accept': 'application/json' };
    // ngrok 免费版会给浏览器 UA 弹拦截警告页（返回 HTML），带此头可跳过直接拿 JSON
    headers['ngrok-skip-browser-warning'] = 'bagutong';
    var opt = { cache: 'no-store', headers: headers };
    if (ctrl) opt.signal = ctrl.signal;
    return fetch(bust(url), opt).then(function (res) {
      if (!res.ok) { var e = new Error('HTTP ' + res.status); e.status = res.status; throw e; }
      return res.json();
    }).finally(function () { if (timer) clearTimeout(timer); });
  }
  /**
   * 依次尝试多个 URL（动态 API 优先，404/403 回退静态 JSON）。
   * 静态托管（GitHub Pages/COS/OSS）上没有 /api/version，只有 tools/export_static.py 导出的 *.json。
   */
  function getJSONAny(urls) {
    var i = 0;
    function next() {
      if (i >= urls.length) return Promise.reject(new Error('HTTP 404'));
      return getJSON(urls[i++]).catch(function (e) {
        if (e && (e.status === 404 || e.status === 403) && i < urls.length) return next();
        throw e;
      });
    }
    return next();
  }

  /**
   * 检查并同步。
   * @param {object} opts {silent:boolean 静默模式不弹toast, force:boolean 即使版本一致也重下}
   * @returns {Promise<{status:'updated'|'same'|'offline'|'disabled'|'error', ...}>}
   */
  function sync(opts) {
    opts = opts || {};
    var base = apiBase();
    var st = loadState();
    st.lastCheck = Date.now();

    if (base === null) {
      st.lastError = '未配置 API 地址（file:// 模式下需在「我的 → 一键下载在线题库」填写服务器地址）';
      saveState(st);
      var r = { status: 'disabled', msg: st.lastError };
      if (!opts.silent) UI.toast(r.msg, 'warn', 3800);
      return Promise.resolve(r);
    }

    return getJSONAny([(base || '') + '/api/version', (base || '') + '/api/version.json'])
      .then(function (v) {
        if (v.error) throw new Error(v.hint || v.error);
        st.version = v.version || '';
        var rb = Store.remoteBank();
        var local = rb ? rb.version : '';
        if (local === v.version && !opts.force) {
          st.lastOk = Date.now(); st.lastError = ''; saveState(st);
          var same = { status: 'same', serverVersion: v.version, questions: v.questions };
          if (!opts.silent) UI.toast('题库已是最新（版本 ' + v.version + '，' + v.questions + ' 题）', 'ok', 2200);
          return same;
        }
        // 版本不同 → 下载全量题库（动态 API 优先，静态 bank.json 兜底）
        return getJSONAny([(base || '') + '/api/bank', (base || '') + '/api/bank.json']).then(function (bank) {
          if (bank.error) throw new Error(bank.hint || bank.error);
          if (!Array.isArray(bank.questions) || !bank.questions.length) throw new Error('服务器题库为空，已忽略（本地数据保持不变）');
          return Store.saveRemoteBank(bank).then(function (ok) {
            if (!ok) throw new Error('本地存储空间不足，无法保存新题库');
            Store.reload();          // 重建题目索引
            st.lastOk = Date.now(); st.lastError = ''; st.version = bank.version || '';
            saveState(st);
            UI.fire('bank-synced', { version: bank.version, questions: bank.questions.length });
            var up = {
              status: 'updated', serverVersion: bank.version,
              questions: bank.questions.length,
              from: local ? local : '内置', to: bank.version
            };
            UI.toast('🎉 题库已更新到版本 ' + bank.version + '（' + bank.questions.length + ' 题）' +
              (local ? '' : '，首次联网同步'), 'ok', 3600);
            return up;
          });
        });
      })
      .catch(function (err) {
        st.lastError = String(err && err.message || err);
        saveState(st);
        var e = { status: (err && err.name === 'AbortError') ? 'timeout' : (/Failed to fetch|NetworkError|HTTP/i.test(st.lastError) ? 'offline' : 'error'), msg: st.lastError };
        if (!opts.silent) {
          UI.toast(e.status === 'offline' || e.status === 'timeout'
            ? '连不上题库服务器，继续使用本地题库（不影响学习）' : ('同步失败：' + e.msg), e.status === 'error' ? 'err' : 'warn', 3200);
        }
        return e;
      });
  }

  /** App 启动后静默检查一次 */
  function autoSyncOnBoot() {
    var s = Store.settings() || {};
    if (s.autoSync === false) return Promise.resolve({ status: 'disabled' });
    return sync({ silent: true }).then(function (r) {
      if (r && r.status === 'updated') {
        // 有新题库：若当前在首页/分类页等列表场景，静默重渲染让新内容立即可见
        try { if (typeof App !== 'undefined' && App.render) App.render(); } catch (e) { }
      }
      return r;
    });
  }

  function setSyncUrl(url) {
    url = String(url || '').trim().replace(/\/+$/, '');
    if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
    Store.setSetting('syncUrl', url);
    return url;
  }

  function clearRemote() {
    Store.clearRemoteBank();
    Store.reload();
    try { localStorage.removeItem(KEY_STATE); } catch (e) { }
  }

  global.Sync = { sync: sync, autoSyncOnBoot: autoSyncOnBoot, state: state, apiBase: apiBase, setSyncUrl: setSyncUrl, clearRemote: clearRemote };
})(window);
