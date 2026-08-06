#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

readonly APP_USER="atlas-gallery"
readonly APP_GROUP="atlas-gallery"
readonly INSTALL_DIR="/opt/codex-anima-html"
readonly ENV_DIR="/etc/atlas-gallery"
readonly ENV_FILE="${ENV_DIR}/atlas-gallery.env"
readonly SERVICE_FILE="/etc/systemd/system/atlas-gallery.service"
readonly NGINX_SITE="/etc/nginx/sites-available/atlas-gallery"
readonly NGINX_LINK="/etc/nginx/sites-enabled/atlas-gallery"
readonly BACKUP_DIR="/var/backups/atlas-gallery"
readonly REPO_URL="${ATLAS_REPO_URL:-https://github.com/Neptune326/codex-anima-html.git}"
readonly BRANCH="${ATLAS_BRANCH:-main}"

TEMP_FILE=""

log() {
  printf '[atlas-gallery] %s\n' "$*"
}

fail() {
  printf '[atlas-gallery] 错误：%s\n' "$*" >&2
  exit 1
}

cleanup() {
  if [[ -n "${TEMP_FILE}" && -f "${TEMP_FILE}" ]]; then
    rm -f -- "${TEMP_FILE}"
  fi
}

trap cleanup EXIT

require_root() {
  [[ "${EUID}" -eq 0 ]] || fail "请使用 sudo 运行此脚本。"
}

require_supported_system() {
  [[ -r /etc/os-release ]] || fail "无法识别操作系统。"
  # shellcheck disable=SC1091
  source /etc/os-release
  case "${ID:-}" in
    ubuntu|debian) ;;
    *) fail "仅支持 Ubuntu 22.04/24.04 和 Debian 12。" ;;
  esac
}

