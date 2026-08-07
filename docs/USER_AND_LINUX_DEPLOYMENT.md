# Atlas Gallery Linux 部署手册

本文档适用于 Atlas Gallery `2.11.1`，示例系统为 Ubuntu `22.04/24.04` 或 Debian `12`。部署完成后，唯一的公网业务入口为 TCP `59886`：Nginx 监听 `59886` 并提供静态文件，将 `/api/` 转发到仅监听 `127.0.0.1:4173` 的 Node 服务。不要向公网开放 `80`、`443` 或 `4173`。

## 一键部署

将 `deploy/atlas-gallery.sh` 复制到服务器任意非部署目录，或直接下载，然后以具备 `sudo` 权限的用户执行：

```bash
curl -fsSL https://raw.githubusercontent.com/Neptune326/codex-anima-html/main/deploy/atlas-gallery.sh -o atlas-gallery.sh
sudo bash atlas-gallery.sh
```

同一个脚本不带参数即可使用：未发现 `/opt/codex-anima-html/.git` 时执行首次部署，已存在时执行强制更新。每个步骤都会显示中文开始和完成状态，结束时输出执行模式、代码版本、访问地址以及成功或失败结果。

首次部署会安装 Git、Nginx、curl、Node.js，创建专用用户，完整克隆代码，安装 systemd/Nginx 配置，运行检查与测试，并验证 `4173` 和 `59886` 的本机健康状态。已有 `/etc/atlas-gallery/atlas-gallery.env` 时不会覆盖。

## 1. 部署结构

- Nginx：监听 `0.0.0.0:59886` 和 `[::]:59886`，提供 `public/` 静态文件。
- Node.js：监听 `127.0.0.1:4173`，提供 `/api/proxy`、`/api/media`、`/api/download` 和健康检查接口。
- systemd：管理 Node 进程，异常退出后自动重启。

访问地址为 `http://服务器地址:59886/`。浏览器收藏、历史和设置保存在访问者本机的 IndexedDB/localStorage 中，服务器不保存这些个人数据。

## 2. 安装系统软件

登录服务器：

```bash
ssh your-user@your-server-ip
```

安装 Git、Nginx、curl 和 Node.js `22.x`：

```bash
sudo apt update
sudo apt install -y git nginx curl ca-certificates gnupg
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

Node.js 最低版本为 `16.17.0`，推荐使用 `22.x`。

## 3. 创建用户并拉取代码

创建专用系统用户和部署目录：

```bash
sudo useradd --system --home /opt/codex-anima-html --shell /usr/sbin/nologin atlas-gallery
sudo install -d -o atlas-gallery -g atlas-gallery -m 0755 /opt/codex-anima-html
```

拉取代码并执行检查：

```bash
sudo -u atlas-gallery git clone https://github.com/Neptune326/codex-anima-html.git /opt/codex-anima-html
cd /opt/codex-anima-html
npm run check
npm test
```

项目没有第三方 npm 依赖，无需执行 `npm install`。两个检查命令均应以退出码 `0` 结束。

## 4. 配置 Node 服务

复制环境变量模板：

```bash
sudo install -d -m 0750 -o root -g atlas-gallery /etc/atlas-gallery
sudo install -m 0640 -o root -g atlas-gallery \
  /opt/codex-anima-html/deploy/atlas-gallery.env.example \
  /etc/atlas-gallery/atlas-gallery.env
sudo nano /etc/atlas-gallery/atlas-gallery.env
```

保持 Node 仅监听本机回环地址：

```dotenv
HOST=127.0.0.1
PORT=4173
```

服务器无法直连目标站点时，可在环境文件中增加服务器可访问的 HTTP/HTTPS 代理：

```dotenv
UPSTREAM_PROXY=http://127.0.0.1:7897
```

`UPSTREAM_PROXY` 不支持 SOCKS 地址。代理凭据只能保存在 `/etc/atlas-gallery/atlas-gallery.env` 中，不要提交到 Git 或写入日志。

安装并启动 systemd 服务：

```bash
sudo install -m 0644 \
  /opt/codex-anima-html/deploy/atlas-gallery.service \
  /etc/systemd/system/atlas-gallery.service
sudo systemctl daemon-reload
sudo systemctl enable --now atlas-gallery
sudo systemctl status atlas-gallery --no-pager
curl --fail http://127.0.0.1:4173/api/health
```

健康检查应返回包含 `"ok":true` 的 JSON。`proxyMode` 为 `direct` 表示直连，为 `configured` 表示已读取代理配置。

## 5. 配置 Nginx 监听 59886

复制项目模板并启用站点：

```bash
sudo install -m 0644 \
  /opt/codex-anima-html/deploy/nginx-atlas-gallery.conf \
  /etc/nginx/sites-available/atlas-gallery
