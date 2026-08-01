# Atlas Gallery 使用与 Linux 部署手册

本文档适用于 Atlas Gallery `2.8.0`。示例服务器使用 Ubuntu `22.04/24.04` 或 Debian `12`，部署目录为 `/opt/codex-anima-html`，Node 服务监听 `127.0.0.1:4173`，Nginx 对外提供网页和 HTTPS。

## 1. 部署结构

Atlas Gallery 由两部分组成：

- `public/` 是 HTML、CSS、JavaScript 静态前端，由 Nginx 直接提供。
- `src/server.js` 提供 `/api/proxy`、`/api/media`、`/api/download`、`/api/health` 和站点健康检查，由 Node.js 运行。

仅复制 `public/` 到 Nginx 会显示页面，但图库请求和下载会失败。完整部署必须同时运行 Node 服务，并由 Nginx 将 `/api/` 转发到 `127.0.0.1:4173`。

访问者的收藏、历史、设置和播放进度保存在浏览器 IndexedDB/localStorage 中，服务器不保存这些个人数据。

## 2. 部署前准备

准备以下信息：

- 一台具有 `sudo` 权限的 Linux 服务器。
- GitHub 仓库地址：`https://github.com/Neptune326/codex-anima-html.git`。
- 可选域名，例如 `gallery.example.com`，并将域名的 A/AAAA 记录指向服务器公网 IP。
- 服务器可直接访问集成站点，或有服务器能够访问的 HTTP/HTTPS 代理。

本地电脑上的 Clash Verge 不能自动代理远程服务器。Linux 服务器需要直连目标站点、在服务器本机运行代理，或连接一个服务器网络可达的代理地址。

### 2.1 根据服务器网络选择连接方式

- 国外服务器：通常可以直接访问目标站点，先按直连模式部署，不设置 `UPSTREAM_PROXY`。
- 国内服务器：部分目标站点可能无法连接或连接不稳定，先执行下面的测试；存在失败站点时再配置代理。

服务器地区只能作为初步判断，最终以服务器本机的测试结果为准。登录服务器后执行：

```bash
for url in \
  'https://yande.re/post.json?limit=1' \
  'https://danbooru.donmai.us/posts.json?limit=1' \
  'https://capi-v2.sankakucomplex.com/posts?limit=1' \
  'https://api.rule34.xxx/index.php?page=dapi&s=post&q=index&json=1&limit=1'
do
  curl --connect-timeout 10 --max-time 20 -o /dev/null -sS \
    -w "%{http_code} %{time_total}s ${url}\n" "$url" || echo "连接失败 ${url}"
done
```

返回 HTTP `200-499` 表示服务器已经连接到目标站点；返回 `000`、DNS 错误、连接超时或拒绝连接表示该站点不可达。国外服务器测试全部可达时不需要代理；国内或国外服务器只要存在不可达站点，就应使用代理模式。

## 3. 安装系统软件

登录服务器：

```bash
ssh your-user@your-server-ip
```

更新软件索引并安装 Git、Nginx 和基础工具：

```bash
sudo apt update
sudo apt install -y git nginx curl ca-certificates gnupg
```

安装 Node.js `22.x`：

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x -o /tmp/nodesource_setup.sh
sudo -E bash /tmp/nodesource_setup.sh
sudo apt install -y nodejs
rm /tmp/nodesource_setup.sh
```

确认版本：

```bash
node --version
npm --version
nginx -v
git --version
```

`node --version` 必须为 `v16.17.0` 或更高版本，推荐 `v22.x`。

## 4. 创建运行用户并拉取代码

创建不能交互登录的系统用户：

```bash
sudo useradd --system --home /opt/codex-anima-html --shell /usr/sbin/nologin atlas-gallery
sudo install -d -o atlas-gallery -g atlas-gallery -m 0755 /opt/codex-anima-html
```

拉取代码：

```bash
sudo -u atlas-gallery git clone https://github.com/Neptune326/codex-anima-html.git /opt/codex-anima-html
cd /opt/codex-anima-html
```

项目没有第三方 npm 依赖，不要求执行 `npm install`。运行语法检查和自动化测试：

```bash
npm run check
npm test
```

两个命令都必须以退出码 `0` 结束。

## 5. 配置 Node 服务

创建配置目录并复制环境变量模板：

```bash
sudo install -d -m 0750 -o root -g atlas-gallery /etc/atlas-gallery
sudo install -m 0640 -o root -g atlas-gallery \
  /opt/codex-anima-html/deploy/atlas-gallery.env.example \
  /etc/atlas-gallery/atlas-gallery.env
