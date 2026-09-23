# 考途 · 求职面试与考研学习工具

> 离线优先的 PWA 学习工具：**五大赛道 274 题**（求职面试 125 + 考研数学 36 + 考研英语 56 + CET-6 30 + CET-4 27）
> + 间隔重复记忆算法 + 错题本 + 背诵模式 + 学习统计 + 数学公式渲染。
> 零依赖、零构建、无后端、无 CDN —— 双击即用，也能装到手机桌面当原生 App 用。
> **数据即 JSON**：`db/*.json` 就是数据库，改完即生效，无需任何同步步骤。

![icon](icons/icon-192.png)

---

## 一、30 秒上手

### 方式 A：双击即用（最简单）
直接双击 `index.html` 打开即可使用（学习进度存浏览器 localStorage）。

### 方式 A+：单文件离线版（无需电脑、无需局域网、手机上直接用）★
```bash
python tools/make_single_file.py
```
生成 `dist/考途-单文件版.html`（约 646KB，含全部 274 题）。把这个文件通过微信/QQ/网盘/数据线发到手机，用浏览器打开就是一个完全离线的学习 App：
- **安卓**：文件管理器中选「用浏览器打开」即用，进度存手机浏览器，无需任何服务器
- **iOS**：iOS 对本地 HTML 限制较多，推荐方式 B 在局域网里用 Safari 打开一次并「添加到主屏幕」，之后永久离线
- 题库更新后跑 `python tools/release.py` 一键重建全部产物（含单文件版）

### 方式 B：本地服务（推荐，可安装为桌面 App）
```bash
python tools/serve.py          # 默认 8080 端口，自动打开浏览器
# 或
python tools/serve.py 9000     # 换端口
```
启动后控制台会打印**手机可访问的局域网地址**：
- Android Chrome：菜单 →「安装应用」→ 桌面出现独立图标，全屏离线运行
- iPhone Safari：分享 →「添加到主屏幕」

### 方式 C：服务器部署 + 公网链接（支持题库热更新）★

#### 一键启动（推荐，Windows）

双击项目根的 **`启动服务器.bat`** 即可：它会自动启动题库服务器，并尝试建立 ngrok 公网隧道，最后在一个窗口里打印本机 / 局域网 / 公网三种访问地址。关闭窗口即全部停止。

- **首次运行**会问你要不要配置公网隧道：选 `Y` 后弹出掩码输入框，粘贴一次 ngrok authtoken（<https://dashboard.ngrok.com/get-started/your-authtoken>）即可，token 存进 `.ngrok_token`（已被 `.gitignore` 忽略，绝不外泄）；之后每次双击全自动。
- **不配置 token 也能用**：自动降级为「本机 + 局域网」模式，手机连同 Wi-Fi 即可访问局域网地址；APK/单文件版仍可离线使用内置题库。
- 隧道优先绑定你的 ngrok **保留域名**（读本机 `.public_api` 配置，与 App 内置默认一致）→ 手机端**零配置**直接可用；若账号没有该保留域名，会回退随机域名，且启动窗口会**自动把新地址烤进单文件版**（分发即用）；APK 则在「我的 → 一键下载在线题库」的地址栏填一次即可。
- 一键处理链：启动后自动执行 serve.py → ngrok 隧道 → 回写 `.tunnel_url` → 重新打包单文件版（地址注入），全程无需手动操作。

命令行等价写法：

```bash
python tools/run_all.py            # 默认 8080；等同双击 启动服务器.bat
```

#### 手动分步（跨平台通用）

服务器只要能跑 Python 即可，配合 ngrok/frp 等隧道得到公网链接：

```bash
# 1) 启动服务（静态页面 + 题库 API，直读 db/*.json）
python tools/serve.py 8080 --no-open

# 2) ngrok 指向该端口，得到公网链接（如 https://xxx.ngrok-free.dev）
```

日常更新题库（**零步骤、无需重启服务、用户无感知**）：

