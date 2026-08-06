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
CURRENT_STEP="准备执行"
CURRENT_STEP_NUMBER=0
TOTAL_STEPS=0
RUN_MODE=""
RUN_MODE_LABEL=""
FINAL_REPORTED=false

log() {
  printf '[atlas-gallery] %s\n' "$*"
}

fail() {
  printf '[atlas-gallery] 错误：%s\n' "$*" >&2
  FINAL_REPORTED=true
  printf '\n==================================================\n' >&2
  printf '最终结果：执行失败\n' >&2
  printf '失败步骤：%s\n' "${CURRENT_STEP}" >&2
  printf '==================================================\n' >&2
  exit 1
}

on_error() {
  local exit_code="$?"
  trap - ERR
  if [[ "${FINAL_REPORTED}" != true ]]; then
    printf '\n==================================================\n' >&2
    printf '最终结果：执行失败\n' >&2
    printf '失败步骤：%s\n' "${CURRENT_STEP}" >&2
    printf '退出代码：%s\n' "${exit_code}" >&2
    printf '==================================================\n' >&2
  fi
  exit "${exit_code}"
}

cleanup() {
  if [[ -n "${TEMP_FILE}" && -f "${TEMP_FILE}" ]]; then
    rm -f -- "${TEMP_FILE}"
  fi
}

trap cleanup EXIT
trap on_error ERR

run_step() {
  local title="$1"
  shift
  CURRENT_STEP_NUMBER=$((CURRENT_STEP_NUMBER + 1))
  CURRENT_STEP="${title}"
  printf '\n[%s/%s] 开始：%s\n' "${CURRENT_STEP_NUMBER}" "${TOTAL_STEPS}" "${title}"
  "$@"
  printf '[%s/%s] 完成：%s\n' "${CURRENT_STEP_NUMBER}" "${TOTAL_STEPS}" "${title}"
}

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

clone_or_update_repository() {
  if [[ -d "${INSTALL_DIR}/.git" ]]; then
    update_repository
    return
  fi

  if find "${INSTALL_DIR}" -mindepth 1 -maxdepth 1 -print -quit | grep -q .; then
    fail "${INSTALL_DIR} 已存在且不是空目录，未覆盖现有文件。"
  fi

  log "从 GitHub 拉取 ${BRANCH} 分支。"
  run_as_app git clone --branch "${BRANCH}" "${REPO_URL}" "${INSTALL_DIR}"
}

update_repository() {
  [[ -d "${INSTALL_DIR}/.git" ]] || fail "${INSTALL_DIR} 不是 Git 仓库，无法执行更新。"
  log "强制完整获取远端代码、分支和标签。"
  run_as_app git -C "${INSTALL_DIR}" fetch --all --force --prune --tags
  run_as_app git -C "${INSTALL_DIR}" reset --hard "origin/${BRANCH}"
  run_as_app git -C "${INSTALL_DIR}" clean -fd
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
  local expected_version
  local health_response
  local index_html
  expected_version="$(run_as_app node -p "require('${INSTALL_DIR}/package.json').version")"
  wait_for_health "http://127.0.0.1:4173/api/health"
  wait_for_health "http://127.0.0.1:59886/api/health"
  health_response="$(curl --fail --silent --show-error --max-time 5 http://127.0.0.1:59886/api/health)"
  index_html="$(curl --fail --silent --show-error --max-time 5 http://127.0.0.1:59886/)"
  [[ "${health_response}" == *"\"version\":\"${expected_version}\""* ]] \
    || fail "Nginx 返回的服务版本与仓库版本不一致。"
  [[ "${index_html}" == *"/css/styles.css?v=${expected_version}"* ]] \
    || fail "Nginx 返回的页面资源版本与仓库版本不一致。"
}

prepare_install() {
  require_root
  require_supported_system
  validate_settings
}

prepare_update() {
  prepare_install
  id "${APP_USER}" >/dev/null 2>&1 || fail "系统用户 ${APP_USER} 不存在，无法更新。"
  [[ -d "${INSTALL_DIR}/.git" ]] || fail "${INSTALL_DIR} 不是 Git 仓库，无法更新。"
}

print_success() {
  local commit
  local server_ip
  commit="$(run_as_app git -C "${INSTALL_DIR}" rev-parse --short HEAD)"
  server_ip="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
  server_ip="${server_ip:-服务器IP}"
  FINAL_REPORTED=true
  printf '\n==================================================\n'
  printf '最终结果：执行成功\n'
  printf '执行模式：%s\n' "${RUN_MODE_LABEL}"
  printf '代码版本：%s\n' "${commit}"
  printf '服务状态：Atlas Gallery 与 Nginx 健康检查通过\n'
  printf '访问地址：http://%s:59886/\n' "${server_ip}"
  printf '==================================================\n'
}

install_app() {
  TOTAL_STEPS=8
  run_step "检查系统与脚本配置" prepare_install
  run_step "安装系统软件和 Node.js" install_system_packages
  run_step "创建运行用户和部署目录" ensure_app_user
  run_step "从 GitHub 拉取完整代码" clone_or_update_repository
  run_step "安装 systemd、Nginx 和环境配置" install_configuration
  run_step "执行项目检查和自动化测试" run_project_checks
  run_step "启动 Atlas Gallery 和 Nginx" restart_services
  run_step "验证 4173 与 59886 端口健康状态" verify_deployment
}

update_app() {
  TOTAL_STEPS=8
  run_step "检查系统与现有部署" prepare_update
  run_step "检查并补全系统软件和 Node.js" install_system_packages
  run_step "备份服务器配置" backup_server_configuration
  run_step "从 GitHub 强制同步全部代码" update_repository
  run_step "更新 systemd、Nginx 和环境配置" install_configuration
  run_step "执行项目检查和自动化测试" run_project_checks
  run_step "重启 Atlas Gallery 和 Nginx" restart_services
  run_step "验证 4173 与 59886 端口健康状态" verify_deployment
}

usage() {
  cat <<'EOF'
用法：
  sudo bash atlas-gallery.sh          # 自动判断首次部署或强制更新
  sudo bash atlas-gallery.sh auto     # 与无参数执行相同
  sudo bash atlas-gallery.sh install  # 指定首次部署
  sudo bash atlas-gallery.sh update   # 指定强制更新

可选环境变量：ATLAS_REPO_URL、ATLAS_BRANCH
EOF
}

main() {
  case "${1:-auto}" in
    auto)
      if [[ -d "${INSTALL_DIR}/.git" ]]; then
        RUN_MODE="update"
      else
        RUN_MODE="install"
      fi
      ;;
    install|update) RUN_MODE="$1" ;;
    -h|--help|help) usage; exit 0 ;;
    *) usage; exit 2 ;;
  esac

  case "${RUN_MODE}" in
    install)
      RUN_MODE_LABEL="首次部署"
      install_app
      ;;
    update)
      RUN_MODE_LABEL="强制更新"
      update_app
      ;;
  esac
  print_success
}

main "$@"
