import {
  normalizeDownloadConcurrency,
  normalizeDownloadNameTemplate
} from './library.js?v=2.17.0';

const STORAGE_KEY = 'atlas-gallery-v2';
const LEGACY_STORAGE_KEY = 'atlas-gallery';
const FALLBACK_LIBRARY_KEY = 'atlas-gallery-library-fallback';
const DATABASE_NAME = 'atlas-gallery-library';
const DATABASE_VERSION = 1;
const FAVORITES_STORE = 'favorites';
const HISTORY_STORE = 'history';

export const DEFAULT_STATE = {
  source: 'konachan',
  view: 'popular',
  mediaType: 'image',
  period: 'week',
  anchorDate: '',
  tags: '',
  ratings: ['safe', 'questionable', 'explicit'],
  dimensionFilter: 'all',
  settings: {
    theme: 'light',
    accent: 'blue',
    hideDetails: true,
    autoplay: true,
    videoAutoNext: true,
    videoMuted: false,
    videoLoop: false,
    videoPlaybackRate: 1,
    videoPlaybackRateEnabled: true,
    showPreviewGallery: false,
    showPreviewFavorite: true,
    blurSensitive: false,
    compactGrid: false,
    galleryLayout: 'grid',
    blockedTags: '',
    downloadConcurrency: 2,
    downloadNameTemplate: '{source}-{id}',
    proxyTemplate: ''
  },
  favorites: {},
  history: {},
  watchLater: {},
  recentSearches: [],
  savedSearches: [],
  smartCollections: [],
  activeSmartCollection: '',
  favoriteFolders: [],
  activeFavoriteFolder: '',
  favoriteSearch: '',
  videoProgress: {},
  downloadQueue: []
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeSettings(settings = {}) {
  const {
    reduceMotion: _legacyReduceMotion,
    showPreviewWatchLater: _legacyShowPreviewWatchLater,
    ...settingsWithoutMotion
  } = settings;
  const legacyTheme = settings.light === undefined
    ? undefined
    : settings.light ? 'light' : 'dark';

  return {
    ...DEFAULT_STATE.settings,
    ...settingsWithoutMotion,
    theme: settingsWithoutMotion.theme || legacyTheme || DEFAULT_STATE.settings.theme,
    accent: ['blue', 'green', 'coral', 'violet'].includes(settingsWithoutMotion.accent)
      ? settingsWithoutMotion.accent
      : DEFAULT_STATE.settings.accent,
    galleryLayout: ['grid', 'masonry'].includes(settingsWithoutMotion.galleryLayout)
      ? settingsWithoutMotion.galleryLayout
      : DEFAULT_STATE.settings.galleryLayout,
    videoPlaybackRate: [0.5, 0.75, 1, 1.25, 1.5, 2].includes(Number(settingsWithoutMotion.videoPlaybackRate))
      ? Number(settingsWithoutMotion.videoPlaybackRate)
      : DEFAULT_STATE.settings.videoPlaybackRate,
    videoPlaybackRateEnabled: settingsWithoutMotion.videoPlaybackRateEnabled ?? true,
    compactGrid: settingsWithoutMotion.compactGrid ?? settingsWithoutMotion.compact ?? false,
    blockedTags: String(settingsWithoutMotion.blockedTags || '').trim(),
    downloadConcurrency: normalizeDownloadConcurrency(settingsWithoutMotion.downloadConcurrency),
    downloadNameTemplate: normalizeDownloadNameTemplate(settingsWithoutMotion.downloadNameTemplate),
    proxyTemplate: settingsWithoutMotion.proxyTemplate ?? settingsWithoutMotion.proxy ?? ''
  };
}

function normalizeState(value = {}) {
  return {
    ...clone(DEFAULT_STATE),
    ...value,
    mediaType: value.mediaType || value.media || DEFAULT_STATE.mediaType,
    dimensionFilter: ['all', 'landscape', 'portrait', 'square', 'large'].includes(value.dimensionFilter)
      ? value.dimensionFilter
      : DEFAULT_STATE.dimensionFilter,
    settings: normalizeSettings(value.settings),
    favorites: value.favorites && typeof value.favorites === 'object'
      ? value.favorites
      : {},
    history: value.history && typeof value.history === 'object' ? value.history : {},
    watchLater: value.watchLater && typeof value.watchLater === 'object' ? value.watchLater : {},
    recentSearches: Array.isArray(value.recentSearches) ? value.recentSearches : [],
    savedSearches: Array.isArray(value.savedSearches)
      ? value.savedSearches
      : Array.isArray(value.presets) ? value.presets : [],
    smartCollections: Array.isArray(value.smartCollections) ? value.smartCollections : [],
    activeSmartCollection: value.activeSmartCollection || '',
    favoriteFolders: Array.isArray(value.favoriteFolders)
      ? value.favoriteFolders.map(folder => String(folder).trim()).filter(Boolean).slice(0, 50)
      : [],
    activeFavoriteFolder: String(value.activeFavoriteFolder || ''),
    favoriteSearch: String(value.favoriteSearch || '').trim().slice(0, 120),
    videoProgress: value.videoProgress && typeof value.videoProgress === 'object'
      ? value.videoProgress
      : {},
    downloadQueue: normalizeDownloadQueue(value.downloadQueue)
  };
}

export function normalizeDownloadQueue(queue) {
  if (!Array.isArray(queue)) {
    return [];
  }

  return queue
    .filter(item => item?.post?.file && item?.id)
    .slice(-100)
    .map(item => {
      const interrupted = ['pending', 'running'].includes(item.status);
      return {
        id: String(item.id),
        post: item.post,
        filename: String(item.filename || 'media'),
        status: interrupted ? 'paused' : item.status || 'paused',
        error: interrupted ? '页面刷新后已暂停' : String(item.error || '')
      };
    });
}

function readJson(key) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

export function loadState() {
  const current = readJson(STORAGE_KEY);
  if (current) {
    return normalizeState(current);
  }

  const legacy = readJson(LEGACY_STORAGE_KEY);
  const migrated = normalizeState(legacy || DEFAULT_STATE);

  if (legacy) {
    saveState(migrated);
  }

  return migrated;
}

export function saveState(state) {
  try {
    const lightweightState = {
      ...state,
      favorites: {},
      history: {}
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lightweightState));
    return true;
  } catch {
    return false;
  }
}