sudo nano /etc/atlas-gallery/atlas-gallery.env
```

### 5.1 国外服务器或直连测试通过

环境文件只保留：

```dotenv
HOST=127.0.0.1
PORT=4173
```

不要设置 `UPSTREAM_PROXY`。服务会由 Linux 服务器直接请求图库站点，健康检查中的 `proxyMode` 应为 `direct`。

### 5.2 国内服务器或直连测试失败

先确保 Linux 服务器本机已经运行 HTTP/Mixed 代理，或拥有服务器网络可达的 HTTP/HTTPS 代理地址，再增加：

```dotenv
UPSTREAM_PROXY=http://127.0.0.1:7897
```

`127.0.0.1:7897` 仅适用于代理程序运行在这台 Linux 服务器且实际监听该端口的情况。远程代理应填写服务器能够访问的地址，例如 `http://10.0.0.8:7890`。`UPSTREAM_PROXY` 只支持 `http://` 或 `https://` 地址，不支持 SOCKS 地址。

配置前先验证代理链路：

```bash
curl --proxy http://127.0.0.1:7897 \
  --connect-timeout 10 --max-time 20 \
  'https://yande.re/post.json?limit=1'
```

代理需要用户名和密码时，把完整地址写在服务器环境文件中，并保持文件权限为 `0640`；不要提交到 Git，也不要将无认证代理端口开放到公网。

安装 systemd 服务：

```bash
sudo install -m 0644 \
  /opt/codex-anima-html/deploy/atlas-gallery.service \
  /etc/systemd/system/atlas-gallery.service
sudo systemctl daemon-reload
sudo systemctl enable --now atlas-gallery
```

检查服务：

```bash
sudo systemctl status atlas-gallery --no-pager
curl --fail http://127.0.0.1:4173/api/health
```

健康检查应返回类似内容：

```json
{"ok":true,"version":"2.8.0","proxyMode":"direct"}
```

`proxyMode` 的值：

- `direct`：服务器直接连接目标站点。
- `configured`：服务读取了代理环境变量。
- `auto`：仅 Windows 会自动探测本机 `7897/7890` 端口，Linux 不使用此模式。

代理模式配置完成后，`proxyMode` 应为 `configured`。修改环境文件后必须执行：

```bash
sudo systemctl restart atlas-gallery
curl --fail http://127.0.0.1:4173/api/health
```

再测试项目实际使用的站点链路：

```bash
curl --fail 'http://127.0.0.1:4173/api/site-health?source=yandere'
curl --fail 'http://127.0.0.1:4173/api/site-health?source=danbooru'
curl --fail 'http://127.0.0.1:4173/api/site-health?source=sankaku'
```

查看服务日志：

```bash
sudo journalctl -u atlas-gallery -n 100 --no-pager
sudo journalctl -u atlas-gallery -f
```

## 6. 配置 Nginx

复制项目自带配置：

```bash
sudo install -m 0644 \
  /opt/codex-anima-html/deploy/nginx-atlas-gallery.conf \
  /etc/nginx/sites-available/atlas-gallery
sudo nano /etc/nginx/sites-available/atlas-gallery
```

有域名时，把下面一行改成真实域名：

```nginx
server_name gallery.example.com;
```

仅使用服务器 IP 时改为：

```nginx
server_name _;
```

确认配置使用 `location /api/` 转发整个 API 路径，不要只配置 `/api/proxy` 或 `/api/download`。`2.8.0` 的视频封面与播放依赖 `/api/media`，并通过浏览器的 Range 请求分段读取媒体；项目模板中的 `proxy_buffering off`、`proxy_request_buffering off` 和 `300s` 读写超时应保留。

启用站点并移除 Debian/Ubuntu 的默认页面：

