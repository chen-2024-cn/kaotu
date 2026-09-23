/* =====================================================================
 * sw.js —— Service Worker：完全离线缓存（Cache First）
 * ---------------------------------------------------------------------
 * 策略：
 *  - 预缓存 App Shell（index.html / css / js / 全部 data / 图标）
 *  - 运行时 Cache First + 后台更新（Stale-While-Revalidate），离线必可用
 *  - 新版本上线后自动清理旧缓存
 * 注意：file:// 协议下浏览器不允许注册 SW，此时 App 仍可正常运行（只是没有离线缓存层）
 * ===================================================================== */
'use strict';

var VERSION = 'bagutong-v2.3.6';
var SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/md.js',
  './js/ui.js',
  './js/store.js',
  './js/sync.js',
  './js/app.js',
  './js/pages-core.js',
  './js/pages-practice.js',
  './js/pages-extra.js',
  './data/index.js',
  './data/q_java.js',
  './data/q_jvm.js',
  './data/q_concurrent.js',
  './data/q_mysql.js',
  './data/q_redis.js',
  './data/q_spring.js',
  './data/q_springboot.js',
  './data/q_mybatis.js',
  './data/q_mq.js',
  './data/q_distributed.js',
  './data/q_network.js',
  './data/q_os.js',
  './data/q_scene.js',
  './data/q_math_calc.js',
  './data/q_math_linalg.js',
  './data/q_math_prob.js',
  './data/q_eng_vocab.js',
  './data/q_eng_phrase.js',
  './data/q_eng_compose.js',
  './data/q_eng_read.js',
  './data/q_cet6_vocab.js',
  './data/q_cet6_listen.js',
  './data/q_cet6_read.js',
  './data/q_cet6_write.js',
  './data/q_cet4_vocab.js',
  './data/q_cet4_listen.js',
  './data/q_cet4_read.js',
  './data/q_cet4_write.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

/* 安装：预缓存全部资源，任一失败不影响其它（skipWaiting 立即接管） */
self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(VERSION).then(function (cache) {
      return Promise.all(SHELL.map(function (url) {
        return cache.add(new Request(url, { cache: 'reload' })).catch(function (err) {
          console.warn('[SW] 预缓存失败：' + url, err);
        });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

/* 激活：清理旧版本缓存 */
self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== VERSION && k.indexOf('bagutong-') === 0) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

/* 拦截：Network First → 成功则更新缓存；离线/失败时回退缓存
 * 选 Network First 的原因：题库与代码更新后用户下一次打开即生效，
 * 同时离线场景仍有完整缓存兜底（预缓存 + 历史缓存）。 */
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // 不处理跨域

  e.respondWith(
    fetch(req).then(function (res) {
      if (res && (res.status === 200 || res.type === 'opaque') && res.type !== 'cors') {
        var copy = res.clone();
        caches.open(VERSION).then(function (c) { c.put(req, copy); }).catch(function () { });
      } else if (res && res.status === 200) {
        var copy2 = res.clone();
        caches.open(VERSION).then(function (c) { c.put(req, copy2); }).catch(function () { });
      }
      return res;
    }).catch(function () {
      return caches.match(req, { ignoreSearch: true }).then(function (hit) {
        if (hit) return hit;
        // 主文档兜底
        if (req.mode === 'navigate') return caches.match('./index.html');
        return new Response('', { status: 504, statusText: 'offline-miss' });
      });
    })
  );
});

/* 允许页面主动跳过等待（用于「立即更新」） */
self.addEventListener('message', function (e) {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