```bash
# 直接编辑 db/*.json（JSON 即数据库）
#    改完什么都不用做：服务器按文件 mtime 自动重载，App 打开即拿到新题库
```

App 端行为：
- 「我的 → 数据」卡片只有**一键下载在线题库**：点一下即从服务器拉取全部题库存本机（同源直连；APK/单文件版用打包时注入的地址，域名变更可在卡内就地改）
- 下载卡片内显示当前题库版本/题量/上次下载时间，一眼看到状态
- 每次打开静默调 `GET /api/version`（几百字节）比对内容指纹版本，不同则自动拉全量
- 学习进度只存本机，**永不会被下载覆盖**；断网时用上次的题库照常学习
- ngrok 免费版拦截页已处理（请求带 ngrok-skip-browser-warning 头）
- 服务器下发内容 = 内置 `db/*.json` + 采集 `json数据/qpack-*.json` 全量合并（四级/六级/考研完整词库，约 4200+ 题）

### 方式 E：直接生成 .apk 安装包（原生 App 体验）★
```bash
python tools/build_apk.py            # 产物：dist/考途.apk（约 300KB）
```
无需 Gradle / Android Studio，直接用本机 JDK + Android SDK build-tools 手打：
- **WebView 壳 + assets 内嵌全部前端**：桌面图标点开即用、全屏、无地址栏，完全离线
- 学习进度存 WebView 的 localStorage，卸载前永久保留
- minSdk 21（Android 5.0+）、targetSdk 29，已 zipalign + apksigner 签名
- 安装：`adb install -r dist\考途.apk`，或把 apk 发到手机点击安装（需允许「安装未知来源应用」）
- 在线热更新同样可用：启动服务器.bat 会自动绑定保留域名，APK 零配置；域名变了则在「我的」下载卡地址栏填一次
- 改前端/题库后重新跑一句 build_apk.py 即可重新出包（签名密钥复用，可覆盖安装）

前置依赖（均已自动探测）：JDK 17+、Android build-tools（含 aapt2/dx/zipalign/apksigner）、platforms/android-*/android.jar。
构建脚本已规避两个 Windows 坑：中文路径（构建搜在 %TEMP% ASCII 目录进行）与 aapt2 assets 反斜杠路径（assets 改用 jar 追加）；老 apksigner 不认 PKCS12，密钥固定 JKS；老 d8 在 JDK 21 下 NPE，已改经典 dx。

### 方式 D：纯静态托管（免费，也支持题库热更新）★
不想要一台常开的服务器？把题库导出成两个 JSON 静态文件，丢到任意静态托管即可：

```bash
python tools/export_static.py        # 生成 deploy/api/version.json + bank.json
```

托管（任选其一，全部免费）：
- **GitHub Pages**：把 `deploy/` 推到仓库开 Pages，App 内填 `https://<用户名>.github.io/<仓库>`
- **腾讯云 COS / 阿里云 OSS**：上传 `deploy/api/`，开启静态网站 + CORS（允许所有来源 GET）
- **Vercel / Netlify / Cloudflare Pages**：拖入 `deploy/` 目录直接部署

更新流程：改 `db/*.json` → 重跑 `export_static.py` → 覆盖上传两个 JSON。App「我的」下载卡地址栏填**站点根地址**（客户端先请求 `/api/version`，404 自动回退 `/api/version.json`，动态/静态服务器同一份 App 通吃）。

> 注：`export_static.py` 只导出 db/ 内置题库；json数据/ 采集词库的动态下发生在 serve.py（db.py 自动合并），静态托管方案如需含采集词库请直接上传 `python tools/fetch_datasets.py` 后重启 serve。

### 服务器架构选型（两种方案对比）

