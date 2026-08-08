export const TAG_DICTIONARY = Object.freeze({
  '1girl': '单人女性',
  '1boy': '单人男性',
  solo: '单人',
  landscape: '风景',
  scenery: '景色',
  wallpaper: '壁纸',
  sky: '天空',
  cloud: '云',
  sunset: '日落',
  night: '夜景',
  city: '城市',
  outdoors: '户外',
  indoors: '室内',
  blue_hair: '蓝发',
  black_hair: '黑发',
  white_hair: '白发',
  long_hair: '长发',
  short_hair: '短发',
  smile: '微笑',
  looking_at_viewer: '看向观众',
  original: '原创角色',
  animated: '动画',
  video: '视频',
  no_humans: '无人',
  animal: '动物',
  nature: '自然',
  water: '水景',
  mountain: '山景',
  flower: '花',
  portrait: '肖像',
  monochrome: '单色',
  highres: '高分辨率'
});

export function translateTag(tag) {
  return TAG_DICTIONARY[String(tag || '').replace(/^-/, '')] || '';
}

export function tagTokens(value) {
  return String(value || '')
    .trim()
    .split(/\s+/)
    .map(tag => tag.trim())
    .filter(Boolean);
}

function canonicalTag(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

export function matchesBlockedTags(post, blockedTags) {
  const blocked = new Set(tagTokens(blockedTags).map(canonicalTag));
  if (!blocked.size) {
    return false;
  }

  return (Array.isArray(post?.tags) ? post.tags : [])
    .some(tag => blocked.has(canonicalTag(tag)));
}

export function suggestTags(input, candidates = [], limit = 8) {
  const text = String(input || '');
  const current = text.split(/\s+/).pop() || '';
  const excluded = current.startsWith('-');
  const query = current.replace(/^-/, '').toLowerCase();

  if (!query) {
    return [];
  }

  const knownTags = new Set([
    ...Object.keys(TAG_DICTIONARY),
    ...candidates.flatMap(value => Array.isArray(value) ? value : tagTokens(value))
  ]);

  return [...knownTags]
    .filter(tag => tag.toLowerCase().includes(query))
    .sort((left, right) => {
      const leftStarts = left.toLowerCase().startsWith(query) ? 0 : 1;
      const rightStarts = right.toLowerCase().startsWith(query) ? 0 : 1;
      return leftStarts - rightStarts || left.localeCompare(right);
    })
    .slice(0, Math.max(0, limit))
    .map(tag => ({
      tag: `${excluded ? '-' : ''}${tag}`,
      translation: translateTag(tag)
    }));
}

export function replaceCurrentTag(input, replacement) {
  const text = String(input || '');
  const leading = text.match(/^\s*/)?.[0] || '';
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  tokens[tokens.length - 1] = replacement;
  return `${leading}${tokens.join(' ')} `;
}

export function shouldRetryRequest(status) {
  return status === undefined || status === null || status === 429 || status >= 500;
}

export function retryDelay(retryNumber) {
  return retryNumber <= 1 ? 500 : 1500;
}

export function nextVideoIndex(posts, currentIndex) {
  if (!Array.isArray(posts)) {
    return -1;
  }

  return posts.findIndex((post, index) => index > currentIndex && post?.type === 'video');
}

export function parsePixivArtworkId(value) {
  const input = String(value || '').trim();

  if (/^\d{1,20}$/.test(input)) {
    return input;
  }

  let url;
  try {
    url = new URL(input);
  } catch {
    return '';
  }

  if (!['pixiv.net', 'www.pixiv.net'].includes(url.hostname.toLowerCase())) {
    return '';
  }

  const match = url.pathname.match(/^\/(?:en\/)?artworks\/(\d{1,20})\/?$/);
  return match?.[1] || '';
}

export function sourceSupportsMedia(source, mediaType) {
  return Boolean(source?.capabilities?.[mediaType]);
}

export function sourceIdsForMedia(sources, mediaType) {
  return Object.entries(sources || {})
    .filter(([, source]) => sourceSupportsMedia(source, mediaType))
    .map(([sourceId]) => sourceId);
}

export function compatibleSourceId(sources, sourceId, mediaType) {
  const availableSourceIds = sourceIdsForMedia(sources, mediaType);
  return availableSourceIds.includes(sourceId)
    ? sourceId
    : availableSourceIds[0] || '';
}

export function matchesSmartCollection(post, collection) {
  if (!post || !collection) {
    return false;
  }

  const requiredTags = tagTokens(collection.tags).map(tag => tag.replace(/^-/, ''));
  const postTags = new Set(Array.isArray(post.tags) ? post.tags : []);
  const mediaMatches = !collection.mediaType
    || collection.mediaType === 'all'
    || post.type === collection.mediaType;

  return mediaMatches && requiredTags.every(tag => postTags.has(tag));
}

export function matchesFavoriteSearch(post, query) {
  const normalizedQuery = String(query || '').trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  const searchable = [
    post?.source,
    post?.id,
    post?.favoriteFolder,
    post?.favoriteNote,
    ...(Array.isArray(post?.tags) ? post.tags : []),
    ...(Array.isArray(post?.favoriteLabels) ? post.favoriteLabels : [])
  ].map(value => String(value || '').toLowerCase()).join(' ');

  return normalizedQuery.split(/\s+/).every(token => searchable.includes(token));
}

function isVideoUrl(value) {
  return /\.(?:mp4|webm|m4v|mov)(?:[?#]|$)/i.test(String(value || ''));
}

export function videoSourceOptions(post) {
  const candidates = [
    { value: 'original', label: '原画', url: post?.file, allowAnyUrl: post?.type === 'video' },
    { value: 'sample', label: '流畅', url: post?.sample },
    { value: 'preview', label: '预览', url: post?.preview }
  ];
  const seen = new Set();

  return candidates.filter(candidate => {
    if (!candidate.url || (!candidate.allowAnyUrl && !isVideoUrl(candidate.url)) || seen.has(candidate.url)) {
      return false;
    }
    seen.add(candidate.url);
    return true;
  });
}

export function selectVideoSource(post, preferred = 'original') {
  const options = videoSourceOptions(post);
  return options.find(option => option.value === preferred)
    || options.find(option => option.value === 'original')
    || options[0]
    || { value: 'original', label: '原画', url: post?.file || '' };
}

export function matchesDimension(post, filter = 'all') {
  const width = Number(post?.width) || 0;
  const height = Number(post?.height) || 0;

  if (filter === 'large') {
    return width >= 2560 || height >= 2560;
  }
  if (!width || !height || filter === 'all') {
    return true;
  }

  const ratio = width / height;
  if (filter === 'square') {
    return ratio >= 0.9 && ratio <= 1.1;
  }
  return filter === 'landscape' ? ratio > 1.1 : ratio < 0.9;
}

export function mediaIdentity(post) {
  if (!post?.file) {
    return `${post?.source || 'unknown'}:${post?.id || 'unknown'}`;
  }

  try {
    const url = new URL(post.file);
    return `${url.hostname.toLowerCase()}${decodeURIComponent(url.pathname)}`;
  } catch {
    return String(post.file).split(/[?#]/)[0].toLowerCase();
  }
}

export function galleryViewKey(value = {}) {
  const settings = value.settings || {};
  return [
    value.view || 'popular',
    value.source || '',
    value.mediaType || 'image',
    value.period || '',
    value.anchorDate || '',
    value.tags || '',
    Array.isArray(value.ratings) ? [...value.ratings].sort().join(',') : '',
    value.dimensionFilter || 'all',
    value.activeSmartCollection || '',
    value.activeFavoriteFolder || '',
    value.favoriteSearch || '',
    settings.galleryLayout || 'grid',
    settings.compactGrid ? 'compact' : 'comfortable',
    settings.blockedTags || ''
  ].map(part => encodeURIComponent(String(part))).join('|');
}

export function clampPreviewPan(x, y, zoom, viewportWidth, viewportHeight) {
  const scale = Math.max(1, Number(zoom) || 1);
  const maxX = Math.max(0, (Number(viewportWidth) || 0) * (scale - 1) / 2);
  const maxY = Math.max(0, (Number(viewportHeight) || 0) * (scale - 1) / 2);
  const boundedX = Math.min(maxX, Math.max(-maxX, Number(x) || 0));
  const boundedY = Math.min(maxY, Math.max(-maxY, Number(y) || 0));
  return {
    x: boundedX || 0,
    y: boundedY || 0
  };
}

export function previewSwipeStep(deltaX, deltaY, durationMs, zoom = 1) {
  const horizontal = Math.abs(Number(deltaX) || 0);
  const vertical = Math.abs(Number(deltaY) || 0);
  const duration = Number(durationMs) || 0;
  if (Number(zoom) > 1 || duration > 700 || horizontal < 56 || horizontal < vertical * 1.5) {
    return 0;
  }
  return deltaX < 0 ? 1 : -1;
}

export function normalizeDownloadConcurrency(value) {
  return Math.min(4, Math.max(1, Math.round(Number(value) || 2)));
}

export function normalizeDownloadNameTemplate(value) {
  return String(value || '').trim().replace(/[\r\n]+/g, ' ').slice(0, 100)
    || '{source}-{id}';
}

export function downloadFilename(post, template = '{source}-{id}') {
  let extension = String(post?.extension || '').replace(/^\./, '').toLowerCase();

  if (!extension && post?.file) {
    try {
      const pathname = new URL(post.file).pathname;
      extension = pathname.split('.').pop().toLowerCase();
    } catch {
      extension = '';
    }
  }

  if (!/^[a-z0-9]{2,5}$/.test(extension)) {
    extension = post?.type === 'video' ? 'mp4' : 'jpg';
  }

  const values = {
    source: post?.source || 'media',
    id: post?.id || Date.now(),
    type: post?.type || 'image',
    width: Number(post?.width) || 0,
    height: Number(post?.height) || 0
  };
  const baseName = normalizeDownloadNameTemplate(template)
    .replace(/\{(source|id|type|width|height)\}/g, (_, key) => String(values[key]))
    .replace(/\{[^{}]+\}/g, '')
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[-. ]+$/g, '')
    .slice(0, 160)
    || 'media';

  return `${baseName}.${extension}`;
}