sudo ln -sfn /etc/nginx/sites-available/atlas-gallery /etc/nginx/sites-enabled/atlas-gallery
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl enable --now nginx
sudo systemctl reload nginx
```

模板必须包含以下监听配置：

```nginx
listen 59886;
listen [::]:59886;
```

不要增加 `listen 80`、`listen 443`，也不要把 Node 的 `4173` 改为公网监听地址。验证本机入口：

```bash
curl --fail http://127.0.0.1:59886/
curl --fail http://127.0.0.1:59886/api/health
```

## 6. 配置防火墙和安全组

UFW 仅开放业务端口 `59886`。SSH 管理规则应限制为管理员公网 IP；将示例中的 `203.0.113.10` 替换为实际地址后再启用防火墙：

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow from 203.0.113.10/32 to any port 22 proto tcp
sudo ufw allow 59886/tcp
sudo ufw enable
sudo ufw status numbered
```

使用非 `22` 的 SSH 端口时，将命令中的 `22` 替换为实际端口。云服务器安全组采用相同规则：

- TCP `59886`：允许需要访问应用的来源地址。
- SSH 管理端口：仅允许管理员公网 IP。
- TCP `80`、`443`、`4173`：不添加入站规则；已有规则应删除。

公网访问地址：

```text
http://your-server-ip:59886/
```

## 7. 验证端口和服务

检查监听地址：

```bash
sudo ss -lntp | grep -E ':(59886|4173)\b'
```

预期结果：Nginx 监听 `0.0.0.0:59886` 和 `[::]:59886`；Node 只监听 `127.0.0.1:4173`。随后在外部电脑执行：

```bash
curl --fail http://your-server-ip:59886/api/health
```

外部网络不应能连接服务器的 `80`、`443` 或 `4173`。

## 8. 更新部署

```bash
sudo bash atlas-gallery.sh
```

脚本先将服务器配置备份到 `/var/backups/atlas-gallery/`，再完整获取所有远端引用与标签，强制将部署目录重置到 `origin/main` 并清理未跟踪文件，随后重新安装服务模板、运行检查与测试、重启服务并执行健康检查。部署目录中的本地代码修改会被覆盖；`/etc/atlas-gallery/atlas-gallery.env` 位于仓库外，不会被覆盖。

更新完成时，脚本会同时校验 API 版本与 Nginx 返回的页面资源版本。生产配置要求浏览器每次重新验证 HTML、CSS、JavaScript，避免继续显示旧版移动端界面。

服务器旧配置已将 `59886` 声明为 `default_server` 时，脚本会先将对应 Nginx 文件备份到 `/var/backups/atlas-gallery/nginx-default-migration-时间/`，再移除旧声明中的 `default_server` 标记，由 Atlas Gallery 配置统一接管该端口。

## 9. 日常运维与故障排查

查看服务状态和日志：

```bash
sudo systemctl status atlas-gallery nginx --no-pager
sudo journalctl -u atlas-gallery -n 100 --no-pager
sudo tail -n 100 /var/log/nginx/error.log
sudo tail -n 100 /var/log/nginx/access.log
```

页面返回 `502 Bad Gateway`：

```bash
curl -v http://127.0.0.1:4173/api/health
sudo systemctl restart atlas-gallery
sudo journalctl -u atlas-gallery -n 100 --no-pager
```

脚本提示 Nginx 服务版本与仓库版本不一致：

```bash
curl --fail http://127.0.0.1:4173/api/health
curl --fail http://127.0.0.1:59886/api/health
sudo nginx -T 2>/dev/null | grep -nE 'listen.*59886|server_name|root |proxy_pass'
```

两个健康接口的 `version` 不同，表示 `59886` 命中了其他旧 Nginx 虚拟主机。检查 `/etc/nginx/sites-enabled/` 中同时监听 `59886` 的旧配置，停用冲突配置后重新执行脚本。

外部无法访问 `59886`：

```bash
curl -v http://127.0.0.1:59886/api/health
sudo nginx -t
sudo ss -lntp | grep ':59886'
sudo ufw status numbered
```

本机访问正常而外部失败，检查云安全组是否已允许 TCP `59886`。页面能打开但站点请求失败时，检查服务器到目标站点的网络，必要时配置 `UPSTREAM_PROXY` 并重启服务：

```bash
sudo systemctl restart atlas-gallery
curl --fail http://127.0.0.1:4173/api/health
```

## 10. 备份

服务器侧只需备份服务配置：

```bash
sudo tar -czf /root/atlas-gallery-server-config.tar.gz \
  /etc/atlas-gallery \
  /etc/systemd/system/atlas-gallery.service \
  /etc/nginx/sites-available/atlas-gallery
```

访问者的收藏和设置需要在网页中导出 JSON；更换域名、IP、协议或端口后，浏览器会将新地址视为独立站点，需要手动导入数据。
