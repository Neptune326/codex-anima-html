import {
  PAGE_SIZE,
  SOURCES,
  createQuery,
  getSource,
  ratingName
} from './sites.js?v=2.18.0';
import {
  clampPreviewPan,
  downloadFilename,
  effectiveGalleryLayout,
  galleryViewKey,
  matchesBlockedTags,
  matchesDimension,
  matchesFavoriteSearch,
  matchesSmartCollection,
  mediaIdentity,
  nextVideoIndex,
  previewSwipeStep,
  parsePixivArtworkId,
  replaceCurrentTag,
  retryDelay,
  shouldRetryRequest,
  compatibleSourceId,
  sourceSupportsMedia,
  suggestTags,
  translateTag
} from './library.js?v=2.18.0';
import {
  exportLibrary,
  hydrateLibrary,
  importLibrary,
  loadState,
  resetState,
  saveLibrary,
  saveState
} from './storage.js?v=2.18.0';

const elements = {
  sourceList: document.querySelector('#sourceList'),
  sourceCount: document.querySelector('#sourceCount'),
  pixivButton: document.querySelector('#pixivButton'),
  pixivDialog: document.querySelector('#pixivDialog'),
  pixivForm: document.querySelector('#pixivForm'),
  pixivInput: document.querySelector('#pixivInput'),
  closePixiv: document.querySelector('#closePixiv'),
  controlSurface: document.querySelector('#controlSurface'),
  mediaTypeControl: document.querySelector('#mediaTypeControl'),
  tagInput: document.querySelector('#tagInput'),
  tagSuggestions: document.querySelector('#tagSuggestions'),
  searchHelp: document.querySelector('#searchHelp'),
  syntaxHelp: document.querySelector('#syntaxHelp'),
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
  sectionActions: document.querySelector('#sectionActions'),
  favoriteCounts: [...document.querySelectorAll('[data-favorite-count]')],
  watchCounts: [...document.querySelectorAll('[data-watch-count]')],
  resultCount: document.querySelector('#resultCount'),
  dimensionFilter: document.querySelector('#dimensionFilter'),
  layoutToggle: document.querySelector('#layoutToggle'),
  gallery: document.querySelector('#gallery'),
  galleryView: document.querySelector('#galleryView'),
  friendLinks: document.querySelector('#friendLinks'),
  loadingMore: document.querySelector('#loadingMore'),
  loadSentinel: document.querySelector('#loadSentinel'),
  collectionTools: document.querySelector('#collectionTools'),
  batchToolbar: document.querySelector('#batchToolbar'),
  selectionCount: document.querySelector('#selectionCount'),
  favoriteBatchActions: document.querySelector('#favoriteBatchActions'),
  batchFavoriteFolder: document.querySelector('#batchFavoriteFolder'),
  moveSelectedFavorites: document.querySelector('#moveSelectedFavorites'),
  batchFavoriteLabels: document.querySelector('#batchFavoriteLabels'),
  tagSelectedFavorites: document.querySelector('#tagSelectedFavorites'),
  selectVisibleButton: document.querySelector('#selectVisibleButton'),
  downloadSelectedButton: document.querySelector('#downloadSelectedButton'),
  clearSelectionButton: document.querySelector('#clearSelectionButton'),
  refreshButton: document.querySelector('#refreshButton'),
  settingsButton: document.querySelector('#settingsButton'),
  mobileSettingsButton: document.querySelector('#mobileSettingsButton'),
  mobileFilterButton: document.querySelector('#mobileFilterButton'),
  mobileFilterClose: document.querySelector('#mobileFilterClose'),
  mobileFilterScrim: document.querySelector('#mobileFilterScrim'),
  settingsDrawer: document.querySelector('#settingsDrawer'),
  themeControl: document.querySelector('#themeControl'),
  accentOptions: document.querySelector('#accentOptions'),
  proxyTemplate: document.querySelector('#proxyTemplate'),
  blockedTags: document.querySelector('#blockedTags'),
  downloadConcurrency: document.querySelector('#downloadConcurrency'),
  downloadNameTemplate: document.querySelector('#downloadNameTemplate'),
  exportButton: document.querySelector('#exportButton'),
  importButton: document.querySelector('#importButton'),
  importFile: document.querySelector('#importFile'),
  resetButton: document.querySelector('#resetButton'),
  downloadFavoritesButton: document.querySelector('#downloadFavoritesButton'),
  clearHistoryButton: document.querySelector('#clearHistoryButton'),
  savedSearchButton: document.querySelector('#savedSearchButton'),
  savedSearchDialog: document.querySelector('#savedSearchDialog'),
  closeSavedSearch: document.querySelector('#closeSavedSearch'),
  saveSearchForm: document.querySelector('#saveSearchForm'),
  savedSearchName: document.querySelector('#savedSearchName'),
  savedSearchList: document.querySelector('#savedSearchList'),
  smartCollectionForm: document.querySelector('#smartCollectionForm'),
  smartCollectionName: document.querySelector('#smartCollectionName'),
  smartCollectionTags: document.querySelector('#smartCollectionTags'),
  smartCollectionMedia: document.querySelector('#smartCollectionMedia'),
  smartCollectionList: document.querySelector('#smartCollectionList'),
  previewDialog: document.querySelector('#previewDialog'),
  previewStage: document.querySelector('#previewStage'),
  previewMedia: document.querySelector('#previewMedia'),
  previewDetails: document.querySelector('#previewDetails'),
  previewZoom: document.querySelector('#previewZoom'),
  previewRateField: document.querySelector('#previewRateField'),
  previewPlaybackRate: document.querySelector('#previewPlaybackRate'),
  previewFilmstrip: document.querySelector('#previewFilmstrip'),
  previewHelpButton: document.querySelector('#previewHelpButton'),
  previewQuickFavorite: document.querySelector('#previewQuickFavorite'),
  previewFullscreenButton: document.querySelector('#previewFullscreenButton'),
  shortcutHelp: document.querySelector('#shortcutHelp'),
  zoomOutButton: document.querySelector('#zoomOutButton'),
  zoomResetButton: document.querySelector('#zoomResetButton'),
  zoomInButton: document.querySelector('#zoomInButton'),
  closePreview: document.querySelector('#closePreview'),
  previousPreview: document.querySelector('#previousPreview'),
  nextPreview: document.querySelector('#nextPreview'),
  diagnosticDialog: document.querySelector('#diagnosticDialog'),
  diagnosticTitle: document.querySelector('#diagnosticTitle'),
  diagnosticDetails: document.querySelector('#diagnosticDetails'),
  closeDiagnostic: document.querySelector('#closeDiagnostic'),
  networkStatus: document.querySelector('#networkStatus'),
  downloadQueue: document.querySelector('#downloadQueue'),
  downloadQueueSummary: document.querySelector('#downloadQueueSummary'),
  downloadQueueList: document.querySelector('#downloadQueueList'),
  clearDownloadQueue: document.querySelector('#clearDownloadQueue'),
  resumeDownloadQueue: document.querySelector('#resumeDownloadQueue'),
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
let renderLimit = 60;
let suggestionIndex = -1;
let currentSuggestions = [];
let remoteTagCandidates = [];
let tagSuggestionTimer;
let tagSuggestionRequest;
let lazyMediaObserver;
let previewZoom = 1;
let previewPanX = 0;
let previewPanY = 0;
let previewDrag = null;
let previewGesture = null;
let lastPreviewTap = null;
let previewTransitionToken = 0;
let pendingScrollRestoreKey = '';
let scrollSaveFrame = 0;
let galleryError = '';
let loadedPopularContextKey = '';
let downloadWorkerActive = false;
let downloadSequence = 0;
const selectedDownloads = new Set();
let downloadQueue = state.downloadQueue;
const downloadControllers = new Map();
const sourceHealth = Object.fromEntries(Object.keys(SOURCES).map(sourceId => [sourceId, {
  status: 'checking',
  httpStatus: 0,
  latencyMs: 0,
  error: '',
  checkedAt: 0
}]));
const lastRequestAt = new Map();
const mediaFailures = new Map();
const RESPONSE_CACHE_PREFIX = 'atlas-gallery-response:';
const RESPONSE_CACHE_TTL_MS = 5 * 60 * 1000;
const MIN_SOURCE_REQUEST_INTERVAL_MS = 350;
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
    ratings: state.ratings,
    ...dateRange()
  });
}

function currentSource() {
  return getSource(state.source);
}

function popularContextKey() {
  return JSON.stringify([
    state.source,
    state.mediaType,
    state.period,
    state.anchorDate,
    state.tags,
    [...state.ratings].sort(),
    state.settings.blockedTags
  ]);
}

function ensureCompatibleSource() {
  const nextSourceId = compatibleSourceId(SOURCES, state.source, state.mediaType);
  const changed = nextSourceId !== state.source;
  state.source = nextSourceId;
  return changed;
}

function visiblePosts() {
  let rows;

  if (state.view === 'favorites') {
    const favorites = Object.values(state.favorites);
    const collection = state.smartCollections.find(item => item.id === state.activeSmartCollection);
    rows = collection
      ? favorites.filter(post => matchesSmartCollection(post, collection))
      : favorites;
    if (state.activeFavoriteFolder) {
      rows = rows.filter(post => state.activeFavoriteFolder === '__ungrouped'
        ? !post.favoriteFolder
        : post.favoriteFolder === state.activeFavoriteFolder);
    }
    rows = rows.filter(post => matchesFavoriteSearch(post, state.favoriteSearch));
  } else if (state.view === 'history') {
    rows = Object.values(state.history).sort((left, right) => {
      return String(right.viewedAt || '').localeCompare(String(left.viewedAt || ''));
    });
  } else if (state.view === 'playlist') {
    rows = Object.values(state.watchLater).sort((left, right) => {
      return String(right.addedAt || '').localeCompare(String(left.addedAt || ''));
    });
  } else {
    rows = posts;
  }

  return rows.filter(post => matchesDimension(post, state.dimensionFilter));
}

function favoriteKey(post) {
  return `${post.source}:${post.id}`;
}

function persist() {
  saveState(state);
}

function persistLibrary() {
  persist();
  return saveLibrary(state);
}

function openDiagnostics(title, rows) {
  elements.diagnosticTitle.textContent = title;
  elements.diagnosticDetails.innerHTML = rows.map(([label, value]) => `
    <div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value || '未知')}</dd></div>
  `).join('');
  try {
    elements.diagnosticDialog.showModal();
  } catch {
    elements.diagnosticDialog.show();
  }
}

function summarizeUrl(value) {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return String(value || '');
  }
}

function showSourceDiagnostics(sourceId) {
  const source = getSource(sourceId);
  const health = sourceHealth[sourceId];
  openDiagnostics(`${source.name} 请求诊断`, [
    ['站点', source.name],
    ['站点地址', source.home],
    ['检测状态', health.status],
    ['HTTP 状态', health.httpStatus],
    ['响应耗时', health.latencyMs ? `${health.latencyMs} ms` : '未知'],
    ['错误信息', health.error],
    ['最近检测', health.checkedAt ? new Date(health.checkedAt).toLocaleString('zh-CN') : '未知'],
    ['浏览器网络', navigator.onLine ? '在线' : '离线']
  ]);
}

