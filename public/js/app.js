import {
  PAGE_SIZE,
  SOURCES,
  createQuery,
  getSource,
  ratingName
} from './sites.js';
import {
  exportLibrary,
  importLibrary,
  loadState,
  resetState,
  saveState
} from './storage.js';

const elements = {
  sourceList: document.querySelector('#sourceList'),
  controlSurface: document.querySelector('#controlSurface'),
  mediaTypeControl: document.querySelector('#mediaTypeControl'),
  tagInput: document.querySelector('#tagInput'),
  searchForm: document.querySelector('#searchForm'),
  ratingFilters: document.querySelector('#ratingFilters'),
  periodFilters: document.querySelector('#periodFilters'),
  dateFilter: document.querySelector('#dateFilter'),
  anchorDate: document.querySelector('#anchorDate'),
  previousDate: document.querySelector('#previousDate'),
  nextDate: document.querySelector('#nextDate'),
  capabilityNote: document.querySelector('#capabilityNote'),
  recentSearches: document.querySelector('#recentSearches'),
  recentSearchList: document.querySelector('#recentSearchList'),
  sectionTitle: document.querySelector('#sectionTitle'),
  sectionSubtitle: document.querySelector('#sectionSubtitle'),
  sectionIconUse: document.querySelector('#sectionIconUse'),
  favoriteCount: document.querySelector('#favoriteCount'),
  resultCount: document.querySelector('#resultCount'),
  gallery: document.querySelector('#gallery'),
  loadingMore: document.querySelector('#loadingMore'),
  loadSentinel: document.querySelector('#loadSentinel'),
  messageBanner: document.querySelector('#messageBanner'),
  messageText: document.querySelector('#messageText'),
  retryButton: document.querySelector('#retryButton'),
  refreshButton: document.querySelector('#refreshButton'),
  settingsButton: document.querySelector('#settingsButton'),
  settingsDrawer: document.querySelector('#settingsDrawer'),
  themeControl: document.querySelector('#themeControl'),
  accentOptions: document.querySelector('#accentOptions'),
  proxyTemplate: document.querySelector('#proxyTemplate'),
  exportButton: document.querySelector('#exportButton'),
  importButton: document.querySelector('#importButton'),
  importFile: document.querySelector('#importFile'),
  resetButton: document.querySelector('#resetButton'),
  savedSearchButton: document.querySelector('#savedSearchButton'),
  savedSearchDialog: document.querySelector('#savedSearchDialog'),
  closeSavedSearch: document.querySelector('#closeSavedSearch'),
  saveSearchForm: document.querySelector('#saveSearchForm'),
  savedSearchName: document.querySelector('#savedSearchName'),
  savedSearchList: document.querySelector('#savedSearchList'),
  previewDialog: document.querySelector('#previewDialog'),
  previewStage: document.querySelector('#previewStage'),
  previewMedia: document.querySelector('#previewMedia'),
  previewDetails: document.querySelector('#previewDetails'),
  closePreview: document.querySelector('#closePreview'),
  previousPreview: document.querySelector('#previousPreview'),
  nextPreview: document.querySelector('#nextPreview'),
  networkStatus: document.querySelector('#networkStatus'),
  backToTop: document.querySelector('#backToTop'),
  toast: document.querySelector('#toast')
};

let state = loadState();
let posts = [];
let currentPage = 1;
let hasMore = true;
let isLoading = false;
let activeRequest = null;
let requestSequence = 0;
let selectedIndex = -1;
let toastTimer;

function icon(name) {
  return `<svg class="icon"><use href="#icon-${name}"></use></svg>`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

function formatDate(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}

function dateRange() {
  const anchor = new Date(`${state.anchorDate}T12:00:00`);
  const start = new Date(anchor);
  const end = new Date(anchor);

  if (state.period === 'week') {
    const daysAfterMonday = (anchor.getDay() + 6) % 7;
    start.setDate(anchor.getDate() - daysAfterMonday);
    end.setTime(start.getTime());
    end.setDate(start.getDate() + 6);
  } else if (state.period === 'month') {
    start.setDate(1);
    end.setFullYear(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  } else if (state.period === 'year') {
    start.setFullYear(anchor.getFullYear(), 0, 1);
    end.setFullYear(anchor.getFullYear(), 11, 31);
  }

  return {
    startDate: formatDate(start),
    endDate: formatDate(end)
  };
}

function currentQuery(page = currentPage) {
  return createQuery({
    page,
    mediaType: state.mediaType,
    tags: state.tags,
    ...dateRange()
  });
}

function currentSource() {
  return getSource(state.source);
}

function visiblePosts() {
  return state.view === 'favorites' ? Object.values(state.favorites) : posts;
}

function favoriteKey(post) {
  return `${post.source}:${post.id}`;
}

function persist() {
  saveState(state);
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    elements.toast.classList.remove('is-visible');
  }, 2200);
}

