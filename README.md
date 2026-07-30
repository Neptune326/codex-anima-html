# Atlas Gallery

Atlas Gallery 是一个基于原生 HTML、CSS、JavaScript 和 Node.js 的多站点图片与视频图库。前端采用 Material 3 风格，Node 服务负责托管静态资源、转发站点 API 请求和下载媒体文件，因此浏览器不需要直接处理跨域请求。

项目不依赖 Vue、React、构建工具或第三方 npm 包，安装 Node.js 后即可运行。

## 功能概览

- 集成 16 个图片或视频站点，包括 yande.re、Konachan、Konachan.net、Lolibooru、Gelbooru、Xbooru、Danbooru、AIBooru、Sankaku Channel、Safebooru、Rule34、e621、e926、Sakugabooru、Derpibooru 和 Wallhaven。
- 支持图片与视频分类、标签搜索、内容分级、日期周期和尺寸筛选。
- 支持等高网格与瀑布流、图片懒加载、滚动加载和响应式布局。
- 支持图片缩放、视频自动播放、静音、循环和播放进度保存。
- 支持收藏、收藏标签与备注、浏览历史、搜索集和智能收藏夹。
- 支持单项下载、选择后批量下载、下载当前收藏夹及下载全部收藏。
- 支持明亮/深色主题、四种主题色、紧凑网格、敏感内容模糊和减少动画。
- 收藏和历史优先保存在 IndexedDB，并在不可用时回退到 localStorage。
- 支持将收藏、历史、搜索集和智能收藏夹导出为 JSON，并在其他浏览器中导入。

## 环境要求

- Node.js `16.17.0` 或更高版本。
- 支持 ES Modules、IndexedDB 和原生 `dialog` 的现代浏览器，推荐最新版 Chrome 或 Edge。
- 能访问目标图库的网络环境；可使用 Clash Verge、其他 HTTP/HTTPS 代理或服务器直连。

## 快速开始

在项目目录执行：

```powershell
git clone https://github.com/Neptune326/codex-anima-html.git
Set-Location codex-anima-html
npm start
```

浏览器访问：

```text
http://127.0.0.1:4173
```

项目没有第三方 npm 依赖，因此首次运行不要求执行 `npm install`。不要直接双击 `public/index.html`，站点请求和下载功能依赖 Node 服务提供的 `/api/proxy` 与 `/api/download` 接口。

运行检查和测试：

```powershell
npm run check
npm test
```

## 使用手册

### 浏览与搜索

1. 先选择“图片”或“视频”，页面只显示支持当前媒体类型的站点。
2. 在“站点来源”区域直接点击站点按钮；站点来源不是下拉菜单。切换媒体类型时，当前站点不兼容会自动选择首个可用站点。
3. 在搜索框输入标签并提交。多个标签使用空格分隔，多词标签使用下划线，例如 `blue_sky landscape`；排除标签使用 `-` 前缀，例如 `landscape -night`。
4. 使用内容分级、日期周期和尺寸控件缩小结果范围。日期筛选只在站点 API 支持时启用。
5. 页面滚动到底部时会自动加载下一页；工具栏可切换等高网格或瀑布流。

搜索框会根据本地收藏和历史提供标签建议。最近搜索只保存在当前浏览器。

Danbooru 使用公开接口浏览，不要求登录、Cookie、用户名或 API Key。

### 预览图片和视频

- 点击媒体卡片打开全屏预览。
- 图片可通过顶部按钮、鼠标滚轮或 `+`、`-`、`0` 调整缩放。
- 使用 `←` 和 `→` 切换上一项和下一项。
- 按 `F` 收藏或取消收藏当前媒体，按 `D` 下载当前媒体。
- 视频默认静音自动播放；关闭预览时会保存播放位置，再次打开时继续播放。
- 全局设置中可隐藏右侧详情栏，并调整自动播放、静音和循环行为。

### 收藏与整理

- 点击卡片上的收藏按钮，或在预览详情中收藏媒体。
- 收藏后可在预览详情中填写收藏标签和备注。
- 顶部“收藏”页支持按尺寸筛选、批量选择和批量下载。
- “搜索集”保存当前站点、标签和筛选条件，适合重复执行同一搜索。
- “智能收藏夹”按照标签和媒体类型筛选当前浏览器中的本地收藏。
- 已打开过的媒体会进入浏览历史，最多保留最近 `200` 项。