function showMediaDiagnostics(post, failure = {}) {
  const source = getSource(post.source);
  openDiagnostics('媒体请求诊断', [
    ['站点', source.name],
    ['作品 ID', post.id],
    ['媒体类型', post.type],
    ['媒体地址', summarizeUrl(failure.url || post.file)],
    ['错误代码', failure.code],
    ['错误信息', failure.message],
    ['浏览器网络', navigator.onLine ? '在线' : '离线'],
    ['发生时间', failure.time ? new Date(failure.time).toLocaleString('zh-CN') : '未知']
  ]);
}

function showGalleryDiagnostics() {
  const source = currentSource();
  const health = sourceHealth[state.source];
  openDiagnostics('图库请求诊断', [
    ['站点', source.name],
    ['媒体类型', state.mediaType],
    ['热门周期', state.period],
    ['基准日期', state.anchorDate],
    ['标签', state.tags],
    ['HTTP 状态', health?.httpStatus],
    ['站点错误', health?.error],
    ['请求错误', galleryError],
    ['浏览器网络', navigator.onLine ? '在线' : '离线'],
    ['最近检测', health?.checkedAt ? new Date(health.checkedAt).toLocaleString('zh-CN') : '未知']
  ]);
}

function scrollStorageKey(key = galleryViewKey(state)) {
  return `atlas-gallery-scroll:${key}`;
}

function saveGalleryScrollPosition() {
  try {
    sessionStorage.setItem(scrollStorageKey(), String(Math.max(0, window.scrollY)));
  } catch {
    // Scroll restoration remains optional when session storage is unavailable.
  }
}

function scheduleGalleryScrollRestore() {
  pendingScrollRestoreKey = galleryViewKey(state);
}

function restoreGalleryScrollPosition() {
  if (!pendingScrollRestoreKey) {
    return;
  }

  const key = pendingScrollRestoreKey;
  pendingScrollRestoreKey = '';
  let top = 0;
  try {
    top = Math.max(0, Number(sessionStorage.getItem(scrollStorageKey(key))) || 0);
  } catch {
    // Fall back to the top of the page.
  }
  requestAnimationFrame(() => window.scrollTo({ top, behavior: 'auto' }));
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    elements.toast.classList.remove('is-visible');
  }, 2200);
}

function renderSources() {
  const visibleSources = Object.entries(SOURCES).filter(([, source]) => {
    return sourceSupportsMedia(source, state.mediaType);
  });

  const mediaName = state.mediaType === 'video' ? '视频' : '图片';
  elements.sourceCount.textContent = `${visibleSources.length} 个${mediaName}站点`;
  elements.sourceList.innerHTML = visibleSources.map(([sourceId, source]) => {
    const health = sourceHealth[sourceId];
    const healthTitle = health.status === 'online'
      ? `在线 · ${health.latencyMs} ms · HTTP ${health.httpStatus}`
      : health.status === 'error'
        ? `不可用${health.httpStatus ? ` · HTTP ${health.httpStatus}` : ''}${health.error ? ` · ${health.error}` : ''}`
        : '正在检测站点状态';

    return `
    <button
      class="source-chip ${sourceId === state.source ? 'is-selected' : ''}"
      type="button"
      data-source="${sourceId}"
      title="${escapeHtml(`${source.description} · ${healthTitle}`)}"
      role="radio"
      aria-checked="${sourceId === state.source}"
    >
      <span class="source-health is-${health.status}" aria-hidden="true"></span>
      <span class="source-monogram" aria-hidden="true">${escapeHtml(source.shortName.slice(0, 1).toUpperCase())}</span>
      <span class="source-name">${escapeHtml(source.shortName)}</span>
      ${health.status === 'online' ? `<span class="source-latency">${health.latencyMs} ms</span>` : ''}
      <span class="source-capability" title="支持${mediaName}">
        ${icon(state.mediaType)}
      </span>
    </button>
    ${health.status === 'error' ? `
      <button class="source-chip source-retry-chip" type="button" data-retry-source="${sourceId}" title="重试站点请求">
        ${icon('retry')}重试
      </button>
      <button class="source-chip source-diagnostic-chip" type="button" data-source-diagnostics="${sourceId}" title="查看站点请求诊断">
        ${icon('help')}详情
      </button>
    ` : ''}
  `;
  }).join('');
}