function showMessage(message) {
  elements.messageText.textContent = message;
  elements.messageBanner.hidden = false;
}

function hideMessage() {
  elements.messageBanner.hidden = true;
}

function renderSources() {
  elements.sourceList.innerHTML = Object.entries(SOURCES).map(([sourceId, source]) => `
    <button
      class="source-chip ${sourceId === state.source ? 'is-selected' : ''}"
      type="button"
      data-source="${sourceId}"
      title="${escapeHtml(source.description)}"
      role="listitem"
    >${escapeHtml(source.shortName)}</button>
  `).join('');
}

function renderRecentSearches() {
  const searches = state.recentSearches.filter(Boolean).slice(0, 6);
  elements.recentSearches.hidden = searches.length === 0 || state.view === 'favorites';
  elements.recentSearchList.innerHTML = searches.map(search => `
    <button class="filter-chip" type="button" data-recent-search="${escapeHtml(search)}">
      ${escapeHtml(search)}
    </button>
  `).join('');
}

function renderSavedSearches() {
  if (!state.savedSearches.length) {
    elements.savedSearchList.innerHTML = `
      <div class="empty-state compact-empty-state">
        <div class="empty-state-content">
          <div class="empty-state-icon">${icon('bookmark')}</div>
          <h2>还没有搜索集</h2>
          <p>为当前站点、标签和筛选条件命名后保存。</p>
        </div>
      </div>
    `;
    return;
  }

  elements.savedSearchList.innerHTML = state.savedSearches.map((savedSearch, index) => {
    const source = getSource(savedSearch.source);
    const summary = [source.shortName, savedSearch.tags || '无标签', savedSearch.mediaType === 'video' ? '视频' : '图片'];

    return `
      <article class="saved-search-item">
        <div class="saved-search-copy">
          <strong>${escapeHtml(savedSearch.name)}</strong>
          <small>${escapeHtml(summary.join(' · '))}</small>
        </div>
        <button class="text-button" type="button" data-apply-search="${index}">应用</button>
        <button class="more-button" type="button" data-delete-search="${index}" title="删除搜索集">
          ${icon('delete')}
        </button>
      </article>
    `;
  }).join('');
}

function renderControls() {
  document.documentElement.dataset.theme = state.settings.theme;
  document.documentElement.dataset.accent = state.settings.accent;
  document.documentElement.dataset.compact = String(state.settings.compactGrid);
  document.documentElement.dataset.reduceMotion = String(state.settings.reduceMotion);

  document.querySelectorAll('[data-view]').forEach(button => {
    button.classList.toggle('is-active', button.dataset.view === state.view);
  });
  document.querySelectorAll('[data-media-type]').forEach(button => {
    button.classList.toggle('is-active', button.dataset.mediaType === state.mediaType);
  });
  document.querySelectorAll('[data-rating]').forEach(button => {
    button.classList.toggle('is-selected', state.ratings.includes(button.dataset.rating));
  });
  document.querySelectorAll('[data-period]').forEach(button => {
    button.classList.toggle('is-selected', button.dataset.period === state.period);
  });
  document.querySelectorAll('[data-theme-value]').forEach(button => {
    button.classList.toggle('is-active', button.dataset.themeValue === state.settings.theme);
  });
  document.querySelectorAll('[data-accent-value]').forEach(button => {
    button.classList.toggle('is-selected', button.dataset.accentValue === state.settings.accent);
  });
  document.querySelectorAll('[data-setting]').forEach(input => {
    input.checked = Boolean(state.settings[input.dataset.setting]);
  });

  const source = currentSource();
  const supportsDate = source.capabilities.date;
  const supportsVideo = source.capabilities.video;
  elements.controlSurface.hidden = state.view === 'favorites';
  elements.dateFilter.classList.toggle('is-disabled', !supportsDate);
  elements.dateFilter.querySelectorAll('button, input').forEach(control => {
    control.disabled = !supportsDate;
  });
  elements.capabilityNote.textContent = supportsDate
    ? '该站点支持按日期周期筛选。'
    : supportsVideo
      ? '该站点按全站热度排序，不支持日期周期筛选。'
      : '该站点仅提供图片，按全站热度排序。';

  elements.tagInput.value = state.tags;
  elements.anchorDate.value = state.anchorDate;
  elements.anchorDate.max = formatDate(new Date());
  elements.proxyTemplate.value = state.settings.proxyTemplate;
  elements.favoriteCount.textContent = Object.keys(state.favorites).length;

  renderSources();
  renderRecentSearches();
  persist();
}