```bash
sudo ln -sfn /etc/nginx/sites-available/atlas-gallery /etc/nginx/sites-enabled/atlas-gallery
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl enable --now nginx
sudo systemctl reload nginx
```

在服务器本机验证 Nginx：

```bash
curl --fail http://127.0.0.1/
curl --fail http://127.0.0.1/api/health
```

第一个命令应返回 Atlas Gallery HTML，第二个命令应返回健康检查 JSON。

## 7. 配置防火墙

服务器使用 UFW 时，先放行 SSH，再启用防火墙：

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

云服务器还需要在云平台安全组中放行 TCP `22`、`80`、`443`。不要开放 `4173`，该端口只监听 `127.0.0.1`，供 Nginx 内部访问。

此时可访问：

```text
http://your-server-ip/
```

或：

```text
http://gallery.example.com/
```

## 8. 配置 HTTPS

域名解析已经生效并且 TCP `80/443` 已放行后，安装 Certbot：

```bash
sudo apt install -y certbot python3-certbot-nginx
```

申请证书并让 Certbot 更新 Nginx：

```bash
sudo certbot --nginx -d gallery.example.com
```

按提示输入邮箱、同意条款并选择将 HTTP 重定向到 HTTPS。验证：

```bash
sudo nginx -t
sudo systemctl reload nginx
curl --fail https://gallery.example.com/api/health
sudo certbot renew --dry-run
```

正式访问地址：

```text
https://gallery.example.com/
```

## 9. 首次使用

1. 打开网页，先选择“图片”或“视频”。
2. 页面只显示支持当前媒体类型的站点；点击站点按钮切换来源。
3. 在搜索框输入标签，多个标签使用空格，多词标签使用下划线，排除标签使用 `-` 前缀。
4. 使用内容分级、日期周期和尺寸过滤结果；不支持日期的站点会禁用日期控件。
5. 点击媒体卡片打开预览。视频默认静音自动播放，可在全局设置中修改。
6. 使用卡片按钮收藏或下载；收藏页支持批量选择和下载。
7. 在全局设置中导出 JSON，可备份收藏、历史、搜索集和智能收藏夹。
8. 在“过滤与下载”中可设置标签黑名单、`1-4` 个下载并发和文件名模板。

浏览器会按协议、域名和端口隔离本地数据。由 HTTP 切换到 HTTPS 后，原 HTTP 地址中的收藏不会自动出现，需要先导出再导入。

## 10. 日常运维

查看状态：

```bash
sudo systemctl status atlas-gallery nginx --no-pager
```

重启服务：

```bash
sudo systemctl restart atlas-gallery
sudo systemctl reload nginx
```

查看最近日志：

```bash
sudo journalctl -u atlas-gallery --since "30 minutes ago" --no-pager
sudo tail -n 100 /var/log/nginx/error.log
sudo tail -n 100 /var/log/nginx/access.log
```

## 11. 更新项目

更新前记录当前版本：

```bash
cd /opt/codex-anima-html
sudo -u atlas-gallery git status --short
sudo -u atlas-gallery git rev-parse --short HEAD
```

工作区必须没有服务器本地代码改动。拉取、测试并重启：

```bash
cd /opt/codex-anima-html
sudo -u atlas-gallery git pull --ff-only
npm run check
npm test
sudo systemctl restart atlas-gallery
sudo nginx -t
sudo systemctl reload nginx
curl --fail http://127.0.0.1:4173/api/health
curl --fail http://127.0.0.1/api/health
```

若本次更新修改了 `deploy/atlas-gallery.service` 或 Nginx 模板，需要重新复制对应文件，再执行 `systemctl daemon-reload` 或 `nginx -t`。

### 从 2.7.x 升级到 2.8.0

`2.8.0` 新增 `/api/media` 服务端路由。拉取代码后必须重启 Node 服务，否则前端会请求到旧进程并返回 `404`；现有 Nginx 已使用 `location /api/` 时，无需为该路由单独增加配置。

```bash
cd /opt/codex-anima-html
sudo -u atlas-gallery git pull --ff-only origin main
npm run check
npm test
sudo systemctl restart atlas-gallery
curl --fail http://127.0.0.1:4173/api/health
```