收藏、历史和设置按浏览器站点隔离。`http://127.0.0.1:4173`、`http://localhost:4173` 和部署后的域名属于不同数据空间，不会自动共享数据。

### 下载

- 卡片下载按钮：下载单个媒体。
- 批量选择：勾选卡片后点击“下载所选”。
- 收藏页：下载当前智能收藏夹或全部收藏媒体。
- 下载队列同时处理 `2` 项，可取消进行中的任务或重试失败项。

浏览器首次批量下载时可能询问是否允许此站点下载多个文件，需要选择允许。服务端单个媒体文件上限为 `256 MB`；媒体地址必须属于已集成站点的 HTTPS 域名。

### 数据备份与迁移

打开“全局设置 → 数据”：

- “导出收藏”生成格式化 JSON，内容包括收藏、历史、搜索集和智能收藏夹。
- “导入收藏”会合并收藏与历史，并恢复导出文件中的搜索集和智能收藏夹。
- 全局主题、代理模板和视频播放进度不包含在导出文件中。
- “清除全部本地数据”会删除当前站点在浏览器中的设置、收藏和历史，操作不可撤销。

迁移到新电脑或新域名前，应先在旧环境导出 JSON，再在新环境导入。

### 全局设置

- 外观：明亮/深色主题，以及蓝、绿、珊瑚红、紫罗兰四种主题色。
- 预览：隐藏详情、视频自动播放、默认静音和循环播放。
- 浏览：敏感缩略图模糊、紧凑网格和减少动画。
- 网络：界面保留包含 `{url}` 的自定义 CORS 代理模板。内置 Node 服务的内容安全策略只允许同源请求，默认部署时应留空并使用 `/api/proxy`。

## 网络与代理

浏览器只请求当前 Atlas Gallery 服务，由 Node 服务访问各图库站点，从而规避浏览器跨域限制。

代理选择优先级：

1. `UPSTREAM_PROXY`
2. `HTTPS_PROXY`
3. `HTTP_PROXY`
4. `ALL_PROXY`
5. Windows 本地自动探测 `http://127.0.0.1:7897` 和 `http://127.0.0.1:7890`
6. 直接连接

只支持 `http://` 或 `https://` 代理地址，不支持 SOCKS 地址。Clash Verge 应开启系统代理或 Mixed Port/HTTP Port，并确保端口与配置一致。

Windows PowerShell 示例：

```powershell
$env:UPSTREAM_PROXY = 'http://127.0.0.1:7897'
npm start
```

不使用代理时，可在当前终端移除相关环境变量：

```powershell
Remove-Item Env:UPSTREAM_PROXY -ErrorAction SilentlyContinue
Remove-Item Env:HTTPS_PROXY -ErrorAction SilentlyContinue
Remove-Item Env:HTTP_PROXY -ErrorAction SilentlyContinue
Remove-Item Env:ALL_PROXY -ErrorAction SilentlyContinue
npm start
```

健康检查：

```powershell
Invoke-RestMethod http://127.0.0.1:4173/api/health
```

响应中的 `proxyMode` 表示代理选择策略：`configured` 表示读取了环境变量，`auto` 表示 Windows 将尝试本地 `7897/7890`，`direct` 表示直接连接。该字段不执行目标站点连通性测试。

## 部署手册

全新 Linux 服务器的逐步安装、Nginx 静态托管、systemd、HTTPS、更新、备份和故障排查说明见 [使用与 Linux 部署手册](docs/USER_AND_LINUX_DEPLOYMENT.md)。可直接使用的配置模板位于 `deploy/`。

完整功能需要保留 Node 服务提供 `/api/proxy` 与 `/api/download`。推荐由 Nginx 直接提供 `public/` 静态资源，并把 `/api/` 反向代理到仅监听 `127.0.0.1:4173` 的 Node 服务。

### 直接运行

`HOST` 控制监听地址，`PORT` 控制端口。默认值分别为 `127.0.0.1` 和 `4173`。

Windows 局域网部署：

```powershell
$env:HOST = '0.0.0.0'
$env:PORT = '4173'
$env:UPSTREAM_PROXY = 'http://127.0.0.1:7897'
npm start
```

Linux 前台运行：

```bash
HOST=0.0.0.0 PORT=4173 UPSTREAM_PROXY=http://127.0.0.1:7897 npm start
```

服务器能够直接访问所有目标站点时，省略 `UPSTREAM_PROXY`。监听 `0.0.0.0` 会向网络开放服务，应配合防火墙、可信局域网或反向代理使用。