function renderHeader() {
  if (state.view === 'favorites') {
    elements.sectionTitle.textContent = '我的收藏';
    elements.sectionSubtitle.textContent = '收藏内容保存在当前浏览器，可导入或导出备份';
    elements.sectionIconUse.setAttribute('href', '#icon-favorite');
    return;
  }

  elements.sectionTitle.textContent = '热门图库';
  elements.sectionSubtitle.textContent = `${currentSource().name} · ${state.mediaType === 'video' ? '视频' : '图片'}内容`;
  elements.sectionIconUse.setAttribute('href', '#icon-fire');
}

function emptyState() {
  const favoritesView = state.view === 'favorites';
  const title = favoritesView ? '还没有收藏内容' : '没有找到可展示的内容';
  const description = favoritesView
    ? '浏览图库并点击心形按钮，即可在这里集中查看。'
    : '调整标签、媒体类型或内容分级后重试。';
  const iconName = favoritesView ? 'favorite' : state.mediaType;

  return `
    <div class="empty-state">
      <div class="empty-state-content">
        <div class="empty-state-icon">${icon(iconName)}</div>
        <h2>${title}</h2>
        <p>${description}</p>
      </div>
    </div>
  `;
}

function renderSkeletons() {
  elements.gallery.innerHTML = Array.from({ length: 10 }, () => '<div class="skeleton"></div>').join('');
}

function postCard(post, index) {
  const isFavorite = Boolean(state.favorites[favoriteKey(post)]);
  const isSensitive = state.settings.blurSensitive && post.rating !== 'safe';
  const preview = post.preview || post.sample || post.file;
  const mediaName = post.type === 'video' ? '视频' : '图片';

  return `
    <article class="media-card ${isSensitive ? 'is-sensitive' : ''}">
      <button class="media-button" type="button" data-open-preview="${index}" aria-label="预览帖子 ${escapeHtml(post.id)}">
        <img
          src="${escapeHtml(preview)}"
          alt="${escapeHtml(post.tags?.slice(0, 6).join(', ') || `帖子 ${post.id}`)}"
          loading="lazy"
          decoding="async"
        >
        <span class="media-badge">${icon(post.type)}${mediaName}</span>
        <span class="rating-badge">${ratingName(post.rating)}</span>
      </button>
      <footer class="card-footer">
        <span class="score">▲ ${Number(post.score) || 0}</span>
        <span class="dimensions">${Number(post.width) || 0} × ${Number(post.height) || 0}</span>
        <button
          class="favorite-button ${isFavorite ? 'is-active' : ''}"
          type="button"
          data-toggle-favorite="${index}"
          title="${isFavorite ? '取消收藏' : '添加收藏'}"
        >${icon('favorite')}</button>
      </footer>
    </article>
  `;
}

function renderGallery() {
  const rows = visiblePosts();
  renderHeader();
  elements.resultCount.textContent = `${rows.length} 项`;
  elements.favoriteCount.textContent = Object.keys(state.favorites).length;
  elements.gallery.innerHTML = rows.length
    ? rows.map(postCard).join('')
    : emptyState();
}

function buildRequestUrl(upstreamUrl) {
  const template = state.settings.proxyTemplate.trim();

  if (template && template.includes('{url}')) {
    return template.replace('{url}', encodeURIComponent(upstreamUrl));
  }

  return `/api/proxy?url=${encodeURIComponent(upstreamUrl)}`;
}