健康检查中的 `version` 应为 `2.8.0`，`proxyMode` 在未配置代理时为 `direct`，配置 `UPSTREAM_PROXY` 后为 `configured`：

```json
{"ok":true,"version":"2.8.0","proxyMode":"direct"}
```

使用任意一个浏览器开发者工具中已确认可播放的真实视频地址验证 Range 转发：

```bash
MEDIA_URL='https://example.com/path/video.mp4'
curl -sS -D - -o /dev/null \
  -H 'Range: bytes=0-65535' \
  --get \
  --data-urlencode "url=${MEDIA_URL}" \
  http://127.0.0.1:4173/api/media
```

正常响应应包含 `HTTP/1.1 206 Partial Content`、`Content-Range` 和正确的 `Content-Type: video/*`。示例地址必须替换为页面实际返回的媒体地址；`example.com` 仅表示命令格式。

## 12. 备份与迁移

服务器侧只需备份配置：

```bash
sudo tar -czf /root/atlas-gallery-server-config.tar.gz \
  /etc/atlas-gallery \
  /etc/systemd/system/atlas-gallery.service \
  /etc/nginx/sites-available/atlas-gallery
```

用户收藏保存在浏览器中，应在网页“全局设置 → 数据 → 导出收藏”生成 JSON。迁移服务器或更换域名后，在新地址使用“导入收藏”恢复。

## 13. 故障排查

页面返回 `502 Bad Gateway`：

```bash
sudo systemctl status atlas-gallery --no-pager
curl -v http://127.0.0.1:4173/api/health
sudo journalctl -u atlas-gallery -n 100 --no-pager
```

页面能打开但图库请求失败：

```bash
curl http://127.0.0.1:4173/api/health
curl -i 'http://127.0.0.1:4173/api/site-health?source=yandere'
sudo journalctl -u atlas-gallery -f
```

`/api/health` 只确认服务运行，`/api/site-health` 才会实际访问目标站点。直连模式失败时，按 5.2 节设置 `UPSTREAM_PROXY`；代理模式失败时，先使用 `curl --proxy` 检查代理地址和端口，再检查代理规则、DNS 与服务器防火墙。

页面和图片正常，但视频封面或播放返回 `401/403`：

```bash
sudo journalctl -u atlas-gallery -n 100 --no-pager
sudo nginx -T | grep -A 15 'location /api/'
```

确认浏览器请求的是本站 `/api/media?url=...`，Nginx 将整个 `/api/` 转发到 `127.0.0.1:4173`，并按上一节的命令检查媒体响应是否为 `206 Partial Content`。若 `/api/media` 日志显示上游连接失败，国外服务器先测试目标站点直连，国内服务器按 5.2 节配置服务器本机可达的 `UPSTREAM_PROXY`；不要把第三方视频地址直接写入 Nginx 代理规则。

Nginx 返回 `403 Forbidden`：

```bash
namei -l /opt/codex-anima-html/public/index.html
sudo chmod -R u=rwX,go=rX /opt/codex-anima-html
sudo nginx -t
sudo systemctl reload nginx
```

配置修改后服务没有生效：

```bash
sudo systemctl daemon-reload
sudo systemctl restart atlas-gallery
sudo systemctl reload nginx
```

批量下载失败或浏览器只保存一个文件：在浏览器站点权限中允许“多个文件下载”。单个媒体文件上限为 `256 MB`，普通 API 响应上限为 `16 MB`。

## 14. 卸载

停止并删除服务：

```bash
sudo systemctl disable --now atlas-gallery
sudo rm -f /etc/systemd/system/atlas-gallery.service
sudo systemctl daemon-reload
```

删除 Nginx 配置和项目：

```bash
sudo rm -f /etc/nginx/sites-enabled/atlas-gallery
sudo rm -f /etc/nginx/sites-available/atlas-gallery
sudo nginx -t
sudo systemctl reload nginx
sudo rm -rf /opt/codex-anima-html
sudo rm -rf /etc/atlas-gallery
sudo userdel atlas-gallery
```

删除服务器文件不会删除访问者浏览器中的收藏和设置，浏览器数据需要在网页全局设置中清理。