| 维度 | 动态 API（`serve.py` + ngrok/VPS） | 纯静态托管（`export_static.py` + Pages/COS/OSS） |
| --- | --- | --- |
| 运行成本 | 需一台常驻机器或隧道进程 | CDN 托管，0 成本 0 运维 |
| 更新步骤 | 改 `db/*.json` 即生效（mtime 热重载，免重启免上传） | 改 JSON → 导出 → 重新上传 2 个文件 |
| 稳定性 | 取决于你的机器/隧道（ngrok 免费版偶尔掉线、换域名） | CDN 多副本，几乎不会挂 |
| 版本控制 | 服务端实时计算内容指纹 | 导出时固化指纹，文件即版本 |
| CORS | `serve.py` 已设 `Access-Control-Allow-Origin: *` | 需在平台上显式开启 CORS |
| 适合场景 | 自己机器常开、高频改题 | 题库相对稳定、想要长期免运维 |

**推荐**：自用 → 方式 C（ngrok 最省事）；分享给别人长期用 → 方式 D（静态托管最稳）。两者 App 端体验完全一致，只是填的 URL 不同。

---

## 二、功能全景

| 模块 | 说明 |
| --- | --- |
| 五大赛道 | 求职面试 / 考研数学 / 考研英语 / CET-6 / CET-4，进度独立统计，首页一键切换 |
| 考研英语 | 四大模块：核心词汇（熟词僻义/一词一卡）· 常用短语（完形搭配/逻辑词）· 作文模板（大小作文/图表书信）· 阅读长难句（题型方法/拆解技巧） |
| CET-6 / CET-4 | 四级/六级各四模块：高频词卡 · 听力技巧（讲座/新闻/篇章/预读节奏）· 阅读技巧（分值导向/选词/匹配）· 写作翻译（模板/高分替换/特色词库），按真题题型分值给出考场策略 |
| 知识分类 | 当前赛道分类宫格 + 进度环，按状态/频率/难度筛选排序 |
| 题卡阅读 | 答案默认折叠（先想再看）；Markdown + **数学公式**（分数/根号/上下标/∑∫lim/cases）+ 代码块 + 目录 + 关联跳转 |
| 间隔重复 | 简化 Anki：8 分钟 / 1 / 2 / 4 / 7 / 15 / 30 天七级记忆盒，评级驱动排期 |
| 今日任务 | 每日 N 题（限当前赛道，待复习优先 + 高频补充），完成打卡、连续天数 |
| 自测模式 | 隐藏答案抽题自评，结束出分 + 针对性建议 |
| 背诵模式 | 翻卡片练口述，「不会」的卡自动回到本轮末尾 |
| 错题本 | 评「不会」自动进入，连对 2 次自动移出 |
| 全局搜索 | 题干+答案+标签全文检索，多关键词 AND，命中高亮，毫秒级 |
| 笔记 | 每题个人笔记（Markdown），一键导出含标准答案的 Markdown 面经 |
| 统计 | 18 周热力图、掌握度雷达图、分类明细、频率维度掌握率 |
| 数据管理 | 进度备份/恢复、JSON 题包导入、全量 Markdown 手册导出 |
| 深色模式 | 跟随系统 / 手动；字号 90%~135% 可调 |
| 离线 | Service Worker 全量缓存，断网/服务器宕机照常使用 |
| 在线同步 | 服务器改 db/*.json 即热更新：版本指纹比对，自动提示，进度不受影响 |

---

## 三、目录结构

```text
├── 启动服务器.bat        ★ 一键启动（双击）：serve.py + ngrok 隧道，首次可配 token
├── index.html            入口（含启动自检与友好失败页）
├── manifest.webmanifest  PWA 清单（图标/快捷方式/安装）
├── sw.js                 Service Worker（Network First + 离线兜底）
├── css/style.css         全部样式（设计令牌 + 深色模式 + 公式样式）
├── js/
│   ├── md.js             零依赖安全 Markdown + LaTeX 公式渲染器
│   ├── ui.js             DOM/图标/Toast/弹层/剪贴板/下载 原语
│   ├── store.js          数据层：赛道/题库索引、SRS 引擎、搜索、备份
│   ├── sync.js           在线题库同步（版本比对 + 全量拉取 + 降级）
│   ├── app.js            路由、外壳、共享组件、PWA 安装
│   ├── pages-core.js     首页(赛道)/分类/阅读/标签
│   ├── pages-practice.js 今日/刷题/背诵/错题/收藏/笔记
│   └── pages-extra.js    搜索/统计/我的/备份/出题器/指南
├── db/                   ★★ 数据库（唯一真源，直接改这里）：每文件一个分类的 JSON
├── data/                 ★ 构建产物（勿手改）：index.js + q_*.js（离线兜底题库）
├── icons/                PWA 图标（svg + 各尺寸 png）
├── android-shell/        ★ APK 壳工程（Manifest/MainActivity/图标/签名密钥）
├── dist/                 ★ 发布产物目录（均由 tools/release.py 生成，勿手改）
│   ├── 考途.apk              Android 安装包（约 300KB）
│   └── 考途-单文件版.html     单文件离线版（约 646KB，可直发手机）
├── docs/                 项目文档（qa-日期/ 为 QA 测试证据截图）
└── tools/
    ├── release.py        ★ 一键发布：build → export_static → make_single_file → build_apk
    ├── build.py          ★ 构建器：db/*.json → data/*.js + 校验 + 自动同步 index.html
    ├── db.py             数据层：JSON 读取/版本指纹/serve.py 的 API 后端
    ├── make_single_file.py 单文件打包器：全 App 内联为一个 HTML（可 --api 注入同步地址）
    ├── build_apk.py      ★ APK 构建器：aapt2+javac+dx+签名，无需 Gradle
    ├── export_static.py  ★ 静态导出器：db/*.json → deploy/api/version.json + bank.json
    ├── make_icons.py     PWA 图标生成（Pillow）
    ├── make_android_icons.py Android 各密度启动图标生成
    ├── run_all.py        ★ 一键编排器：起 serve.py + 建 ngrok 隧道 + 汇总地址
    ├── setup_token.ps1   ngrok authtoken 采集（掩码输入，写入 .ngrok_token）
    └── serve.py          服务器：静态资源 + /api/version + /api/bank（直读 db/*.json）
├── deploy/api/           ★ 静态题库产物（上传 GitHub Pages/COS/OSS 即用）
```

---

## 四、扩充题库（三种方式）

### 1. 一键下载在线题库（批量扩充，推荐）★
服务器会把 `json数据/qpack-*.json`（全网采集的完整词库）与 `db/*.json` 合并下发，
手机在「我的 → 一键下载在线题库」点一下即全量到手（约 4200+ 题）。
采集更多数据：`python tools/fetch_datasets.py`，产物落在 `json数据/`，重启服务器即生效。

### 2. App 内自建（零散补充）
`我的 → 自建题目`，支持 Markdown 答案与实时预览，随时可删。

### 3. 直接改 db/*.json（长期维护，推荐）★
`db/` 下每个 `.json` 文件就是一个分类（数据库真源）。结构：

```json
{
  "track": "math",            // job 求职面试 / math 考研数学 / english 考研英语
  "id": "math-calc",          // 分类 id（全局唯一）
  "name": "高等数学", "badge": "高数", "color": "#B0413E", "desc": "极限 / 导数 / 积分",
  "questions": [
    { "id": "mc-001", "q": "……？", "a": "Markdown 答案，支持 $行内公式$ 与 $$块级公式$$",
      "d": 3, "f": "high", "t": ["极限"], "r": ["mc-002"] }
  ]
}
```

改完后的生效范围：

| 目标 | 命令 |
| --- | --- |
| 服务器热更新（App 打开即生效） | 无需命令（服务器按 mtime 自动重载） |
| 内置题库 / APK / 单文件版 | `python tools/release.py` 一键重建全部产物 |

构建器会校验：JSON 语法、ID 重复/格式、关联题存在性、答案过薄、**公式 $/$$ 配对**，错误在构建期拦住。新增一个分类只需新建一个 `db/xxx.json`（`build.py` 会自动同步 index.html 的引用，无需手改任何代码）。

---

## 五、答案写作规范（决定好不好用）

每道题的答案按此结构写，App 会自动生成目录与「30 秒速记」：

1. `## 一句话结论` —— 面试/考试先抛这句
2. `## 原理 / 对比 / 示例` —— 列表、表格、带语言标注的代码块；数学题用 `$...$` 行内公式与 `$$...$$` 块级公式（支持 frac/sqrt/sum/int/lim/上下标/希腊字母/cases/matrix）
3. `## 面试追问`（求职）或 `## 易错点`（考研）—— 2~4 个追问及一句话应对

正文提到其它题用 `[[mc-002]]`，渲染成可点击跳题链接。

---

## 六、记忆算法说明

| 你的评级 | 记忆盒变化 | 下次复习 |
| --- | --- | --- |
| 不会 | 掉回 0 级 + 进错题本 | 8 分钟后 |
| 模糊 | 维持当前级别 | 当前间隔 × 1.2 |
| 记住 | +1 级 | 1/2/4/7/15/30 天递进 |
| 秒答 | +2 级 | 间隔 × 1.6 |

升到 7 级判定「已掌握」，自动退出每日任务与背诵队列。今日任务、到期复习、背诵池均**限定在当前赛道内**，切赛道互不干扰。

---

## 七、常见问题

**Q：双击打开后进度会保存吗？**
会，存浏览器 localStorage。但部分浏览器对 `file://` 限制较多（无法注册 SW、无法安装 PWA），建议用 `python tools/serve.py`。

**Q：换手机/换浏览器怎么办？**
学习进度存在设备本地；换机前可在浏览器开发者工具的 Application 面板导出 localStorage（键前缀 `bagutong.*`）。日常使用不受影响：题库随 App 内置/一键下载，进度重新积累即可。

**Q：不想连局域网、不想开服务器，手机上能直接用吗？**
能。运行 `python tools/make_single_file.py` 生成单文件版，发到手机用浏览器打开即可，完全离线。单文件版的唯一代价是没有 Service Worker（浏览器地址栏模式运行，不能安装到桌面图标），其余功能完全一致。

**Q：题库更新后 App 会自动更新吗？**
会。SW 采用 Network First：联网时下次打开即拿到新版，离线时用缓存兜底。若部署了服务器，改 `db/*.json` 后 App 打开也会自动拉取最新题库。

**Q：能打印成纸质版吗？**
阅读页 Ctrl+P 即可，样式已做打印优化（隐藏导航/评分条）。或导出全量 Markdown 手册自行排版。

**Q：数据安全吗？**
全部数据只在你自己的设备/浏览器里，应用不发起任何网络请求（除你主动访问的托管地址与题库同步）。

---

## 八、技术要点（简历可讲）

- **零依赖架构**：自研 Markdown + LaTeX 公式渲染器（XSS 安全：先转义后生成）、SRS 排期引擎、哈希路由 SPA
- **JSON 即数据库**：`db/*.json` 为唯一真源，服务器按 mtime 指纹热重载，客户端版本比对增量同步
- **PWA 离线**：Service Worker Network First + 预缓存，断网可用；manifest 支持桌面安装与快捷方式
- **无 Gradle 手打 APK**：aapt2 + javac + dx + apksigner 全链路脚本化，规避 Windows 中文路径/aapt2 反斜杠/JKS/d8-NPE 四坑
- **性能**：全量 274 题搜索 < 5ms（倒排式打分 + TreeWalker 高亮）；启动屏防白屏 + 依赖自检失败页
- **健壮性**：localStorage 不可用自动降级内存模式并提示；后台标签页 rAF 节流问题规避；存储配额溢出兜底；el() 参数类型防御（WebView 严格模式不崩）

---

版本 v1.0.0 · 离线可用 · 数据私有
