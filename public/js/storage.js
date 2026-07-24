const STORAGE_KEY = 'atlas-gallery-v2';
const LEGACY_STORAGE_KEY = 'atlas-gallery';

export const DEFAULT_STATE = {
  source: 'konachan',
  view: 'popular',
  mediaType: 'image',
  period: 'week',
  anchorDate: '',
  tags: '',
  ratings: ['safe'],
  settings: {
    theme: 'light',
    accent: 'blue',
    hideDetails: false,
    autoplay: true,
    blurSensitive: true,
    compactGrid: false,
    reduceMotion: false,
    proxyTemplate: ''
  },
  favorites: {},
  recentSearches: [],
  savedSearches: []
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeSettings(settings = {}) {
  const legacyTheme = settings.light === undefined
    ? undefined
    : settings.light ? 'light' : 'dark';

  return {
    ...DEFAULT_STATE.settings,
    ...settings,
    theme: settings.theme || legacyTheme || DEFAULT_STATE.settings.theme,
    accent: ['blue', 'green', 'coral', 'violet'].includes(settings.accent)
      ? settings.accent
      : DEFAULT_STATE.settings.accent,
    compactGrid: settings.compactGrid ?? settings.compact ?? false,
    proxyTemplate: settings.proxyTemplate ?? settings.proxy ?? ''
  };
}

function normalizeState(value = {}) {
  return {
    ...clone(DEFAULT_STATE),
    ...value,
    mediaType: value.mediaType || value.media || DEFAULT_STATE.mediaType,
    settings: normalizeSettings(value.settings),
    favorites: value.favorites && typeof value.favorites === 'object'
      ? value.favorites
      : {},
    recentSearches: Array.isArray(value.recentSearches) ? value.recentSearches : [],
    savedSearches: Array.isArray(value.savedSearches)
      ? value.savedSearches
      : Array.isArray(value.presets) ? value.presets : []
  };
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function resetState() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(LEGACY_STORAGE_KEY);
  return clone(DEFAULT_STATE);
}

export function exportLibrary(state) {
  const payload = {
    format: 'atlas-gallery-library',
    version: 2,
    exportedAt: new Date().toISOString(),
    favorites: state.favorites,
    savedSearches: state.savedSearches
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

  if (payload?.format !== 'atlas-gallery-library' || payload?.version !== 2) {
    throw new Error('文件格式或版本不受支持');
  }

  return {
    ...state,
    favorites: {
      ...state.favorites,
      ...(payload.favorites || {})
    },
    savedSearches: Array.isArray(payload.savedSearches)
      ? payload.savedSearches
      : state.savedSearches
  };
}