async function requestJson(upstreamUrl, signal) {
  const response = await fetch(buildRequestUrl(upstreamUrl), {
    signal,
    credentials: 'omit',
    headers: {
      Accept: 'application/json,text/plain,*/*'
    }
  });

  if (!response.ok) {
    let detail = '';

    try {
      detail = (await response.json()).error || '';
    } catch {
      // Keep the HTTP status as the fallback error.
    }

    throw new Error(detail || `HTTP ${response.status}`);
  }

  return response.json();
}

async function requestWithRetry(upstreamUrl, signal) {
  let firstError;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await requestJson(upstreamUrl, signal);
    } catch (error) {
      if (error.name === 'AbortError') {
        throw error;
      }

      firstError ||= error;
      if (attempt === 0) {
        await new Promise(resolve => setTimeout(resolve, 450));
      }
    }
  }

  throw firstError;
}

function filterPosts(rows) {
  return rows.filter(post => {
    return post.preview
      && post.file
      && post.type === state.mediaType
      && state.ratings.includes(post.rating);
  });
}

async function fetchPosts({ reset = false } = {}) {
  if (state.view === 'favorites' || isLoading && !reset || !hasMore && !reset) {
    return;
  }

  if (reset) {
    activeRequest?.abort();
    posts = [];
    currentPage = 1;
    hasMore = true;
    hideMessage();
    renderSkeletons();
  }

  const sequence = ++requestSequence;
  const controller = new AbortController();
  activeRequest = controller;
  isLoading = true;
  elements.loadingMore.hidden = reset;
  elements.refreshButton.disabled = true;

  try {
    const source = currentSource();
    const upstreamUrl = source.buildUrl(currentQuery()).href;
    const payload = await requestWithRetry(upstreamUrl, controller.signal);

    if (sequence !== requestSequence) {
      return;
    }

    const rawPosts = source.parse(payload);
    const filteredPosts = filterPosts(rawPosts);
    const uniquePosts = new Map(
      [...posts, ...filteredPosts].map(post => [favoriteKey(post), post])
    );

    posts = [...uniquePosts.values()].sort((left, right) => right.score - left.score);
    hasMore = rawPosts.length >= PAGE_SIZE;
    currentPage += 1;
    hideMessage();
    renderGallery();
  } catch (error) {
    if (error.name === 'AbortError' || sequence !== requestSequence) {
      return;
    }

    const sourceName = currentSource().name;
    showMessage(`${sourceName} 请求失败：${error.message}`);
    renderGallery();
  } finally {
    if (sequence === requestSequence) {
      isLoading = false;
      elements.loadingMore.hidden = true;
      elements.refreshButton.disabled = false;
    }
  }
}

function addRecentSearch(value) {
  const search = value.trim();
  if (!search) {
    return;
  }

  state.recentSearches = [
    search,
    ...state.recentSearches.filter(item => item !== search)
  ].slice(0, 8);
}

function applySearch() {
  state.tags = elements.tagInput.value.trim();
  addRecentSearch(state.tags);
  renderControls();
  fetchPosts({ reset: true });
}

function changeSource(sourceId) {
  state.source = sourceId;
  if (!currentSource().capabilities.video && state.mediaType === 'video') {
    state.mediaType = 'image';
    showToast('该站点仅提供图片，已切换到图片分类');
  }
  renderControls();
  fetchPosts({ reset: true });
}

function toggleFavorite(post) {
  const key = favoriteKey(post);
  if (state.favorites[key]) {
    delete state.favorites[key];
    showToast('已取消收藏');
  } else {
    state.favorites[key] = post;
    showToast('已添加到收藏');
  }

  persist();
  renderGallery();
  if (elements.previewDialog.open) {
    renderPreview();
  }
}