function openDatabase() {
  if (!globalThis.indexedDB) {
    return Promise.reject(new Error('IndexedDB unavailable'));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(FAVORITES_STORE)) {
        database.createObjectStore(FAVORITES_STORE, { keyPath: 'key' });
      }
      if (!database.objectStoreNames.contains(HISTORY_STORE)) {
        database.createObjectStore(HISTORY_STORE, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('无法打开 IndexedDB'));
  });
}

function readStore(database, storeName) {
  return new Promise((resolve, reject) => {
    const request = database.transaction(storeName, 'readonly').objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error || new Error('无法读取本地图库'));
  });
}

function writeStore(database, storeName, entries) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    store.clear();
    entries.forEach(entry => store.put(entry));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('无法保存本地图库'));
  });
}

function objectFromEntries(entries) {
  return Object.fromEntries(entries.map(entry => [entry.key, entry.post]));
}

function storeEntries(value) {
  return Object.entries(value || {}).map(([key, post]) => ({ key, post }));
}

function readFallbackLibrary() {
  return readJson(FALLBACK_LIBRARY_KEY);
}

function normalizeLibrary(library = {}) {
  return {
    favorites: library.favorites && typeof library.favorites === 'object'
      ? library.favorites
      : {},
    history: library.history && typeof library.history === 'object'
      ? library.history
      : {}
  };
}

function hasLibraryEntries(library) {
  return Object.keys(library.favorites).length > 0
    || Object.keys(library.history).length > 0;
}

export function resolveLibrarySnapshot(databaseLibrary, fallbackLibrary, stateLibrary) {
  if (fallbackLibrary) {
    return normalizeLibrary(fallbackLibrary);
  }

  const normalizedDatabase = normalizeLibrary(databaseLibrary);
  return hasLibraryEntries(normalizedDatabase)
    ? normalizedDatabase
    : normalizeLibrary(stateLibrary);
}