### 使用 systemd 常驻运行

假设项目位于 `/opt/codex-anima-html`，Node 可执行文件位于 `/usr/bin/node`，创建 `/etc/systemd/system/atlas-gallery.service`：

```ini
[Unit]
Description=Atlas Gallery
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/opt/codex-anima-html
Environment=HOST=127.0.0.1
Environment=PORT=4173
# 服务器需要代理时取消下一行注释并修改地址
# Environment=UPSTREAM_PROXY=http://127.0.0.1:7897
ExecStart=/usr/bin/node /opt/codex-anima-html/src/server.js
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
```

启用并检查服务：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now atlas-gallery
sudo systemctl status atlas-gallery
curl http://127.0.0.1:4173/api/health
```

`www-data` 必须对项目目录具有读取权限。项目运行时不写入服务器目录，收藏和设置保存在访问者浏览器中。

### 使用 Nginx 反向代理

推荐通过 HTTPS 域名访问，以保证浏览器存储和媒体功能稳定。以下示例假设 TLS 由现有 Nginx 配置或证书工具管理：

```nginx
server {
    listen 443 ssl http2;
    server_name gallery.example.com;

    ssl_certificate /etc/letsencrypt/live/gallery.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/gallery.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:4173;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_buffering off;
    }
}
```

检查并重载 Nginx：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Node 服务会在内存中缓冲上游响应：普通站点 API 单次上限为 `16 MB`，媒体下载单次上限为 `256 MB`。浏览器下载队列并发为 `2`；每个下载在拼接响应时最多同时持有约 `512 MB` 的分块和连续缓冲区，因此两个满额下载可能临时占用约 `1,024 MB` 的服务器内存，未计入 Node.js 和操作系统本身。当前实现适合个人或受控用户范围部署。

### 更新部署

```bash
cd /opt/codex-anima-html
git pull --ff-only
npm run check
npm test
sudo systemctl restart atlas-gallery
curl http://127.0.0.1:4173/api/health
```

## 故障排查

- 页面无法打开：确认 `npm start` 正在运行，并访问终端输出的地址。
- `Failed to fetch` 或站点请求失败：检查 Clash Verge 端口，设置 `UPSTREAM_PROXY` 后重启 Node 服务。
- 健康检查显示 `direct`：当前运行环境没有配置代理，也没有启用 Windows 本地端口自动探测。
- 健康检查显示 `auto` 但请求失败：确认 Clash Verge 的 HTTP/Mixed 端口是 `7897` 或 `7890`；其他端口必须通过 `UPSTREAM_PROXY` 指定。
- 某个站点无结果：尝试减少标签数量、切换内容分级，或确认目标站点当前可访问。
- 批量下载只保存一个文件：在浏览器地址栏的站点权限中允许“自动下载”或“多个文件下载”。
- 收藏在另一个地址中为空：从旧地址导出 JSON，再到新地址导入；浏览器会按协议、域名和端口隔离数据。
- 服务器返回文件过大：API 响应不得超过 `16 MB`，单个下载文件不得超过 `256 MB`。

## 项目结构

```text
anima-html/
├─ public/
│  ├─ css/styles.css       # Material 3 样式与响应式布局
│  ├─ js/app.js            # 页面交互、预览、收藏和下载队列
│  ├─ js/library.js        # 收藏筛选、标签和文件名工具
│  ├─ js/sites.js          # 站点配置、请求构建与数据标准化
│  ├─ js/storage.js        # localStorage、IndexedDB 和数据导入导出
│  └─ index.html           # 页面结构与内置图标
├─ src/server.js           # 静态服务、同源代理和下载接口
├─ deploy/                 # systemd、Nginx 和环境变量模板
├─ docs/                   # 使用与 Linux 部署手册
├─ test/                   # Node.js 原生测试
└─ package.json            # 启动、检查和测试命令
```

## 安全说明

- 服务端代理仅允许访问代码白名单中的 HTTPS 站点，并拒绝 URL 中携带用户名或密码。
- 不要把代理账号、密码或其他凭据写入仓库；需要认证时通过服务器环境变量设置代理地址。
- 公开部署会让访问者使用服务器网络请求目标站点并下载媒体，应通过防火墙、身份认证或私有网络限制访问范围。
- 部分集成站点可能包含敏感或成人内容，请遵守所在地法律、站点条款和使用场景要求。