function previewDate(post) {
  const value = post.createdAt || post.date;
  if (!value) {
    return '未知';
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '未知' : date.toLocaleString('zh-CN');
}

function renderPreview() {
  const rows = visiblePosts();
  const post = rows[selectedIndex];
  if (!post) {
    closePreview();
    return;
  }

  const mediaUrl = post.type === 'video' ? post.file : post.sample || post.file;
  elements.previewDialog.classList.toggle('hide-details', state.settings.hideDetails);
  elements.previewMedia.innerHTML = post.type === 'video'
    ? `
      <video
        src="${escapeHtml(mediaUrl)}"
        poster="${escapeHtml(post.preview)}"
        controls
        playsinline
        ${state.settings.autoplay ? 'autoplay muted' : ''}
      ></video>
    `
    : `<img src="${escapeHtml(mediaUrl)}" alt="${escapeHtml(post.tags?.join(', ') || `帖子 ${post.id}`)}">`;

  const source = getSource(post.source);
  const isFavorite = Boolean(state.favorites[favoriteKey(post)]);
  const tags = Array.isArray(post.tags) ? post.tags.slice(0, 100) : [];

  elements.previewDetails.innerHTML = `
    <span class="preview-eyebrow">${escapeHtml(source.name)}</span>
    <h2>帖子 #${escapeHtml(post.id)}</h2>
    <dl class="metadata-list">
      <div><dt>热度</dt><dd>${Number(post.score) || 0}</dd></div>
      <div><dt>尺寸</dt><dd>${Number(post.width) || 0} × ${Number(post.height) || 0}</dd></div>
      <div><dt>类型</dt><dd>${post.type === 'video' ? '视频' : '图片'}</dd></div>
      <div><dt>分级</dt><dd>${ratingName(post.rating)}</dd></div>
      <div><dt>发布时间</dt><dd>${escapeHtml(previewDate(post))}</dd></div>
    </dl>
    <div class="preview-tags">
      ${tags.map(tag => `<button class="preview-tag" type="button" data-search-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</button>`).join('')}
    </div>
    <div class="preview-actions">
      <button class="outlined-button" id="previewFavorite" type="button">
        ${icon('favorite')}${isFavorite ? '取消收藏' : '收藏'}
      </button>
      <button class="outlined-button" id="copyTags" type="button">
        ${icon('copy')}复制标签
      </button>
      <a class="filled-button wide" href="${escapeHtml(post.file)}" target="_blank" rel="noreferrer">
        ${icon('download')}打开原文件
      </a>
      <a class="outlined-button wide" href="${escapeHtml(post.postUrl)}" target="_blank" rel="noreferrer">
        ${icon('external')}打开原帖
      </a>
    </div>
  `;

  elements.previousPreview.disabled = selectedIndex <= 0;
  elements.nextPreview.disabled = selectedIndex >= rows.length - 1;
  document.querySelector('#previewFavorite').addEventListener('click', () => toggleFavorite(post));
  document.querySelector('#copyTags').addEventListener('click', () => copyTags(post));
}

function openPreview(index) {
  selectedIndex = index;
  renderPreview();
  if (!elements.previewDialog.open) {
    elements.previewDialog.showModal();
  }
}

function closePreview() {
  elements.previewMedia.innerHTML = '';
  if (elements.previewDialog.open) {
    elements.previewDialog.close();
  }
  selectedIndex = -1;
}

function movePreview(step) {
  const nextIndex = selectedIndex + step;
  if (nextIndex >= 0 && nextIndex < visiblePosts().length) {
    selectedIndex = nextIndex;
    renderPreview();
  }
}

async function copyTags(post) {
  try {
    await navigator.clipboard.writeText((post.tags || []).join(' '));
    showToast('标签已复制');
  } catch {
    showToast('浏览器未允许复制，请从原帖查看标签');
  }
}

function openDrawer() {
  elements.settingsDrawer.classList.add('is-open');
  elements.settingsDrawer.setAttribute('aria-hidden', 'false');
}

function closeDrawer() {
  elements.settingsDrawer.classList.remove('is-open');
  elements.settingsDrawer.setAttribute('aria-hidden', 'true');
}

function shiftDate(direction) {
  const date = new Date(`${state.anchorDate}T12:00:00`);

  if (state.period === 'day') {
    date.setDate(date.getDate() + direction);
  } else if (state.period === 'week') {
    date.setDate(date.getDate() + direction * 7);
  } else if (state.period === 'month') {
    date.setMonth(date.getMonth() + direction);
  } else {
    date.setFullYear(date.getFullYear() + direction);
  }

  const today = new Date();
  if (date > today) {
    date.setTime(today.getTime());
  }

  state.anchorDate = formatDate(date);
  renderControls();
  fetchPosts({ reset: true });
}

function saveCurrentSearch(name) {
  state.savedSearches.unshift({
    name,
    source: state.source,
    mediaType: state.mediaType,
    period: state.period,
    anchorDate: state.anchorDate,
    ratings: [...state.ratings],
    tags: state.tags
  });
  state.savedSearches = state.savedSearches.slice(0, 30);
  persist();
  renderSavedSearches();
  elements.savedSearchName.value = '';
  showToast('搜索集已保存');
}

function applySavedSearch(savedSearch) {
  state = {
    ...state,
    source: savedSearch.source || state.source,
    mediaType: savedSearch.mediaType || savedSearch.media || state.mediaType,
    period: savedSearch.period || state.period,
    anchorDate: savedSearch.anchorDate || state.anchorDate,
    ratings: Array.isArray(savedSearch.ratings) ? savedSearch.ratings : state.ratings,
    tags: savedSearch.tags || ''
  };
  elements.savedSearchDialog.close();
  renderControls();
  fetchPosts({ reset: true });
}

function exportData() {
  const blob = new Blob([exportLibrary(state)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `atlas-gallery-${formatDate(new Date())}.json`;
  link.click();
  URL.revokeObjectURL(url);
  showToast('收藏数据已导出');
}

async function importData(file) {
  try {
    state = importLibrary(await file.text(), state);
    persist();
    renderControls();
    renderGallery();
    showToast('收藏数据已导入');
  } catch (error) {
    showToast(error.message);
  } finally {
    elements.importFile.value = '';
  }
}

function updateNetworkStatus() {
  const online = navigator.onLine;
  elements.networkStatus.classList.toggle('is-offline', !online);
  elements.networkStatus.innerHTML = online
    ? '<span>网络已连接</span>'
    : `${icon('wifi-off')}<span>当前离线</span>`;
}

function registerEvents() {
  document.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) {
      return;
    }

    if (button.dataset.view) {
      state.view = button.dataset.view;
      activeRequest?.abort();
      renderControls();
      state.view === 'favorites' ? renderGallery() : fetchPosts({ reset: true });
    }

    if (button.dataset.source) {
      changeSource(button.dataset.source);
    }

    if (button.dataset.mediaType) {
      if (button.dataset.mediaType === 'video' && !currentSource().capabilities.video) {
        showToast('当前站点不提供视频分类');
        return;
      }
      state.mediaType = button.dataset.mediaType;
      renderControls();
      fetchPosts({ reset: true });
    }

    if (button.dataset.rating) {
      const rating = button.dataset.rating;
      const selected = state.ratings.includes(rating);
      if (selected && state.ratings.length === 1) {
        showToast('至少保留一个内容分级');
        return;
      }
      state.ratings = selected
        ? state.ratings.filter(item => item !== rating)
        : [...state.ratings, rating];
      renderControls();
      fetchPosts({ reset: true });
    }

    if (button.dataset.period) {
      state.period = button.dataset.period;
      renderControls();
      fetchPosts({ reset: true });
    }

    if (button.dataset.recentSearch !== undefined) {
      state.tags = button.dataset.recentSearch;
      elements.tagInput.value = state.tags;
      applySearch();
    }

    if (button.dataset.openPreview !== undefined) {
      openPreview(Number(button.dataset.openPreview));
    }

    if (button.dataset.toggleFavorite !== undefined) {
      toggleFavorite(visiblePosts()[Number(button.dataset.toggleFavorite)]);
    }

    if (button.dataset.searchTag) {
      state.view = 'popular';
      state.tags = button.dataset.searchTag;
      closePreview();
      renderControls();
      fetchPosts({ reset: true });
    }

    if (button.dataset.applySearch !== undefined) {
      applySavedSearch(state.savedSearches[Number(button.dataset.applySearch)]);
    }

    if (button.dataset.deleteSearch !== undefined) {
      state.savedSearches.splice(Number(button.dataset.deleteSearch), 1);
      persist();
      renderSavedSearches();
    }
  });

  elements.searchForm.addEventListener('submit', event => {
    event.preventDefault();
    applySearch();
  });
  elements.refreshButton.addEventListener('click', () => fetchPosts({ reset: true }));
  elements.retryButton.addEventListener('click', () => fetchPosts({ reset: true }));
  elements.settingsButton.addEventListener('click', openDrawer);
  document.querySelectorAll('[data-close-drawer]').forEach(button => {
    button.addEventListener('click', closeDrawer);
  });
  elements.previousDate.addEventListener('click', () => shiftDate(-1));
  elements.nextDate.addEventListener('click', () => shiftDate(1));
  elements.anchorDate.addEventListener('change', () => {
    state.anchorDate = elements.anchorDate.value || formatDate(new Date());
    renderControls();
    fetchPosts({ reset: true });
  });

  elements.themeControl.addEventListener('click', event => {
    const button = event.target.closest('[data-theme-value]');
    if (!button) {
      return;
    }
    state.settings.theme = button.dataset.themeValue;
    renderControls();
  });
  elements.accentOptions.addEventListener('click', event => {
    const button = event.target.closest('[data-accent-value]');
    if (!button) {
      return;
    }
    state.settings.accent = button.dataset.accentValue;
    renderControls();
  });
  document.querySelectorAll('[data-setting]').forEach(input => {
    input.addEventListener('change', () => {
      state.settings[input.dataset.setting] = input.checked;
      renderControls();
      renderGallery();
      if (elements.previewDialog.open) {
        renderPreview();
      }
    });
  });
  elements.proxyTemplate.addEventListener('change', () => {
    const value = elements.proxyTemplate.value.trim();
    if (value && !value.includes('{url}')) {
      showToast('代理模板必须包含 {url}');
      elements.proxyTemplate.value = state.settings.proxyTemplate;
      return;
    }
    state.settings.proxyTemplate = value;
    persist();
  });

  elements.exportButton.addEventListener('click', exportData);
  elements.importButton.addEventListener('click', () => elements.importFile.click());
  elements.importFile.addEventListener('change', () => {
    const [file] = elements.importFile.files;
    if (file) {
      importData(file);
    }
  });
  elements.resetButton.addEventListener('click', () => {
    if (!window.confirm('清除全部收藏、搜索集和全局设置？')) {
      return;
    }
    state = resetState();
    state.anchorDate = formatDate(new Date());
    closeDrawer();
    renderControls();
    fetchPosts({ reset: true });
    showToast('本地数据已清除');
  });

  elements.savedSearchButton.addEventListener('click', () => {
    renderSavedSearches();
    elements.savedSearchDialog.showModal();
  });
  elements.closeSavedSearch.addEventListener('click', () => elements.savedSearchDialog.close());
  elements.saveSearchForm.addEventListener('submit', event => {
    event.preventDefault();
    saveCurrentSearch(elements.savedSearchName.value.trim());
  });

  elements.closePreview.addEventListener('click', closePreview);
  elements.previousPreview.addEventListener('click', () => movePreview(-1));
  elements.nextPreview.addEventListener('click', () => movePreview(1));
  elements.previewDialog.addEventListener('close', () => {
    elements.previewMedia.innerHTML = '';
    selectedIndex = -1;
  });

  document.addEventListener('keydown', event => {
    if (!elements.previewDialog.open) {
      return;
    }
    if (event.key === 'ArrowLeft') {
      movePreview(-1);
    } else if (event.key === 'ArrowRight') {
      movePreview(1);
    }
  });

  window.addEventListener('online', updateNetworkStatus);
  window.addEventListener('offline', updateNetworkStatus);
  window.addEventListener('scroll', () => {
    elements.backToTop.hidden = window.scrollY < 700;
  }, { passive: true });
  elements.backToTop.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: state.settings.reduceMotion ? 'auto' : 'smooth' });
  });
}

function initialize() {
  if (!state.anchorDate) {
    state.anchorDate = formatDate(new Date());
  }

  if (!SOURCES[state.source]) {
    state.source = 'konachan';
  }

  registerEvents();
  updateNetworkStatus();
  renderControls();
  renderGallery();

  const observer = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting) {
      fetchPosts();
    }
  }, {
    rootMargin: '600px 0px'
  });
  observer.observe(elements.loadSentinel);

  fetchPosts({ reset: true });
}

initialize();
