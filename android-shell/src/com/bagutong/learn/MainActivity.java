package com.bagutong.learn;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.Window;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * 八股通 —— WebView 壳。
 *
 * 承载随包 assets/index.html（整个学习 App 都在里面），做到：
 *  - 桌面图标点开即用、全屏、无浏览器地址栏，体验等同原生 App
 *  - localStorage 持久化（学习进度、错题、收藏、笔记）
 *  - 允许 file:// 页面 fetch 远程 API（在线题库热更新）
 *  - 系统返回键在 App 内逐级后退，退到根再退出
 *
 * 注意：Service Worker 在 file:// 下不可用，App 已自动跳过 SW 注册，
 *      离线能力由「资源全部打进 assets」保证，无需 SW。
 */
public class MainActivity extends Activity {

    private static final String START_URL = "file:///android_asset/index.html";
    private static final int BRAND = Color.parseColor("#2F6F5E");

    private WebView webView;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);

        webView = new WebView(this);
        WebSettings s = webView.getSettings();

        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);      // ★ localStorage：学习进度持久化的关键
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setJavaScriptCanOpenWindowsAutomatically(false);

        // file:// 页面需放开同源限制才能 fetch 公网 API（在线题库同步）
        s.setAllowFileAccessFromFileURLs(true);
        s.setAllowUniversalAccessFromFileURLs(true);

        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setSupportZoom(true);
        s.setBuiltInZoomControls(true);
        s.setDisplayZoomControls(false);
        s.setTextZoom(100);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setMediaPlaybackRequiresUserGesture(false);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
            CookieManager cm = CookieManager.getInstance();
            cm.setAcceptCookie(true);
            cm.setAcceptThirdPartyCookies(webView, true);
        }

        webView.setBackgroundColor(BRAND);   // 首屏底色，避免白闪
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                // 站内（file://android_asset）正常加载；外链交给系统浏览器
                if (url != null && (url.startsWith("http://") || url.startsWith("https://"))) {
                    // 允许 fetch 类 API 调用（同源判断交给页面），此处仅拦截用户点击的外链导航
                    try {
                        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                        startActivity(i);
                    } catch (Exception ignored) { }
                    return true;
                }
                return false;
            }

            @SuppressWarnings("deprecation")
            @Override
            public void onReceivedError(WebView view, int code, String desc, String failingUrl) {
                // 单个资源 404 不致命，主文档失败才提示
                if (failingUrl != null && failingUrl.contains("index.html")) {
                    view.loadData(errorHtml("本地资源加载失败", "assets/index.html 未正确打包，请重新构建 APK。"),
                            "text/html; charset=utf-8", "utf-8");
                }
            }
        });
        webView.setWebChromeClient(new WebChromeClient());

        webView.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(String url, String ua, String disp, String mime, long len) {
                if (url == null) return;
                if (url.startsWith("blob:")) {
                    // Blob 下载 WebView 不支持；页面的「复制内容」兜底已可用，这里提示一次
                    return;
                }
                try {
                    Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                    startActivity(i);
                } catch (Exception ignored) { }
            }
        });

        setContentView(webView);
        webView.loadUrl(START_URL);

        try {
            Window w = getWindow();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                w.setStatusBarColor(BRAND);
            }
        } catch (Exception ignored) { }
    }

    private String errorHtml(String title, String msg) {
        return "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'>"
            + "<body style='font-family:-apple-system,PingFang SC,sans-serif;background:#12161A;color:#E4EAE7;"
            + "display:flex;min-height:90vh;align-items:center;justify-content:center;text-align:center;padding:24px'>"
            + "<div><div style='font-size:40px'>⚠️</div><h2 style='margin:12px 0 6px'>" + title
            + "</h2><p style='color:#8C978F;font-size:14px;line-height:1.7'>" + msg + "</p></div></body>";
    }

    /** 系统返回键：优先在 App 内后退，回到根页面再退出 */
    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && webView != null && webView.canGoBack()) {
            webView.goBack();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (webView != null) {
            webView.onPause();
            webView.pauseTimers();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            webView.onResume();
            webView.resumeTimers();
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.stopLoading();
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