function renderRecentSearches() {
  const searches = state.recentSearches.filter(Boolean).slice(0, 6);
  elements.recentSearches.hidden = searches.length === 0 || state.view !== 'popular';
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

function renderSmartCollections() {
  elements.smartCollectionList.innerHTML = state.smartCollections.length
    ? state.smartCollections.map(collection => `
      <article class="saved-search-item">
        <div class="saved-search-copy">
          <strong>${escapeHtml(collection.name)}</strong>
          <small>${escapeHtml(collection.tags || '全部标签')} · ${collection.mediaType === 'all' ? '全部媒体' : collection.mediaType === 'video' ? '视频' : '图片'}</small>
        </div>
        <button class="text-button" type="button" data-apply-collection="${escapeHtml(collection.id)}">查看</button>
        <button class="more-button" type="button" data-delete-collection="${escapeHtml(collection.id)}" title="删除智能收藏夹">
          ${icon('delete')}
        </button>
      </article>
    `).join('')
    : '<p class="compact-note">还没有智能收藏夹。</p>';
}

function renderCollectionTools() {
  const inFavorites = state.view === 'favorites';
  elements.collectionTools.hidden = !inFavorites;

  if (!inFavorites) {
    return;
  }

  const folders = state.favoriteFolders.map(folder => `
    <button
      class="filter-chip ${state.activeFavoriteFolder === folder ? 'is-selected' : ''}"
      type="button"
      data-favorite-folder="${escapeHtml(folder)}"
    >${escapeHtml(folder)}</button>
  `).join('');

  const collections = state.smartCollections.map(collection => `
    <button
      class="filter-chip ${state.activeSmartCollection === collection.id ? 'is-selected' : ''}"
      type="button"
      data-smart-collection="${escapeHtml(collection.id)}"
    >${escapeHtml(collection.name)}</button>
  `).join('');

  elements.collectionTools.innerHTML = `
    <div class="favorite-collection-tools">
      <label class="favorite-search-field">
        <input id="favoriteSearchInput" type="search" value="${escapeHtml(state.favoriteSearch)}" placeholder="搜索收藏的标签、备注、来源或 ID" aria-label="搜索收藏">
      </label>
      <strong>收藏分组</strong>
      <button class="filter-chip ${!state.activeFavoriteFolder ? 'is-selected' : ''}" type="button" data-favorite-folder="">全部</button>
      <button class="filter-chip ${state.activeFavoriteFolder === '__ungrouped' ? 'is-selected' : ''}" type="button" data-favorite-folder="__ungrouped">未分组</button>
      ${folders}
      <button class="text-button" type="button" data-create-favorite-folder>新建分组</button>
    </div>
    <strong>智能收藏夹</strong>
    <button class="filter-chip ${state.activeSmartCollection ? '' : 'is-selected'}" type="button" data-smart-collection="">全部</button>
    ${collections}
    <button class="text-button" type="button" data-open-smart-collections>管理</button>
    <button class="outlined-button" type="button" data-download-view>
      ${icon('download')}下载当前收藏
    </button>
  `;
}

function dynamicTagCandidates() {
  return [
    ...posts.flatMap(post => post.tags || []),
    ...Object.values(state.favorites).flatMap(post => post.tags || []),
    ...state.recentSearches
  ];
}

function renderTagSuggestions() {
  currentSuggestions = suggestTags(
    elements.tagInput.value,
    [...remoteTagCandidates, ...dynamicTagCandidates()]
  );
  suggestionIndex = Math.min(suggestionIndex, currentSuggestions.length - 1);
  elements.tagSuggestions.hidden = currentSuggestions.length === 0;
  elements.tagSuggestions.innerHTML = currentSuggestions.map((suggestion, index) => `
    <button
      class="tag-suggestion ${index === suggestionIndex ? 'is-active' : ''}"
      type="button"
      role="option"
      aria-selected="${index === suggestionIndex}"
      data-tag-suggestion="${escapeHtml(suggestion.tag)}"
    >
      <span>${escapeHtml(suggestion.tag)}</span>
      <small>${escapeHtml(suggestion.translation || '站点标签')}</small>
    </button>
  `).join('');
}

function currentTagQuery() {
  return (elements.tagInput.value.split(/\s+/).pop() || '').replace(/^-/, '').trim();
}

async function fetchRemoteTagSuggestions() {
  const query = currentTagQuery();
  const source = currentSource();
  tagSuggestionRequest?.abort();
  remoteTagCandidates = [];

  if (query.length < 2 || !source.buildTagUrl || !source.parseTags) {
    renderTagSuggestions();
    return;
  }

  const controller = new AbortController();
  tagSuggestionRequest = controller;

  try {
    const payload = await requestWithRetry(source.buildTagUrl(query).href, controller.signal);
    if (controller !== tagSuggestionRequest || query !== currentTagQuery()) {
      return;
    }
    remoteTagCandidates = source.parseTags(payload);
    renderTagSuggestions();
  } catch (error) {
    if (error.name !== 'AbortError') {
      renderTagSuggestions();
    }
  }
}

function scheduleTagSuggestions() {
  clearTimeout(tagSuggestionTimer);
  renderTagSuggestions();
  tagSuggestionTimer = setTimeout(fetchRemoteTagSuggestions, 250);
}

function applyTagSuggestion(tag) {
  elements.tagInput.value = replaceCurrentTag(elements.tagInput.value, tag);
  elements.tagSuggestions.hidden = true;
  suggestionIndex = -1;
  elements.tagInput.focus();
}

function renderControls() {
  const galleryLayout = effectiveGalleryLayout(state.mediaType, state.settings.galleryLayout);
  document.documentElement.dataset.theme = state.settings.theme;
  document.documentElement.dataset.accent = state.settings.accent;
  document.documentElement.dataset.compact = String(state.settings.compactGrid);
  elements.gallery.dataset.layout = galleryLayout;
  elements.layoutToggle.hidden = state.mediaType !== 'image';

  document.querySelectorAll('[data-view]').forEach(button => {
    const active = button.dataset.view === state.view;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', String(active));
  });
  document.querySelectorAll('[data-media-type]').forEach(button => {
    const active = button.dataset.mediaType === state.mediaType;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  document.querySelectorAll('[data-rating]').forEach(button => {
    const selected = state.ratings.includes(button.dataset.rating);
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  document.querySelectorAll('[data-period]').forEach(button => {
    const selected = button.dataset.period === state.period;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  document.querySelectorAll('[data-theme-value]').forEach(button => {
    const active = button.dataset.themeValue === state.settings.theme;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  document.querySelectorAll('[data-accent-value]').forEach(button => {
    const selected = button.dataset.accentValue === state.settings.accent;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  document.querySelectorAll('[data-layout]').forEach(button => {
    const active = button.dataset.layout === galleryLayout;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  document.querySelectorAll('[data-setting]').forEach(input => {
    input.checked = Boolean(state.settings[input.dataset.setting]);
  });

  const source = currentSource();
  const supportsDate = source.capabilities.date;
  const supportsVideo = source.capabilities.video;
  elements.controlSurface.hidden = state.view !== 'popular';
  elements.mobileFilterButton.hidden = state.view !== 'popular';
  const linksView = state.view === 'links';
  const auxiliaryView = linksView || state.view === 'playlist';
  elements.galleryView.hidden = linksView;
  elements.friendLinks.hidden = !linksView;
  elements.sectionActions.hidden = auxiliaryView;
  elements.refreshButton.hidden = auxiliaryView;
  if (state.view !== 'popular') {
    closeMobileFilters();
  }
  elements.pixivButton.hidden = state.mediaType !== 'image';
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
  elements.blockedTags.value = state.settings.blockedTags;
  elements.downloadConcurrency.value = state.settings.downloadConcurrency;
  elements.downloadNameTemplate.value = state.settings.downloadNameTemplate;
  elements.dimensionFilter.value = state.dimensionFilter;
  elements.favoriteCounts.forEach(element => {
    element.textContent = Object.keys(state.favorites).length;
  });
  elements.watchCounts.forEach(element => {
    element.textContent = Object.keys(state.watchLater).length;
  });

  renderSources();
  renderRecentSearches();
  renderCollectionTools();
  persist();
}

function createRipple(event, button) {
  if (button.disabled) {
    return;
  }

  const bounds = button.getBoundingClientRect();
  const size = Math.max(bounds.width, bounds.height) * 1.6;
  const ripple = document.createElement('span');
  const x = event.clientX || bounds.left + bounds.width / 2;
  const y = event.clientY || bounds.top + bounds.height / 2;

  ripple.className = 'material-ripple';
  ripple.style.width = `${size}px`;
  ripple.style.height = `${size}px`;
  ripple.style.left = `${x - bounds.left - size / 2}px`;
  ripple.style.top = `${y - bounds.top - size / 2}px`;
  button.append(ripple);
  ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
}

function renderHeader() {
  if (state.view === 'links') {
    elements.sectionTitle.textContent = '友情链接';
    elements.sectionSubtitle.textContent = '直接访问推荐的插画与动画站点';
    elements.sectionIconUse.setAttribute('href', '#icon-external');
    return;
  }

  if (state.view === 'favorites') {
    elements.sectionTitle.textContent = '我的收藏';
    elements.sectionSubtitle.textContent = '收藏已持久化保存，可筛选并批量下载';
    elements.sectionIconUse.setAttribute('href', '#icon-favorite');
    return;
  }

  if (state.view === 'history') {
    elements.sectionTitle.textContent = '浏览历史';
    elements.sectionSubtitle.textContent = '保留最近 200 个打开过的媒体项目';
    elements.sectionIconUse.setAttribute('href', '#icon-history');
    return;
  }

  if (state.view === 'playlist') {
    elements.sectionTitle.textContent = '稍后观看';
    elements.sectionSubtitle.textContent = '保存想看的图片与视频，视频会保留播放进度';
    elements.sectionIconUse.setAttribute('href', '#icon-bookmark');
    return;
  }

  elements.sectionTitle.textContent = '热门图库';
  elements.sectionSubtitle.textContent = `${currentSource().name} · ${state.mediaType === 'video' ? '视频' : '图片'}内容`;
  elements.sectionIconUse.setAttribute('href', '#icon-fire');
}

function statePanel({ title, description, iconName, action = '' }) {
  return `
    <div class="empty-state" role="status">
      <div class="empty-state-content">
        <div class="empty-state-icon">${icon(iconName)}</div>
        <h2>${escapeHtml(title)}</h2>
        <p>${escapeHtml(description)}</p>
        ${action}
      </div>
    </div>
  `;
}

function emptyState() {
  if (galleryError) {
    return statePanel({
      title: '内容加载失败',
      description: galleryError,
      iconName: 'retry',
      action: '<div class="state-actions"><button class="filled-button" type="button" data-retry-gallery>重新加载</button><button class="outlined-button" type="button" data-gallery-diagnostics>诊断详情</button></div>'
    });
  }

  const favoritesView = state.view === 'favorites';
  const historyView = state.view === 'history';
  const playlistView = state.view === 'playlist';
  const title = favoritesView
    ? '还没有收藏内容'
    : historyView ? '还没有浏览历史' : playlistView ? '稍后观看列表为空' : '没有找到可展示的内容';
  const description = favoritesView
    ? '浏览图库并点击心形按钮，即可在这里集中查看。'
    : historyView ? '打开图片或视频预览后，会在这里留下记录。'
      : playlistView ? '在媒体卡片或预览窗口点击书签，即可加入稍后观看。'
        : '调整标签、媒体类型或内容分级后重试。';
  const iconName = favoritesView ? 'favorite' : historyView ? 'history' : playlistView ? 'bookmark' : state.mediaType;

  return statePanel({ title, description, iconName });
}

function renderSkeletons() {
  elements.gallery.innerHTML = Array.from({ length: 10 }, () => '<div class="skeleton"></div>').join('');
}

function postCard(post, index) {
  const isFavorite = Boolean(state.favorites[favoriteKey(post)]);
  const isWatchLater = Boolean(state.watchLater[favoriteKey(post)]);
  const isSensitive = state.settings.blurSensitive && post.rating !== 'safe';
  const preview = post.preview || post.sample || post.file;
  const previewUrl = buildMediaUrl(preview);
  const mediaName = post.type === 'video' ? '视频' : '图片';
  const hasNotes = Boolean(post.favoriteNote || post.favoriteLabels?.length);
  const folderName = post.favoriteFolder && state.view === 'favorites' ? post.favoriteFolder : '';
  const width = Number(post.width) || 4;
  const height = Number(post.height) || 3;
  const aspectRatio = Math.min(3, Math.max(0.4, width / height));
  const videoThumbnail = post.type === 'video' && /\.(?:mp4|webm)(?:[?#]|$)/i.test(preview);
  const mediaElement = videoThumbnail
    ? `<video data-src="${escapeHtml(previewUrl)}" muted loop playsinline preload="none" aria-label="${escapeHtml(post.tags?.slice(0, 6).join(', ') || `帖子 ${post.id}`)}"></video>`
    : `<img
          data-src="${escapeHtml(previewUrl)}"
          alt="${escapeHtml(post.tags?.slice(0, 6).join(', ') || `帖子 ${post.id}`)}"
          loading="lazy"
          decoding="async"
        >`;

  return `
    <article
      class="media-card ${isSensitive ? 'is-sensitive' : ''}"
      data-post-key="${escapeHtml(favoriteKey(post))}"
      style="--media-aspect: ${aspectRatio}"
    >
      <label class="select-media" title="选择此媒体">
        <input type="checkbox" data-select-download="${index}" ${selectedDownloads.has(favoriteKey(post)) ? 'checked' : ''}>
      </label>
      <button class="media-button" type="button" data-open-preview="${index}" aria-label="预览帖子 ${escapeHtml(post.id)}">
        ${mediaElement}
        <span class="media-error-state" hidden>${icon('retry')}<span>媒体加载失败</span></span>
        <span class="media-badge">${icon(post.type)}${mediaName}</span>
        <span class="rating-badge">${ratingName(post.rating)}</span>
        ${hasNotes ? `<span class="note-badge" title="包含收藏备注">${icon('bookmark')}</span>` : ''}
        ${folderName ? `<span class="folder-badge" title="收藏分组">${escapeHtml(folderName)}</span>` : ''}
       </button>
       <button class="media-diagnostic-button" type="button" data-media-diagnostics="${index}" hidden>诊断详情</button>
       <footer class="card-footer">
        <span class="score">▲ ${Number(post.score) || 0}</span>
        <span class="dimensions">${Number(post.width) || 0} × ${Number(post.height) || 0}</span>
        <button
          class="watch-button ${isWatchLater ? 'is-active' : ''}"
          type="button"
          data-toggle-watch-later="${index}"
          title="${isWatchLater ? '移出稍后观看' : '加入稍后观看'}"
        >${icon('bookmark')}</button>
        <button class="download-button" type="button" data-download-post="${index}" title="下载媒体">
          ${icon('download')}
        </button>
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

function observeLazyMedia() {
  lazyMediaObserver?.disconnect();
  lazyMediaObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) {
        return;
      }

      const media = entry.target;
      const loadedEvent = media instanceof HTMLVideoElement ? 'loadeddata' : 'load';
      media.addEventListener(loadedEvent, () => media.classList.add('is-loaded'), { once: true });
      media.addEventListener('error', () => {
        media.classList.add('is-loaded', 'has-error');
        const card = media.closest('.media-card');
        const errorState = media.closest('.media-button')?.querySelector('.media-error-state');
        if (errorState) {
          errorState.hidden = false;
        }
        if (card) {
          mediaFailures.set(card.dataset.postKey, {
            url: media.currentSrc || media.src || media.dataset.src,
            code: media instanceof HTMLVideoElement ? media.error?.code : '',
            message: media instanceof HTMLVideoElement ? media.error?.message : '媒体加载失败',
            time: Date.now()
          });
          const diagnosticButton = card.querySelector('.media-diagnostic-button');
          if (diagnosticButton) {
            diagnosticButton.hidden = false;
          }
        }
      }, { once: true });
      media.src = media.dataset.src;
      media.removeAttribute('data-src');
      if (media instanceof HTMLVideoElement) {
        media.load();
      }
      lazyMediaObserver.unobserve(media);
    });
  }, { rootMargin: '600px 0px' });

  elements.gallery.querySelectorAll('[data-src]').forEach(media => lazyMediaObserver.observe(media));
}

function retryGalleryMedia(button) {
  const card = button.closest('.media-card');
  const media = button.querySelector('img, video');
  if (!card || !media) {
    return;
  }

  const url = media.currentSrc || media.src || media.dataset.src;
  if (!url) {
    return;
  }

  media.classList.remove('is-loaded', 'has-error');
  const errorState = button.querySelector('.media-error-state');
  if (errorState) {
    errorState.hidden = true;
  }
  const diagnosticButton = card.querySelector('.media-diagnostic-button');
  if (diagnosticButton) {
    diagnosticButton.hidden = true;
  }
  mediaFailures.delete(card.dataset.postKey);

  const loadedEvent = media instanceof HTMLVideoElement ? 'loadeddata' : 'load';
  media.addEventListener(loadedEvent, () => media.classList.add('is-loaded'), { once: true });
  media.addEventListener('error', () => {
    media.classList.add('is-loaded', 'has-error');
    if (errorState) {
      errorState.hidden = false;
    }
    if (diagnosticButton) {
      diagnosticButton.hidden = false;
    }
    mediaFailures.set(card.dataset.postKey, {
      url,
      code: media instanceof HTMLVideoElement ? media.error?.code : '',
      message: media instanceof HTMLVideoElement ? media.error?.message : '媒体加载失败',
      time: Date.now()
    });
  }, { once: true });
  media.removeAttribute('src');
  media.src = url;
  if (media instanceof HTMLVideoElement) {
    media.load();
  }
}

function renderBatchToolbar() {
  elements.batchToolbar.hidden = selectedDownloads.size === 0;
  elements.selectionCount.textContent = `已选择 ${selectedDownloads.size} 项`;
  elements.downloadSelectedButton.disabled = selectedDownloads.size === 0;
  const favoritesSelected = state.view === 'favorites' && selectedDownloads.size > 0;
  elements.favoriteBatchActions.hidden = !favoritesSelected;
  if (favoritesSelected) {
    elements.batchFavoriteFolder.innerHTML = [
      '<option value="__ungrouped">未分组</option>',
      ...state.favoriteFolders.map(folder => `<option value="${escapeHtml(folder)}">${escapeHtml(folder)}</option>`)
    ].join('');
  }
}

function renderGallery({ append = false, preserveCollectionTools = false } = {}) {
  if (state.view === 'links') {
    renderHeader();
    restoreGalleryScrollPosition();
    return;
  }

  const rows = visiblePosts();
  const renderedRows = rows.slice(0, renderLimit);
  elements.gallery.querySelector('.gallery-load-error')?.remove();
  const existingCards = [...elements.gallery.querySelectorAll('.media-card')];
  const loadingError = galleryError && renderedRows.length
    ? `<div class="gallery-load-error">${statePanel({
        title: '后续内容加载失败',
        description: galleryError,
        iconName: 'retry',
        action: '<div class="state-actions"><button class="filled-button" type="button" data-retry-gallery>重新加载</button><button class="outlined-button" type="button" data-gallery-diagnostics>诊断详情</button></div>'
      })}</div>`
    : '';
  const canAppend = append
    && existingCards.length > 0
    && existingCards.length <= renderedRows.length
    && (existingCards.length < renderedRows.length || Boolean(loadingError))
    && existingCards.every((card, index) => {
      return card.dataset.postKey === favoriteKey(renderedRows[index]);
    });

  renderHeader();
  elements.resultCount.textContent = `${rows.length} 项`;
  elements.favoriteCounts.forEach(element => {
    element.textContent = Object.keys(state.favorites).length;
  });

  if (canAppend) {
    elements.gallery.insertAdjacentHTML(
      'beforeend',
      renderedRows.slice(existingCards.length).map((post, index) => {
        return postCard(post, existingCards.length + index);
      }).join('')
    );
    if (loadingError) {
      elements.gallery.insertAdjacentHTML('beforeend', loadingError);
    }
  } else {
    elements.gallery.innerHTML = renderedRows.length
      ? renderedRows.map(postCard).join('') + loadingError
      : emptyState();
  }

  observeLazyMedia();
  if (!preserveCollectionTools) {
    renderCollectionTools();
  }
  renderBatchToolbar();
  restoreGalleryScrollPosition();
}

function buildRequestUrl(upstreamUrl) {
  const template = state.settings.proxyTemplate.trim();

  if (template && template.includes('{url}')) {
    return template.replace('{url}', encodeURIComponent(upstreamUrl));
  }

  return `/api/proxy?url=${encodeURIComponent(upstreamUrl)}`;
}

function buildMediaUrl(upstreamUrl) {
  return upstreamUrl ? `/api/media?url=${encodeURIComponent(upstreamUrl)}` : '';
}

function readResponseCache(upstreamUrl, allowExpired = false) {
  try {
    const cached = JSON.parse(sessionStorage.getItem(`${RESPONSE_CACHE_PREFIX}${upstreamUrl}`));
    if (!cached || !allowExpired && Date.now() - cached.savedAt > RESPONSE_CACHE_TTL_MS) {
      return null;
    }
    return cached.payload;
  } catch {
    return null;
  }
}

function writeResponseCache(upstreamUrl, payload) {
  try {
    sessionStorage.setItem(`${RESPONSE_CACHE_PREFIX}${upstreamUrl}`, JSON.stringify({
      savedAt: Date.now(),
      payload
    }));
  } catch {
    // Browsing still works when session storage is full or unavailable.
  }
}

async function requestJson(upstreamUrl, signal, force = false) {
  if (!force) {
    const cached = readResponseCache(upstreamUrl);
    if (cached) {
      return cached;
    }
  }

  const hostname = new URL(upstreamUrl).hostname;
  const elapsed = Date.now() - (lastRequestAt.get(hostname) || 0);
  if (elapsed < MIN_SOURCE_REQUEST_INTERVAL_MS) {
    await wait(MIN_SOURCE_REQUEST_INTERVAL_MS - elapsed, signal);
  }
  lastRequestAt.set(hostname, Date.now());

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

    const error = new Error(detail || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }

  const payload = await response.json();
  writeResponseCache(upstreamUrl, payload);
  return payload;
}

function wait(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException('请求已取消', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      resolve();
    }, milliseconds);
    signal?.addEventListener('abort', abort, { once: true });
  });
}

async function requestWithRetry(upstreamUrl, signal, force = false) {
  let firstError;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await requestJson(upstreamUrl, signal, force);
    } catch (error) {
      if (error.name === 'AbortError') {
        throw error;
      }

      firstError ||= error;
      if (attempt >= 2 || !shouldRetryRequest(error.status)) {
        break;
      }
      await wait(retryDelay(attempt + 1), signal);
    }
  }

  const staleCache = readResponseCache(upstreamUrl, true);
  if (staleCache) {
    showToast('网络请求失败，已显示缓存结果');
    return staleCache;
  }
  throw firstError;
}

function filterPosts(rows) {
  return rows.filter(post => {
    return post.preview
      && post.file
      && post.type === state.mediaType
      && state.ratings.includes(post.rating)
      && !matchesBlockedTags(post, state.settings.blockedTags);
  });
}

function mergeUniquePosts(rows, preserveOrder = false) {
  const unique = new Map();
  [...posts, ...rows].forEach(post => {
    const identity = mediaIdentity(post) || favoriteKey(post);
    const previous = unique.get(identity);
    if (!previous || Number(post.score) > Number(previous.score)) {
      unique.set(identity, post);
    }
  });
  const merged = [...unique.values()];
  return preserveOrder ? merged : merged.sort((left, right) => right.score - left.score);
}

async function fetchPosts({ reset = false, force = false } = {}) {
  if (state.view !== 'popular' || isLoading && !reset || !hasMore && !reset) {
    return;
  }

  if (reset) {
    activeRequest?.abort();
    posts = [];
    renderLimit = 60;
    galleryError = '';
    selectedDownloads.clear();
    currentPage = 1;
    hasMore = true;
    renderHeader();
    elements.resultCount.textContent = '加载中';
    renderSkeletons();
  }

  const sequence = ++requestSequence;
  const controller = new AbortController();
  activeRequest = controller;
  isLoading = true;
  elements.loadingMore.hidden = reset;
  elements.refreshButton.disabled = true;

  try {
    let rawPosts = [];
    let filteredPosts = [];
    const source = currentSource();
    const upstreamUrl = source.buildUrl(currentQuery()).href;
    const payload = await requestWithRetry(upstreamUrl, controller.signal, force);
    rawPosts = source.parse(payload);

    if (sequence !== requestSequence) {
      return;
    }

    filteredPosts = filterPosts(rawPosts);
    posts = mergeUniquePosts(filteredPosts, !reset);
    loadedPopularContextKey = popularContextKey();
    hasMore = rawPosts.length >= PAGE_SIZE;
    currentPage += 1;
    galleryError = '';
    renderGallery({ append: !reset });
  } catch (error) {
    if (error.name === 'AbortError' || sequence !== requestSequence) {
      return;
    }

    galleryError = `${currentSource().name} 请求失败：${error.message}`;
    hasMore = false;
    renderGallery({ append: !reset });
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
  saveGalleryScrollPosition();
  state.tags = elements.tagInput.value.trim();
  scheduleGalleryScrollRestore();
  addRecentSearch(state.tags);
  renderControls();
  fetchPosts({ reset: true });
  closeMobileFilters();
}

function changeSource(sourceId) {
  if (!sourceSupportsMedia(SOURCES[sourceId], state.mediaType)) {
    return;
  }

  tagSuggestionRequest?.abort();
  remoteTagCandidates = [];
  saveGalleryScrollPosition();
  state.source = sourceId;
  scheduleGalleryScrollRestore();
  renderControls();
  fetchPosts({ reset: true });
}

function changeMediaType(mediaType) {
  if (mediaType === state.mediaType) {
    return;
  }

  const previousSource = state.source;
  saveGalleryScrollPosition();
  state.mediaType = mediaType;
  ensureCompatibleSource();
  scheduleGalleryScrollRestore();
  tagSuggestionRequest?.abort();
  remoteTagCandidates = [];

  if (previousSource !== state.source) {
    showToast(`已切换到支持${mediaType === 'video' ? '视频' : '图片'}的 ${currentSource().name}`);
  }

  renderControls();
  fetchPosts({ reset: true });
}

function openPixivArtwork(value) {
  const artworkId = parsePixivArtworkId(value);

  if (!artworkId) {
    showToast('请输入有效的 Pixiv 作品 ID 或作品链接');
    elements.pixivInput.focus();
    return;
  }

  window.open(
    `https://www.pixiv.net/artworks/${artworkId}`,
    '_blank',
    'noopener,noreferrer'
  );
  elements.pixivDialog.close();
  elements.pixivForm.reset();
}

function updatePreviewFavoriteControls(post) {
  if (!post) {
    return;
  }

  const isFavorite = Boolean(state.favorites[favoriteKey(post)]);
  const quickButton = elements.previewQuickFavorite;
  quickButton.classList.toggle('is-active', isFavorite);
  quickButton.title = isFavorite ? '取消收藏' : '收藏';
  quickButton.setAttribute('aria-label', quickButton.title);
  quickButton.setAttribute('aria-pressed', String(isFavorite));

  const detailButton = document.querySelector('#previewFavorite');
  if (detailButton) {
    detailButton.classList.toggle('is-active', isFavorite);
    detailButton.setAttribute('aria-pressed', String(isFavorite));
    detailButton.innerHTML = `${icon('favorite')}${isFavorite ? '取消收藏' : '收藏'}`;
  }

  const metadata = document.querySelector('.favorite-metadata');
  metadata?.classList.toggle('is-disabled', !isFavorite);
  metadata?.querySelectorAll('input, textarea, button').forEach(control => {
    control.disabled = !isFavorite;
  });
}

async function toggleFavorite(post) {
  if (!post) {
    return;
  }

  saveVideoProgress(post, elements.previewMedia.querySelector('video'), true);
  const key = favoriteKey(post);
  if (state.favorites[key]) {
    delete state.favorites[key];
    showToast('已取消收藏');
  } else {
    const duplicate = Object.entries(state.favorites).find(([favoriteId, favorite]) => {
      return favoriteId !== key && mediaIdentity(favorite) === mediaIdentity(post);
    });
    state.favorites[key] = post;
    showToast(duplicate ? `已收藏，与 ${duplicate[0]} 使用相同文件` : '已添加到收藏');
  }

  await persistLibrary();
  renderGallery();
  if (elements.previewDialog.open) {
    updatePreviewFavoriteControls(post);
  }
}

function selectedFavoritePosts() {
  return [...selectedDownloads]
    .map(key => state.favorites[key])
    .filter(Boolean);
}

async function moveSelectedFavorites() {
  const folder = elements.batchFavoriteFolder.value === '__ungrouped'
    ? ''
    : elements.batchFavoriteFolder.value;
  const selected = selectedFavoritePosts();
  if (!selected.length) {
    return;
  }

  selected.forEach(post => {
    post.favoriteFolder = folder;
  });
  await persistLibrary();
  selectedDownloads.clear();
  renderGallery();
  showToast(folder ? `已移动 ${selected.length} 项到「${folder}」` : `已移出分组，共 ${selected.length} 项`);
}

async function tagSelectedFavorites() {
  const labels = elements.batchFavoriteLabels.value
    .split(/[,，\n/]+/)
    .map(label => label.trim())
    .filter(Boolean)
    .slice(0, 12);
  const selected = selectedFavoritePosts();
  if (!selected.length || !labels.length) {
    showToast('请输入至少一个收藏标签');
    return;
  }

  selected.forEach(post => {
    post.favoriteLabels = [...new Set([...(post.favoriteLabels || []), ...labels])].slice(0, 12);
  });
  await persistLibrary();
  elements.batchFavoriteLabels.value = '';
  selectedDownloads.clear();
  renderGallery();
  showToast(`已为 ${selected.length} 项添加标签`);
}

async function startPreviewVideo(video, force = false) {
  if (!video || (!state.settings.autoplay && !force)) {
    return;
  }

  try {
    await video.play();
  } catch (error) {
    if (error?.name !== 'NotAllowedError' || video.muted) {
      return;
    }

    video.muted = true;
    try {
      await video.play();
    } catch {
      // The browser can still reject playback until the user taps the player.
    }
  }
}

function toggleWatchLater(post) {
  if (!post) {
    return;
  }

  const key = favoriteKey(post);
  if (state.watchLater[key]) {
    delete state.watchLater[key];
    showToast('已移出稍后观看');
  } else {
    state.watchLater[key] = {
      ...post,
      addedAt: new Date().toISOString()
    };
    showToast('已加入稍后观看');
  }
  persist();
  renderControls();
  renderGallery();
  if (elements.previewDialog.open) {
    renderPreview();
  }
}

async function recordHistory(post) {
  const key = favoriteKey(post);
  const entries = Object.entries({
    ...state.history,
    [key]: {
      ...post,
      viewedAt: new Date().toISOString()
    }
  }).sort(([, left], [, right]) => {
    return String(right.viewedAt || '').localeCompare(String(left.viewedAt || ''));
  }).slice(0, 200);

  state.history = Object.fromEntries(entries);
  await persistLibrary();
}

async function downloadPost(post, { quiet = false, signal, filename } = {}) {
  const resolvedFilename = filename || downloadFilename(post, state.settings.downloadNameTemplate);
  const url = `/api/download?url=${encodeURIComponent(post.file)}&filename=${encodeURIComponent(resolvedFilename)}`;
  const response = await fetch(url, { credentials: 'same-origin', signal });

  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      message = (await response.json()).error || message;
    } catch {
      // Keep the HTTP status fallback.
    }
    throw new Error(message);
  }

  const blobUrl = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = resolvedFilename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);

  if (!quiet) {
    showToast(`已下载 ${resolvedFilename}`);
  }
}

function renderDownloadQueue() {
  const activeItems = downloadQueue.filter(item => ['pending', 'running'].includes(item.status));
  const pausedItems = downloadQueue.filter(item => ['paused', 'error'].includes(item.status));
  const completed = downloadQueue.filter(item => item.status === 'done').length;
  elements.downloadQueue.hidden = downloadQueue.length === 0;
  elements.downloadQueueSummary.textContent = `${activeItems.length} 进行中 · ${pausedItems.length} 待恢复 · ${completed} 已完成`;
  elements.resumeDownloadQueue.disabled = pausedItems.length === 0;
  elements.downloadQueueList.innerHTML = downloadQueue.map(item => {
    const statusText = {
      pending: '等待中',
      running: '下载中',
      done: '已完成',
      error: '失败',
      paused: '已暂停',
      cancelled: '已取消'
    }[item.status];
    const action = ['error', 'paused'].includes(item.status)
      ? `<button class="mini-icon-button" type="button" data-retry-download="${item.id}" title="重试">${icon('retry')}</button>`
      : ['pending', 'running'].includes(item.status)
        ? `<button class="mini-icon-button" type="button" data-cancel-download="${item.id}" title="取消">${icon('close')}</button>`
        : '';

    return `
      <article class="download-item is-${item.status}">
        <img src="${escapeHtml(buildMediaUrl(item.post.preview || item.post.sample || ''))}" alt="" loading="lazy">
        <div>
          <strong>${escapeHtml(item.filename)}</strong>
          <small>${statusText}${item.error ? ` · ${escapeHtml(item.error)}` : ''}</small>
        </div>
        ${action}
      </article>
    `;
  }).join('');
  persistDownloadQueue();
}

function persistDownloadQueue() {
  state.downloadQueue = downloadQueue.slice(-100).map(item => ({
    id: item.id,
    post: item.post,
    filename: item.filename,
    status: item.status,
    error: item.error
  }));
  persist();
}

async function runDownloadItem(item) {
  const controller = new AbortController();
  downloadControllers.set(item.id, controller);
  item.status = 'running';
  item.error = '';
  renderDownloadQueue();

  try {
    await downloadPost(item.post, {
      quiet: true,
      signal: controller.signal,
      filename: item.filename
    });
    item.status = 'done';
  } catch (error) {
    item.status = error.name === 'AbortError' ? 'cancelled' : 'error';
    item.error = error.name === 'AbortError' ? '' : error.message;
  } finally {
    downloadControllers.delete(item.id);
    renderDownloadQueue();
  }
}

async function processDownloadQueue() {
  if (downloadWorkerActive) {
    return;
  }

  downloadWorkerActive = true;
  while (downloadQueue.some(item => item.status === 'pending')) {
    const batch = downloadQueue
      .filter(item => item.status === 'pending')
      .slice(0, state.settings.downloadConcurrency);
    await Promise.all(batch.map(runDownloadItem));
  }
  downloadWorkerActive = false;
}

function downloadPosts(rows) {
  const uniqueRows = [...new Map(rows.filter(post => post?.file).map(post => [favoriteKey(post), post])).values()];
  if (!uniqueRows.length) {
    showToast('没有可下载的媒体');
    return;
  }

  uniqueRows.forEach(post => {
    const existing = downloadQueue.find(item => {
      return favoriteKey(item.post) === favoriteKey(post)
        && ['pending', 'running'].includes(item.status);
    });
    if (!existing) {
      downloadQueue.push({
        id: String(++downloadSequence),
        post,
        filename: downloadFilename(post, state.settings.downloadNameTemplate),
        status: 'pending',
        error: ''
      });
    }
  });
  renderDownloadQueue();
  processDownloadQueue();
  showToast(`已加入下载队列，共 ${uniqueRows.length} 项`);
}

function selectedPosts() {
  const allPosts = new Map([
    ...posts,
    ...Object.values(state.favorites),
    ...Object.values(state.history)
  ].map(post => [favoriteKey(post), post]));
  return [...selectedDownloads].map(key => allPosts.get(key)).filter(Boolean);
}

function previewDate(post) {
  const value = post.createdAt || post.date;
  if (!value) {
    return '未知';
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '未知' : date.toLocaleString('zh-CN');
}

function applyPreviewTransform() {
  const image = elements.previewMedia.querySelector('img');
  if (!image) {
    return;
  }

  const pan = clampPreviewPan(
    previewPanX,
    previewPanY,
    previewZoom,
    elements.previewMedia.clientWidth,
    elements.previewMedia.clientHeight
  );
  previewPanX = pan.x;
  previewPanY = pan.y;
  image.style.transform = `translate3d(${previewPanX}px, ${previewPanY}px, 0) scale(${previewZoom})`;
  image.classList.toggle('is-zoomed', previewZoom > 1);
}

function setPreviewZoom(value) {
  previewZoom = Math.min(4, Math.max(0.5, value));
  if (previewZoom <= 1) {
    previewPanX = 0;
    previewPanY = 0;
  }
  applyPreviewTransform();
  elements.zoomResetButton.textContent = `${Math.round(previewZoom * 100)}%`;
}

function saveVideoProgress(post, video, force = false) {
  if (!post || !video || !Number.isFinite(video.currentTime)) {
    return;
  }
  const key = favoriteKey(post);
  const previous = Number(state.videoProgress[key]) || 0;
  if (video.duration && video.currentTime >= video.duration - 3) {
    delete state.videoProgress[key];
  } else if (force || Math.abs(video.currentTime - previous) >= 5) {
    state.videoProgress[key] = Math.round(video.currentTime * 10) / 10;
  } else {
    return;
  }
  persist();
}

async function saveFavoriteMetadata(post) {
  const favorite = state.favorites[favoriteKey(post)];
  if (!favorite) {
    showToast('请先收藏此媒体');
    return;
  }

  favorite.favoriteNote = document.querySelector('#favoriteNote').value.trim();
  favorite.favoriteLabels = document.querySelector('#favoriteLabels').value
    .split(/[,，]/)
    .map(label => label.trim())
    .filter(Boolean)
    .slice(0, 12);
  await persistLibrary();
  renderGallery();
  showToast('收藏备注已保存');
}

function renderPreviewPlaybackRate(post) {
  const enabled = post?.type === 'video' && state.settings.videoPlaybackRateEnabled;
  elements.previewRateField.hidden = !enabled;
  if (enabled) {
    elements.previewPlaybackRate.value = String(state.settings.videoPlaybackRate);
  }
}

function renderPreview() {
  const rows = visiblePosts();
  const post = rows[selectedIndex];
  if (!post) {
    closePreview();
    return;
  }

  const mediaUrl = post.type === 'video' ? post.file : post.sample || post.file;
  const previewUrl = post.preview || post.sample || post.file;
  const poster = /\.(?:mp4|webm)(?:[?#]|$)/i.test(previewUrl)
    ? ''
    : `poster="${escapeHtml(buildMediaUrl(previewUrl))}"`;
  const videoOrientation = Number(post.width) > Number(post.height)
    ? 'is-landscape'
    : Number(post.width) < Number(post.height)
      ? 'is-portrait'
      : 'is-square';
  previewZoom = 1;
  previewPanX = 0;
  previewPanY = 0;
  previewDrag = null;
  previewGesture = null;
  lastPreviewTap = null;
  elements.previewDialog.classList.toggle('hide-details', state.settings.hideDetails);
  elements.previewDialog.classList.toggle('preview-video', post.type === 'video');
  renderPreviewPlaybackRate(post);
  elements.previewQuickFavorite.hidden = !(state.settings.showPreviewFavorite && state.settings.hideDetails);
  elements.previewZoom.hidden = post.type === 'video';
  elements.previewFilmstrip.hidden = !state.settings.showPreviewGallery;
  elements.previewMedia.innerHTML = post.type === 'video'
    ? `
      <video
        class="${videoOrientation}"
        src="${escapeHtml(buildMediaUrl(mediaUrl))}"
        ${poster}
        controls
        playsinline
        preload="metadata"
        ${state.settings.autoplay ? 'autoplay' : ''}
        ${state.settings.videoMuted ? 'muted' : ''}
        ${state.settings.videoLoop ? 'loop' : ''}
      ></video>
    `
    : `<img src="${escapeHtml(buildMediaUrl(mediaUrl))}" alt="${escapeHtml(post.tags?.join(', ') || `帖子 ${post.id}`)}" draggable="false">`;
  if (state.settings.showPreviewGallery) {
    renderPreviewFilmstrip(rows);
  } else {
    elements.previewFilmstrip.innerHTML = '';
  }

  const source = getSource(post.source);
  const favorite = state.favorites[favoriteKey(post)];
  const isFavorite = Boolean(favorite);
  const tags = Array.isArray(post.tags) ? post.tags.slice(0, 100) : [];
  elements.previewQuickFavorite.classList.toggle('is-active', isFavorite);
  elements.previewQuickFavorite.title = isFavorite ? '取消收藏' : '收藏';
  elements.previewQuickFavorite.setAttribute('aria-label', elements.previewQuickFavorite.title);

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
      ${tags.map(tag => {
        const translation = translateTag(tag);
        return `<button class="preview-tag" type="button" data-search-tag="${escapeHtml(tag)}" title="${escapeHtml(translation)}">${escapeHtml(tag)}${translation ? ` · ${escapeHtml(translation)}` : ''}</button>`;
      }).join('')}
    </div>
    <section class="favorite-metadata ${isFavorite ? '' : 'is-disabled'}">
      <h3>收藏整理</h3>
      <label class="text-field compact">
        <span>自定义标签</span>
        <input id="favoriteLabels" value="${escapeHtml(favorite?.favoriteLabels?.join(', ') || '')}" placeholder="壁纸, 待整理" ${isFavorite ? '' : 'disabled'}>
      </label>
      <label class="text-field compact">
        <span>备注</span>
        <textarea id="favoriteNote" rows="3" maxlength="500" placeholder="记录来源、用途或想法" ${isFavorite ? '' : 'disabled'}>${escapeHtml(favorite?.favoriteNote || '')}</textarea>
      </label>
      <button class="tonal-button" id="saveFavoriteMetadata" type="button" ${isFavorite ? '' : 'disabled'}>保存备注</button>
    </section>
    <div class="preview-actions">
      ${state.settings.showPreviewFavorite ? `
        <button class="outlined-button" id="previewFavorite" type="button">
          ${icon('favorite')}${isFavorite ? '取消收藏' : '收藏'}
        </button>
      ` : ''}
      <button class="outlined-button" id="copyTags" type="button">
        ${icon('copy')}复制标签
      </button>
      <button class="outlined-button wide" id="copyOriginalLink" type="button">
        ${icon('copy')}复制原文件链接
      </button>
      <button class="filled-button wide" id="previewDownload" type="button">
        ${icon('download')}下载文件
      </button>
      <a class="outlined-button wide" href="${escapeHtml(post.postUrl)}" target="_blank" rel="noreferrer">
        ${icon('external')}打开原帖
      </a>
    </div>
  `;

  updatePreviewFavoriteControls(post);
  elements.previousPreview.disabled = selectedIndex <= 0;
  elements.nextPreview.disabled = selectedIndex >= rows.length - 1;
  document.querySelector('#previewFavorite')?.addEventListener('click', () => toggleFavorite(post));
  document.querySelector('#copyTags').addEventListener('click', () => copyTags(post));
  document.querySelector('#copyOriginalLink').addEventListener('click', () => copyOriginalLink(post));
  document.querySelector('#previewDownload').addEventListener('click', () => {
    downloadPosts([post]);
  });
  document.querySelector('#saveFavoriteMetadata').addEventListener('click', () => saveFavoriteMetadata(post));

  const video = elements.previewMedia.querySelector('video');
  const previewMedia = video || elements.previewMedia.querySelector('img');
  previewMedia?.addEventListener('error', () => {
    mediaFailures.set(`preview:${favoriteKey(post)}`, {
      url: previewMedia.currentSrc || previewMedia.src || mediaUrl,
      code: video?.error?.code || '',
      message: video?.error?.message || '媒体加载失败',
      time: Date.now()
    });
    elements.previewMedia.innerHTML = statePanel({
      title: '媒体加载失败',
      description: '当前媒体地址无法加载，请重试或打开原帖。',
      iconName: 'retry',
      action: '<div class="state-actions"><button class="filled-button" type="button" data-retry-preview>重新加载</button><button class="outlined-button" type="button" data-preview-diagnostics>诊断详情</button></div>'
    });
  }, { once: true });
  if (video) {
    video.playbackRate = state.settings.videoPlaybackRateEnabled
      ? Number(state.settings.videoPlaybackRate) || 1
      : 1;
    const savedTime = Number(state.videoProgress[favoriteKey(post)]) || 0;
    video.addEventListener('loadedmetadata', () => {
      video.classList.remove('is-landscape', 'is-portrait', 'is-square');
      video.classList.add(
        video.videoWidth > video.videoHeight
          ? 'is-landscape'
          : video.videoWidth < video.videoHeight
            ? 'is-portrait'
            : 'is-square'
      );
      if (savedTime > 0 && savedTime < video.duration - 3) {
        video.currentTime = savedTime;
      }
    }, { once: true });
    video.addEventListener('timeupdate', () => saveVideoProgress(post, video));
    video.addEventListener('pause', () => saveVideoProgress(post, video, true));
    video.addEventListener('ended', () => {
      saveVideoProgress(post, video, true);
      if (state.settings.videoAutoNext && !state.settings.videoLoop) {
        playNextVideo();
      }
    });
    startPreviewVideo(video);
  }
}

function renderPreviewFilmstrip(rows) {
  const start = Math.max(0, selectedIndex - 4);
  const end = Math.min(rows.length, selectedIndex + 5);
  elements.previewFilmstrip.innerHTML = rows.slice(start, end).map((post, offset) => {
    const index = start + offset;
    const preview = post.preview || post.sample || post.file;
    const thumbnail = post.type === 'video' && /\.(?:mp4|webm)(?:[?#]|$)/i.test(preview)
      ? `<video src="${escapeHtml(buildMediaUrl(preview))}" muted playsinline preload="metadata"></video>`
      : `<img src="${escapeHtml(buildMediaUrl(preview))}" alt="" loading="lazy">`;
    return `
      <button
        class="filmstrip-item ${index === selectedIndex ? 'is-active' : ''}"
        type="button"
        data-preview-index="${index}"
        title="帖子 #${escapeHtml(post.id)}"
      >
        ${thumbnail}
        ${post.type === 'video' ? icon('video') : ''}
      </button>
    `;
  }).join('');
  elements.previewFilmstrip.querySelector('.is-active')?.scrollIntoView({
    block: 'nearest',
    inline: 'center'
  });
}

async function togglePreviewFullscreen() {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await elements.previewStage.requestFullscreen();
    }
  } catch {
    showToast('当前浏览器未允许全屏');
  }
}

function openPreview(index) {
  selectedIndex = index;
  const post = visiblePosts()[selectedIndex];
  renderPreview();
  if (!elements.previewDialog.open) {
    elements.previewDialog.showModal();
  }
  if (post && state.view !== 'history') {
    recordHistory(post);
  }
}

function closePreview() {
  previewTransitionToken += 1;
  const post = visiblePosts()[selectedIndex];
  saveVideoProgress(post, elements.previewMedia.querySelector('video'), true);
  elements.previewMedia.innerHTML = '';
  if (elements.previewDialog.open) {
    elements.previewDialog.close();
  }
  selectedIndex = -1;
}

function movePreview(step) {
  const nextIndex = selectedIndex + step;
  if (nextIndex >= 0 && nextIndex < visiblePosts().length) {
    const post = visiblePosts()[selectedIndex];
    saveVideoProgress(post, elements.previewMedia.querySelector('video'), true);
    const complete = () => {
      selectedIndex = nextIndex;
      renderPreview();
    };
    if (!window.matchMedia?.('(max-width: 640px)').matches) {
      complete();
      return;
    }

    const direction = step > 0 ? 'next' : 'previous';
    const token = ++previewTransitionToken;
    const media = elements.previewMedia;
    media.classList.remove('is-swipe-in-next', 'is-swipe-in-previous');
    media.classList.add(`is-swipe-out-${direction}`);
    window.setTimeout(() => {
      if (token !== previewTransitionToken || !elements.previewDialog.open) {
        return;
      }
      media.classList.remove(`is-swipe-out-${direction}`);
      complete();
      media.classList.add(`is-swipe-in-${direction}`);
      window.setTimeout(() => media.classList.remove(`is-swipe-in-${direction}`), 220);
    }, 150);
  }
}

function playNextVideo() {
  const rows = visiblePosts();
  const nextIndex = nextVideoIndex(rows, selectedIndex);
  if (nextIndex < 0) {
    showToast('已经是最后一个视频');
    return;
  }

  const post = rows[selectedIndex];
  saveVideoProgress(post, elements.previewMedia.querySelector('video'), true);
  selectedIndex = nextIndex;
  renderPreview();

  startPreviewVideo(elements.previewMedia.querySelector('video'), true);
}

async function copyTags(post) {
  try {
    await navigator.clipboard.writeText((post.tags || []).join(' '));
    showToast('标签已复制');
  } catch {
    showToast('浏览器未允许复制，请从原帖查看标签');
  }
}

async function copyOriginalLink(post) {
  try {
    await navigator.clipboard.writeText(post.file);
    showToast('原文件链接已复制');
  } catch {
    showToast('浏览器未允许复制，请打开原帖获取链接');
  }
}

function openDrawer() {
  closeMobileFilters();
  elements.settingsDrawer.classList.add('is-open');
  elements.settingsDrawer.setAttribute('aria-hidden', 'false');
}

function closeDrawer() {
  elements.settingsDrawer.classList.remove('is-open');
  elements.settingsDrawer.setAttribute('aria-hidden', 'true');
}

function openMobileFilters() {
  if (state.view !== 'popular') {
    return;
  }
  document.body.classList.add('mobile-filters-open');
  elements.controlSurface.classList.add('is-mobile-open');
  elements.mobileFilterButton.setAttribute('aria-expanded', 'true');
  requestAnimationFrame(() => elements.tagInput.focus({ preventScroll: true }));
}

function closeMobileFilters() {
  document.body.classList.remove('mobile-filters-open');
  elements.controlSurface.classList.remove('is-mobile-open');
  elements.mobileFilterButton.setAttribute('aria-expanded', 'false');
}

function shiftDate(direction) {
  saveGalleryScrollPosition();
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
  scheduleGalleryScrollRestore();
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

function createSmartCollection(name, tags, mediaType) {
  state.smartCollections.unshift({
    id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name,
    tags: tags.trim(),
    mediaType
  });
  state.smartCollections = state.smartCollections.slice(0, 30);
  persist();
  renderSmartCollections();
  renderCollectionTools();
  elements.smartCollectionForm.reset();
  showToast('智能收藏夹已创建');
}

function applySavedSearch(savedSearch) {
  saveGalleryScrollPosition();
  state = {
    ...state,
    source: savedSearch.source || state.source,
    mediaType: savedSearch.mediaType || savedSearch.media || state.mediaType,
    period: savedSearch.period || state.period,
    anchorDate: savedSearch.anchorDate || state.anchorDate,
    ratings: Array.isArray(savedSearch.ratings) ? savedSearch.ratings : state.ratings,
    tags: savedSearch.tags || ''
  };
  ensureCompatibleSource();
  scheduleGalleryScrollRestore();
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
    await persistLibrary();
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

async function checkSourceHealth(sourceId) {
  sourceHealth[sourceId] = {
    status: 'checking',
    httpStatus: 0,
    latencyMs: 0,
    error: '',
    checkedAt: Date.now()
  };
  renderSources();

  try {
    const response = await fetch(`/api/site-health?source=${encodeURIComponent(sourceId)}`, {
      credentials: 'same-origin'
    });
    const payload = await response.json().catch(() => ({}));
    sourceHealth[sourceId] = {
      status: response.ok && payload.ok ? 'online' : 'error',
      httpStatus: Number(payload.status) || response.status,
      latencyMs: Math.max(0, Number(payload.latencyMs) || 0),
      error: payload.error || '',
      checkedAt: Date.now()
    };
  } catch (error) {
    sourceHealth[sourceId] = {
      status: 'error',
      httpStatus: 0,
      latencyMs: 0,
      error: error.message,
      checkedAt: Date.now()
    };
  }
  renderSources();
  if (sourceHealth[sourceId].status === 'online'
    && sourceId === state.source
    && state.view === 'popular'
    && galleryError) {
    fetchPosts({ reset: true, force: true });
  }
}

async function checkAllSourceHealth() {
  const sourceIds = Object.keys(SOURCES);
  let cursor = 0;
  const worker = async () => {
    while (cursor < sourceIds.length) {
      const sourceId = sourceIds[cursor];
      cursor += 1;
      await checkSourceHealth(sourceId);
    }
  };
  await Promise.all([worker(), worker(), worker()]);
}

function registerEvents() {
  document.addEventListener('pointerdown', event => {
    const button = event.target.closest('button:not(.drawer-scrim)');
    if (button) {
      createRipple(event, button);
    }
  });

  document.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) {
      return;
    }

    if (button.dataset.retrySource) {
      checkSourceHealth(button.dataset.retrySource);
    }

    if (button.dataset.sourceDiagnostics) {
      showSourceDiagnostics(button.dataset.sourceDiagnostics);
    }

    if (button.dataset.favoriteFolder !== undefined) {
      saveGalleryScrollPosition();
      state.view = 'favorites';
      state.activeFavoriteFolder = button.dataset.favoriteFolder;
      state.activeSmartCollection = '';
      state.favoriteSearch = '';
      elements.gallery.querySelector('#favoriteSearchInput')?.blur();
      scheduleGalleryScrollRestore();
      selectedDownloads.clear();
      renderControls();
      renderGallery();
    }

    if (button.hasAttribute('data-create-favorite-folder')) {
      const folder = window.prompt('请输入收藏分组名称');
      const normalized = String(folder || '').trim().slice(0, 30);
      if (normalized && !state.favoriteFolders.includes(normalized)) {
        state.favoriteFolders.push(normalized);
        state.activeFavoriteFolder = normalized;
        persist();
        renderCollectionTools();
        renderBatchToolbar();
      }
    }

    if (button.dataset.mediaDiagnostics !== undefined) {
      const post = visiblePosts()[Number(button.dataset.mediaDiagnostics)];
      if (post) {
        showMediaDiagnostics(post, mediaFailures.get(favoriteKey(post)));
      }
    }

    if (button.hasAttribute('data-gallery-diagnostics')) {
      showGalleryDiagnostics();
    }

    if (button.hasAttribute('data-preview-diagnostics')) {
      const post = visiblePosts()[selectedIndex];
      if (post) {
        showMediaDiagnostics(post, mediaFailures.get(`preview:${favoriteKey(post)}`));
      }
    }

    if (button.dataset.view) {
      closeMobileFilters();
      saveGalleryScrollPosition();
      state.view = button.dataset.view;
      state.activeSmartCollection = state.view === 'favorites' ? state.activeSmartCollection : '';
      scheduleGalleryScrollRestore();
      renderLimit = 60;
      selectedDownloads.clear();
      activeRequest?.abort();
      renderControls();
      if (state.view === 'popular') {
        loadedPopularContextKey === popularContextKey()
          ? renderGallery()
          : fetchPosts({ reset: true });
      } else {
        renderGallery();
      }
    }

    if (button.dataset.source) {
      changeSource(button.dataset.source);
      if (sourceHealth[button.dataset.source].status === 'error') {
        checkSourceHealth(button.dataset.source);
      }
      closeMobileFilters();
    }

    if (button.dataset.mediaType) {
      changeMediaType(button.dataset.mediaType);
    }

    if (button.dataset.rating) {
      const rating = button.dataset.rating;
      const selected = state.ratings.includes(rating);
      if (selected && state.ratings.length === 1) {
        showToast('至少保留一个内容分级');
        return;
      }
      saveGalleryScrollPosition();
      state.ratings = selected
        ? state.ratings.filter(item => item !== rating)
        : [...state.ratings, rating];
      scheduleGalleryScrollRestore();
      renderControls();
      fetchPosts({ reset: true });
    }

    if (button.dataset.period) {
      saveGalleryScrollPosition();
      state.period = button.dataset.period;
      scheduleGalleryScrollRestore();
      renderControls();
      fetchPosts({ reset: true });
    }

    if (button.dataset.recentSearch !== undefined) {
      elements.tagInput.value = button.dataset.recentSearch;
      applySearch();
    }

    if (button.dataset.openPreview !== undefined) {
      if (button.querySelector('.has-error')) {
        retryGalleryMedia(button);
      } else {
        openPreview(Number(button.dataset.openPreview));
      }
    }

    if (button.dataset.toggleFavorite !== undefined) {
      toggleFavorite(visiblePosts()[Number(button.dataset.toggleFavorite)]);
    }

    if (button.dataset.toggleWatchLater !== undefined) {
      toggleWatchLater(visiblePosts()[Number(button.dataset.toggleWatchLater)]);
    }

    if (button.dataset.downloadPost !== undefined) {
      const post = visiblePosts()[Number(button.dataset.downloadPost)];
      downloadPosts([post]);
    }

    if (button.dataset.layout) {
      if (state.mediaType !== 'image') {
        return;
      }
      state.settings.galleryLayout = button.dataset.layout;
      renderControls();
      renderGallery();
    }

    if (button.dataset.cancelDownload) {
      const item = downloadQueue.find(entry => entry.id === button.dataset.cancelDownload);
      if (item?.status === 'pending') {
        item.status = 'cancelled';
      }
      downloadControllers.get(button.dataset.cancelDownload)?.abort();
      renderDownloadQueue();
    }

    if (button.dataset.retryDownload) {
      const item = downloadQueue.find(entry => entry.id === button.dataset.retryDownload);
      if (item) {
        item.status = 'pending';
        item.error = '';
        renderDownloadQueue();
        processDownloadQueue();
      }
    }

    if (button.dataset.previewIndex !== undefined) {
      const post = visiblePosts()[selectedIndex];
      saveVideoProgress(post, elements.previewMedia.querySelector('video'), true);
      selectedIndex = Number(button.dataset.previewIndex);
      renderPreview();
    }

    if (button.dataset.tagSuggestion) {
      applyTagSuggestion(button.dataset.tagSuggestion);
    }

    if (button.dataset.smartCollection !== undefined) {
      saveGalleryScrollPosition();
      state.view = 'favorites';
      state.activeSmartCollection = button.dataset.smartCollection;
      scheduleGalleryScrollRestore();
      renderLimit = 60;
      persist();
      renderControls();
      renderGallery();
    }

    if (button.hasAttribute('data-open-smart-collections')) {
      renderSmartCollections();
      elements.savedSearchDialog.showModal();
    }

    if (button.hasAttribute('data-download-view')) {
      downloadPosts(visiblePosts());
    }

    if (button.dataset.applyCollection) {
      saveGalleryScrollPosition();
      state.view = 'favorites';
      state.activeSmartCollection = button.dataset.applyCollection;
      scheduleGalleryScrollRestore();
      elements.savedSearchDialog.close();
      renderLimit = 60;
      persist();
      renderControls();
      renderGallery();
    }

    if (button.dataset.deleteCollection) {
      state.smartCollections = state.smartCollections.filter(collection => {
        return collection.id !== button.dataset.deleteCollection;
      });
      if (state.activeSmartCollection === button.dataset.deleteCollection) {
        state.activeSmartCollection = '';
      }
      persist();
      renderSmartCollections();
      renderGallery();
    }

    if (button.dataset.searchTag) {
      saveGalleryScrollPosition();
      state.view = 'popular';
      state.tags = button.dataset.searchTag;
      elements.tagInput.value = state.tags;
      scheduleGalleryScrollRestore();
      closePreview();
      renderControls();
      fetchPosts({ reset: true });
    }

    if (button.hasAttribute('data-retry-gallery')) {
      fetchPosts({ reset: true, force: true });
    }

    if (button.hasAttribute('data-retry-preview')) {
      renderPreview();
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

  document.addEventListener('input', event => {
    if (event.target.id !== 'favoriteSearchInput' || state.view !== 'favorites') {
      return;
    }
    state.favoriteSearch = event.target.value.trim().slice(0, 120);
    persist();
    renderGallery({ preserveCollectionTools: true });
  });

  elements.gallery.addEventListener('change', event => {
    const input = event.target.closest('[data-select-download]');
    if (!input) {
      return;
    }

    const post = visiblePosts()[Number(input.dataset.selectDownload)];
    const key = favoriteKey(post);
    input.checked ? selectedDownloads.add(key) : selectedDownloads.delete(key);
    renderBatchToolbar();
  });

  elements.searchForm.addEventListener('submit', event => {
    event.preventDefault();
    elements.tagSuggestions.hidden = true;
    elements.syntaxHelp.hidden = true;
    applySearch();
  });
  elements.tagInput.addEventListener('input', () => {
    suggestionIndex = -1;
    elements.syntaxHelp.hidden = true;
    scheduleTagSuggestions();
  });
  elements.tagInput.addEventListener('keydown', event => {
    if (elements.tagSuggestions.hidden || !currentSuggestions.length) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      suggestionIndex = (suggestionIndex + 1) % currentSuggestions.length;
      renderTagSuggestions();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      suggestionIndex = (suggestionIndex - 1 + currentSuggestions.length) % currentSuggestions.length;
      renderTagSuggestions();
    } else if (event.key === 'Enter' && suggestionIndex >= 0) {
      event.preventDefault();
      applyTagSuggestion(currentSuggestions[suggestionIndex].tag);
    } else if (event.key === 'Escape') {
      elements.tagSuggestions.hidden = true;
    }
  });
  elements.searchHelp.addEventListener('click', () => {
    elements.tagSuggestions.hidden = true;
    elements.syntaxHelp.hidden = !elements.syntaxHelp.hidden;
  });
  document.addEventListener('click', event => {
    if (!event.target.closest('.search-wrap')) {
      elements.tagSuggestions.hidden = true;
      elements.syntaxHelp.hidden = true;
    }
  });
  elements.refreshButton.addEventListener('click', () => fetchPosts({ reset: true, force: true }));
  elements.settingsButton.addEventListener('click', openDrawer);
  elements.mobileSettingsButton.addEventListener('click', openDrawer);
  elements.mobileFilterButton.addEventListener('click', openMobileFilters);
  elements.mobileFilterClose.addEventListener('click', closeMobileFilters);
  elements.mobileFilterScrim.addEventListener('click', closeMobileFilters);
  document.querySelectorAll('[data-close-drawer]').forEach(button => {
    button.addEventListener('click', closeDrawer);
  });
  elements.previousDate.addEventListener('click', () => shiftDate(-1));
  elements.nextDate.addEventListener('click', () => shiftDate(1));
  elements.anchorDate.addEventListener('change', () => {
    saveGalleryScrollPosition();
    state.anchorDate = elements.anchorDate.value || formatDate(new Date());
    scheduleGalleryScrollRestore();
    renderControls();
    fetchPosts({ reset: true });
  });
  elements.dimensionFilter.addEventListener('change', () => {
    saveGalleryScrollPosition();
    state.dimensionFilter = elements.dimensionFilter.value;
    scheduleGalleryScrollRestore();
    renderLimit = 60;
    renderControls();
    renderGallery();
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
  elements.blockedTags.addEventListener('change', () => {
    state.settings.blockedTags = elements.blockedTags.value.trim();
    renderControls();
    state.view === 'popular' ? fetchPosts({ reset: true }) : renderGallery();
  });
  elements.downloadConcurrency.addEventListener('change', () => {
    state.settings.downloadConcurrency = Math.min(
      4,
      Math.max(1, Math.round(Number(elements.downloadConcurrency.value) || 2))
    );
    renderControls();
    processDownloadQueue();
  });
  elements.downloadNameTemplate.addEventListener('change', () => {
    state.settings.downloadNameTemplate = elements.downloadNameTemplate.value.trim()
      .replace(/[\r\n]+/g, ' ')
      .slice(0, 100)
      || '{source}-{id}';
    renderControls();
  });

  elements.exportButton.addEventListener('click', exportData);
  elements.downloadFavoritesButton.addEventListener('click', () => {
    downloadPosts(Object.values(state.favorites));
  });
  elements.clearHistoryButton.addEventListener('click', async () => {
    if (!window.confirm('清空全部浏览历史？')) {
      return;
    }
    state.history = {};
    await persistLibrary();
    if (state.view === 'history') {
      renderGallery();
    }
    showToast('浏览历史已清空');
  });
  elements.selectVisibleButton.addEventListener('click', () => {
    visiblePosts().forEach(post => selectedDownloads.add(favoriteKey(post)));
    renderGallery();
  });
  elements.clearSelectionButton.addEventListener('click', () => {
    selectedDownloads.clear();
    renderGallery();
  });
  elements.downloadSelectedButton.addEventListener('click', () => downloadPosts(selectedPosts()));
  elements.moveSelectedFavorites.addEventListener('click', moveSelectedFavorites);
  elements.tagSelectedFavorites.addEventListener('click', tagSelectedFavorites);
  elements.clearDownloadQueue.addEventListener('click', () => {
    for (let index = downloadQueue.length - 1; index >= 0; index -= 1) {
      if (['done', 'cancelled'].includes(downloadQueue[index].status)) {
        downloadQueue.splice(index, 1);
      }
    }
    renderDownloadQueue();
  });
  elements.resumeDownloadQueue.addEventListener('click', () => {
    downloadQueue.forEach(item => {
      if (['paused', 'error'].includes(item.status)) {
        item.status = 'pending';
        item.error = '';
      }
    });
    renderDownloadQueue();
    processDownloadQueue();
  });
  elements.importButton.addEventListener('click', () => elements.importFile.click());
  elements.importFile.addEventListener('change', () => {
    const [file] = elements.importFile.files;
    if (file) {
      importData(file);
    }
  });
  elements.resetButton.addEventListener('click', async () => {
    if (!window.confirm('清除全部收藏、搜索集和全局设置？')) {
      return;
    }
    state = await resetState();
    downloadQueue = [];
    downloadSequence = 0;
    state.anchorDate = formatDate(new Date());
    closeDrawer();
    renderControls();
    renderDownloadQueue();
    fetchPosts({ reset: true });
    showToast('本地数据已清除');
  });

  elements.savedSearchButton.addEventListener('click', () => {
    closeMobileFilters();
    renderSavedSearches();
    renderSmartCollections();
    elements.savedSearchDialog.showModal();
  });
  elements.pixivButton.addEventListener('click', () => {
    elements.pixivDialog.showModal();
    requestAnimationFrame(() => elements.pixivInput.focus());
  });
  elements.closePixiv.addEventListener('click', () => elements.pixivDialog.close());
  elements.pixivForm.addEventListener('submit', event => {
    event.preventDefault();
    openPixivArtwork(elements.pixivInput.value);
  });
  elements.closeSavedSearch.addEventListener('click', () => elements.savedSearchDialog.close());
  elements.saveSearchForm.addEventListener('submit', event => {
    event.preventDefault();
    saveCurrentSearch(elements.savedSearchName.value.trim());
  });
  elements.smartCollectionForm.addEventListener('submit', event => {
    event.preventDefault();
    createSmartCollection(
      elements.smartCollectionName.value.trim(),
      elements.smartCollectionTags.value,
      elements.smartCollectionMedia.value
    );
  });

  elements.closePreview.addEventListener('click', closePreview);
  elements.previousPreview.addEventListener('click', () => movePreview(-1));
  elements.nextPreview.addEventListener('click', () => movePreview(1));
  elements.previewHelpButton.addEventListener('click', () => {
    elements.shortcutHelp.hidden = !elements.shortcutHelp.hidden;
  });
  elements.previewQuickFavorite.addEventListener('click', () => {
    const post = visiblePosts()[selectedIndex];
    if (post) {
      toggleFavorite(post);
    }
  });
  elements.previewFullscreenButton.addEventListener('click', togglePreviewFullscreen);
  elements.previewPlaybackRate.addEventListener('change', () => {
    const rate = Number(elements.previewPlaybackRate.value);
    if (![0.5, 0.75, 1, 1.25, 1.5, 2].includes(rate)) {
      return;
    }
    state.settings.videoPlaybackRate = rate;
    const video = elements.previewMedia.querySelector('video');
    if (video) {
      video.playbackRate = rate;
    }
    persist();
  });
  elements.closeDiagnostic.addEventListener('click', () => elements.diagnosticDialog.close());
  elements.zoomInButton.addEventListener('click', () => setPreviewZoom(previewZoom + 0.25));
  elements.zoomOutButton.addEventListener('click', () => setPreviewZoom(previewZoom - 0.25));
  elements.zoomResetButton.addEventListener('click', () => setPreviewZoom(1));
  elements.previewStage.addEventListener('wheel', event => {
    if (!elements.previewDialog.open || elements.previewZoom.hidden) {
      return;
    }
    event.preventDefault();
    setPreviewZoom(previewZoom + (event.deltaY < 0 ? 0.25 : -0.25));
  }, { passive: false });
  elements.previewMedia.addEventListener('dblclick', event => {
    if (event.target.closest('img')) {
      setPreviewZoom(previewZoom > 1 ? 1 : 2);
    }
  });
  elements.previewMedia.addEventListener('pointerdown', event => {
    const image = event.target.closest('img');
    const media = event.target.closest('img, video');
    if (!media || event.button !== 0) {
      return;
    }
    if (event.pointerType === 'touch') {
      previewGesture = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startedAt: performance.now(),
        target: media
      };
    }
    if (!image || previewZoom <= 1) {
      return;
    }
    event.preventDefault();
    previewDrag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      panX: previewPanX,
      panY: previewPanY
    };
    image.classList.add('is-dragging');
    image.setPointerCapture(event.pointerId);
  });
  elements.previewMedia.addEventListener('pointermove', event => {
    if (!previewDrag || previewDrag.pointerId !== event.pointerId) {
      return;
    }
    previewPanX = previewDrag.panX + event.clientX - previewDrag.startX;
    previewPanY = previewDrag.panY + event.clientY - previewDrag.startY;
    applyPreviewTransform();
  });
  const finishPreviewDrag = event => {
    if (previewDrag?.pointerId === event.pointerId) {
      elements.previewMedia.querySelector('img')?.classList.remove('is-dragging');
      previewDrag = null;
    }
    if (!previewGesture || previewGesture.pointerId !== event.pointerId) {
      return;
    }
    const gesture = previewGesture;
    previewGesture = null;
    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    const duration = performance.now() - gesture.startedAt;
    const step = previewSwipeStep(deltaX, deltaY, duration, previewZoom);
    if (step) {
      lastPreviewTap = null;
      movePreview(step);
      return;
    }
    if (gesture.target.tagName !== 'IMG' || Math.hypot(deltaX, deltaY) > 18 || duration > 350) {
      return;
    }
    const now = performance.now();
    const previousTap = lastPreviewTap;
    lastPreviewTap = { at: now, x: event.clientX, y: event.clientY };
    if (previousTap
      && now - previousTap.at <= 320
      && Math.hypot(event.clientX - previousTap.x, event.clientY - previousTap.y) <= 32) {
      lastPreviewTap = null;
      setPreviewZoom(previewZoom > 1 ? 1 : 2);
    }
  };
  elements.previewMedia.addEventListener('pointerup', finishPreviewDrag);
  elements.previewMedia.addEventListener('pointercancel', event => {
    previewGesture = null;
    finishPreviewDrag(event);
  });
  elements.previewDialog.addEventListener('close', () => {
    const post = visiblePosts()[selectedIndex];
    saveVideoProgress(post, elements.previewMedia.querySelector('video'), true);
    elements.previewMedia.innerHTML = '';
    selectedIndex = -1;
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && document.body.classList.contains('mobile-filters-open')) {
      closeMobileFilters();
      return;
    }
    const typing = event.target.matches('input, textarea, select');
    if (!elements.previewDialog.open || typing) {
      return;
    }
    if (event.key === 'ArrowLeft') {
      movePreview(-1);
    } else if (event.key === 'ArrowRight') {
      movePreview(1);
    } else if (event.key.toLowerCase() === 'f') {
      const post = visiblePosts()[selectedIndex];
      if (post) {
        toggleFavorite(post);
      }
    } else if (event.key.toLowerCase() === 'd') {
      const post = visiblePosts()[selectedIndex];
      if (post) {
        downloadPosts([post]);
      }
    } else if (event.key === '+' || event.key === '=') {
      setPreviewZoom(previewZoom + 0.25);
    } else if (event.key === '-') {
      setPreviewZoom(previewZoom - 0.25);
    } else if (event.key === '0') {
      setPreviewZoom(1);
    } else if (event.key.toLowerCase() === 'x') {
      togglePreviewFullscreen();
    } else if (event.key === '?') {
      elements.shortcutHelp.hidden = !elements.shortcutHelp.hidden;
    }
  });

  window.addEventListener('online', updateNetworkStatus);
  window.addEventListener('offline', updateNetworkStatus);
  window.addEventListener('scroll', () => {
    elements.backToTop.hidden = window.scrollY < 700;
    if (!scrollSaveFrame) {
      scrollSaveFrame = requestAnimationFrame(() => {
        scrollSaveFrame = 0;
        saveGalleryScrollPosition();
      });
    }
  }, { passive: true });
  elements.backToTop.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

async function initialize() {
  if (!state.anchorDate) {
    state.anchorDate = formatDate(new Date());
  }

  ensureCompatibleSource();

  await hydrateLibrary(state);
  downloadQueue = state.downloadQueue;
  downloadSequence = downloadQueue.reduce((maximum, item) => {
    return Math.max(maximum, Number(item.id) || 0);
  }, 0);
  saveState(state);
  registerEvents();
  updateNetworkStatus();
  renderControls();
  renderGallery();
  renderDownloadQueue();
  checkAllSourceHealth();

  const observer = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting) {
      if (state.view === 'links') {
        return;
      }
      const rows = visiblePosts();
      if (renderLimit < rows.length) {
        renderLimit += 40;
        renderGallery({ append: true });
      } else if (state.view === 'popular') {
        fetchPosts();
      }
    }
  }, {
    rootMargin: '600px 0px'
  });
  observer.observe(elements.loadSentinel);

  fetchPosts({ reset: true });
}

initialize();