validate_settings() {
  [[ "${BRANCH}" =~ ^[A-Za-z0-9._/-]+$ ]] || fail "ATLAS_BRANCH 包含不支持的字符。"
  [[ "${REPO_URL}" == https://* || "${REPO_URL}" == git@* ]] || fail "ATLAS_REPO_URL 必须是 HTTPS 或 SSH Git 地址。"
}

run_as_app() {
  runuser -u "${APP_USER}" -- "$@"
}

install_system_packages() {
  log "安装 Git、Nginx、curl 和基础证书。"
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y git nginx curl ca-certificates gnupg

  local node_major=0
  if command -v node >/dev/null 2>&1; then
    node_major="$(node --version | sed -E 's/^v([0-9]+).*/\1/')"
  fi

  if [[ ! "${node_major}" =~ ^[0-9]+$ ]] || (( node_major < 16 )); then
    log "安装 Node.js 22.x。"
    TEMP_FILE="$(mktemp /tmp/atlas-gallery-nodesource.XXXXXX.sh)"
    curl -fsSL https://deb.nodesource.com/setup_22.x -o "${TEMP_FILE}"
    bash "${TEMP_FILE}"
    DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs
    rm -f -- "${TEMP_FILE}"
    TEMP_FILE=""
  fi

  command -v node >/dev/null 2>&1 || fail "Node.js 安装失败。"
  command -v npm >/dev/null 2>&1 || fail "npm 安装失败。"
}

ensure_app_user() {
  if ! getent group "${APP_GROUP}" >/dev/null; then
    groupadd --system "${APP_GROUP}"
  fi
  if ! id "${APP_USER}" >/dev/null 2>&1; then
    useradd --system --gid "${APP_GROUP}" --home-dir "${INSTALL_DIR}" --shell /usr/sbin/nologin "${APP_USER}"
  fi
  install -d -o "${APP_USER}" -g "${APP_GROUP}" -m 0755 "${INSTALL_DIR}"
}

assert_clean_repository() {
  [[ -d "${INSTALL_DIR}/.git" ]] || fail "${INSTALL_DIR} 不是 Git 仓库，请先执行 install。"
  local changes
  changes="$(run_as_app git -C "${INSTALL_DIR}" status --porcelain --untracked-files=normal)"
  [[ -z "${changes}" ]] || fail "服务器仓库存在未提交修改，已停止更新。"

  local current_branch
  current_branch="$(run_as_app git -C "${INSTALL_DIR}" symbolic-ref --quiet --short HEAD || true)"
  [[ "${current_branch}" == "${BRANCH}" ]] || fail "服务器当前分支为 ${current_branch:-detached HEAD}，预期为 ${BRANCH}。"
}

clone_or_update_repository() {
  if [[ -d "${INSTALL_DIR}/.git" ]]; then
    update_repository
    return
  fi

  if find "${INSTALL_DIR}" -mindepth 1 -maxdepth 1 -print -quit | grep -q .; then
    fail "${INSTALL_DIR} 已存在且不是空目录，未覆盖现有文件。"
  fi

  log "从 GitHub 拉取 ${BRANCH} 分支。"
  run_as_app git clone --branch "${BRANCH}" --single-branch "${REPO_URL}" "${INSTALL_DIR}"
}

update_repository() {
  assert_clean_repository
  log "以仅快进方式更新 ${BRANCH} 分支。"
  run_as_app git -C "${INSTALL_DIR}" fetch --prune origin "${BRANCH}"
  run_as_app git -C "${INSTALL_DIR}" merge --ff-only "origin/${BRANCH}"
}

backup_server_configuration() {
  install -d -m 0700 "${BACKUP_DIR}"
  local archive="${BACKUP_DIR}/atlas-gallery-$(date +%Y%m%d-%H%M%S).tar.gz"
  local paths=()
  [[ -e "${ENV_DIR}" ]] && paths+=("${ENV_DIR}")
  [[ -e "${SERVICE_FILE}" ]] && paths+=("${SERVICE_FILE}")
  [[ -e "${NGINX_SITE}" ]] && paths+=("${NGINX_SITE}")
  if (( ${#paths[@]} > 0 )); then
    tar -czf "${archive}" "${paths[@]}"
    log "服务器配置已备份到 ${archive}。"
  fi
}

install_configuration() {
  install -d -o root -g "${APP_GROUP}" -m 0750 "${ENV_DIR}"
  if [[ ! -f "${ENV_FILE}" ]]; then
    install -o root -g "${APP_GROUP}" -m 0640 \
      "${INSTALL_DIR}/deploy/atlas-gallery.env.example" "${ENV_FILE}"
    log "已创建 ${ENV_FILE}，后续更新不会覆盖该文件。"
  fi

  install -o root -g root -m 0644 "${INSTALL_DIR}/deploy/atlas-gallery.service" "${SERVICE_FILE}"
  install -o root -g root -m 0644 "${INSTALL_DIR}/deploy/nginx-atlas-gallery.conf" "${NGINX_SITE}"
  ln -sfn "${NGINX_SITE}" "${NGINX_LINK}"
  rm -f /etc/nginx/sites-enabled/default
}

run_project_checks() {
  log "执行语法检查和自动化测试。"
  run_as_app npm --prefix "${INSTALL_DIR}" run check
  run_as_app npm --prefix "${INSTALL_DIR}" test
}

restart_services() {
  systemctl daemon-reload
  systemctl enable atlas-gallery >/dev/null
  systemctl restart atlas-gallery
  nginx -t
  systemctl enable nginx >/dev/null
  systemctl restart nginx
}

wait_for_health() {
  local url="$1"
  local attempt
  for attempt in {1..20}; do
    if curl --fail --silent --show-error --max-time 5 "${url}" >/dev/null; then
      return 0
    fi
    sleep 1
  done
  fail "健康检查失败：${url}"
}

verify_deployment() {
  log "验证 Node 与 Nginx 健康状态。"
  wait_for_health "http://127.0.0.1:4173/api/health"
  wait_for_health "http://127.0.0.1:59886/api/health"
  log "部署完成，访问地址：http://服务器地址:59886/"
}

install_app() {
  install_system_packages
  ensure_app_user
  clone_or_update_repository
  install_configuration
  run_project_checks
  restart_services
  verify_deployment
}

update_app() {
  command -v git >/dev/null 2>&1 || fail "未安装 Git，请先执行 install。"
  command -v npm >/dev/null 2>&1 || fail "未安装 npm，请先执行 install。"
  id "${APP_USER}" >/dev/null 2>&1 || fail "系统用户 ${APP_USER} 不存在，请先执行 install。"
  backup_server_configuration
  update_repository
  install_configuration
  run_project_checks
  restart_services
  verify_deployment
}

usage() {
  cat <<'EOF'
用法：
  sudo bash atlas-gallery.sh install  # 全新安装或安全补全部署
  sudo bash atlas-gallery.sh update   # 拉取 GitHub 最新代码并更新部署

可选环境变量：ATLAS_REPO_URL、ATLAS_BRANCH
EOF
}

main() {
  require_root
  require_supported_system
  validate_settings
  case "${1:-}" in
    install) install_app ;;
    update) update_app ;;
    -h|--help|help) usage ;;
    *) usage; exit 2 ;;
  esac
}

main "$@"