function writeFallbackLibrary(library) {
  try {
    localStorage.setItem(FALLBACK_LIBRARY_KEY, JSON.stringify(library));
  } catch {
    // Keep the in-memory state when browser storage is unavailable or full.
  }
}

export async function hydrateLibrary(state) {
  let database;

  try {
    database = await openDatabase();
    const [favoriteEntries, historyEntries] = await Promise.all([
      readStore(database, FAVORITES_STORE),
      readStore(database, HISTORY_STORE)
    ]);
    const databaseLibrary = {
      favorites: objectFromEntries(favoriteEntries),
      history: objectFromEntries(historyEntries)
    };
    const fallbackLibrary = readFallbackLibrary();
    const stateLibrary = {
      favorites: state.favorites,
      history: state.history
    };
    const library = resolveLibrarySnapshot(databaseLibrary, fallbackLibrary, stateLibrary);
    const shouldMigrate = Boolean(fallbackLibrary)
      || (!hasLibraryEntries(databaseLibrary) && hasLibraryEntries(library));

    state.favorites = library.favorites;
    state.history = library.history;

    if (shouldMigrate) {
      await Promise.all([
        writeStore(database, FAVORITES_STORE, storeEntries(library.favorites)),
        writeStore(database, HISTORY_STORE, storeEntries(library.history))
      ]);
      localStorage.removeItem(FALLBACK_LIBRARY_KEY);
    }
  } catch {
    const fallback = readFallbackLibrary();
    if (fallback) {
      const library = normalizeLibrary(fallback);
      state.favorites = library.favorites;
      state.history = library.history;
    }
  } finally {
    database?.close();
  }

  return state;
}

export async function saveLibrary(state) {
  const library = {
    favorites: state.favorites || {},
    history: state.history || {}
  };

  try {
    const database = await openDatabase();
    await Promise.all([
      writeStore(database, FAVORITES_STORE, storeEntries(library.favorites)),
      writeStore(database, HISTORY_STORE, storeEntries(library.history))
    ]);
    database.close();
    localStorage.removeItem(FALLBACK_LIBRARY_KEY);
  } catch {
    writeFallbackLibrary(library);
  }
}

export async function resetState() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(LEGACY_STORAGE_KEY);
  localStorage.removeItem(FALLBACK_LIBRARY_KEY);

  try {
    await new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(DATABASE_NAME);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => resolve();
    });
  } catch {
    // localStorage has already been cleared.
  }

  return clone(DEFAULT_STATE);
}

export function exportLibrary(state) {
  const payload = {
    format: 'atlas-gallery-library',
    version: 5,
    exportedAt: new Date().toISOString(),
    favorites: state.favorites,
    favoriteFolders: state.favoriteFolders || [],
    history: state.history,
    savedSearches: state.savedSearches,
    smartCollections: state.smartCollections,
    watchLater: state.watchLater
  };

  return JSON.stringify(payload, null, 2);
}

export function importLibrary(text, state) {
  let payload;

  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error('文件不是有效的 JSON');
  }

  if (
    payload?.format !== 'atlas-gallery-library'
    || ![2, 3, 4, 5].includes(payload?.version)
  ) {
    throw new Error('文件格式或版本不受支持');
  }

  return {
    ...state,
    favorites: {
      ...state.favorites,
      ...(payload.favorites || {})
    },
    favoriteFolders: [
      ...new Set([
        ...(state.favoriteFolders || []),
        ...(Array.isArray(payload.favoriteFolders) ? payload.favoriteFolders : [])
      ].map(folder => String(folder).trim()).filter(Boolean))
    ].slice(0, 50),
    history: {
      ...state.history,
      ...(payload.history || {})
    },
    watchLater: {
      ...state.watchLater,
      ...(payload.watchLater || {})
    },
    savedSearches: Array.isArray(payload.savedSearches)
      ? payload.savedSearches
      : state.savedSearches,
    smartCollections: Array.isArray(payload.smartCollections)
      ? payload.smartCollections
      : state.smartCollections
  };
}
