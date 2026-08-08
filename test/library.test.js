const assert = require('node:assert/strict');
const test = require('node:test');

test('tag suggestions preserve exclusions and include translations', async () => {
  const { replaceCurrentTag, suggestTags, translateTag } = await import('../public/js/library.js');
  const suggestions = suggestTags('sky -blu', ['blue_eyes', 'blue_hair']);

  const blueHair = suggestions.find(suggestion => suggestion.tag === '-blue_hair');
  assert.ok(blueHair);
  assert.equal(blueHair.translation, '蓝发');
  assert.equal(translateTag('landscape'), '风景');
  assert.equal(replaceCurrentTag('sky -blu', '-blue_hair'), 'sky -blue_hair ');
});

test('smart collections require every tag and respect media type', async () => {
  const { matchesSmartCollection } = await import('../public/js/library.js');
  const post = {
    type: 'video',
    tags: ['landscape', 'sky', 'night']
  };

  assert.equal(matchesSmartCollection(post, {
    tags: 'landscape sky',
    mediaType: 'video'
  }), true);
  assert.equal(matchesSmartCollection(post, {
    tags: 'landscape city',
    mediaType: 'video'
  }), false);
  assert.equal(matchesSmartCollection(post, {
    tags: 'landscape',
    mediaType: 'image'
  }), false);
});

test('favorite search stays deterministic', async () => {
  const { matchesFavoriteSearch } = await import('../public/js/library.js');
  const post = {
    source: 'danbooru',
    id: '42',
    type: 'video',
    file: 'https://cdn.example.test/original.mp4',
    sample: 'https://cdn.example.test/sample.webm',
    preview: 'https://cdn.example.test/poster.jpg',
    tags: ['night', 'blue_hair'],
    favoriteFolder: '视频',
    favoriteLabels: ['待整理'],
    favoriteNote: '测试收藏'
  };

  assert.equal(matchesFavoriteSearch(post, 'blue_hair 待整理'), true);
  assert.equal(matchesFavoriteSearch(post, 'wallpaper'), false);
});

test('download filenames use normalized source, id and extension', async () => {
  const { downloadFilename } = await import('../public/js/library.js');

  assert.equal(downloadFilename({
    source: 'danbooru',
    id: '42',
    extension: 'PNG'
  }), 'danbooru-42.png');
  assert.equal(downloadFilename({
    source: 'danbooru',
    id: '7',
    type: 'video',
    file: 'https://cdn.donmai.us/data/sample.webm?x=1'
  }), 'danbooru-7.webm');
  assert.equal(downloadFilename({
    source: 'sankaku',
    id: '8/9',
    type: 'video',
    width: 1920,
    height: 1080,
    extension: 'webm'
  }, '{source}_{type}_{width}x{height}_{id}'), 'sankaku_video_1920x1080_8-9.webm');
  assert.equal(downloadFilename({ id: '10' }, '../{id}:{unknown}'), '..-10.jpg');
});

test('tag blacklist matches normalized tags and download settings are bounded', async () => {
  const {
    matchesBlockedTags,
    normalizeDownloadConcurrency,
    normalizeDownloadNameTemplate
  } = await import('../public/js/library.js');

  assert.equal(matchesBlockedTags({ tags: ['Blue Hair', 'night_sky'] }, 'blue_hair'), true);
  assert.equal(matchesBlockedTags({ tags: ['landscape', 'night_sky'] }, 'text watermark'), false);
  assert.equal(normalizeDownloadConcurrency(0), 2);
  assert.equal(normalizeDownloadConcurrency(9), 4);
  assert.equal(normalizeDownloadConcurrency(1.4), 1);
  assert.equal(normalizeDownloadNameTemplate(''), '{source}-{id}');
  assert.equal(normalizeDownloadNameTemplate('  {source}\n{id}  '), '{source} {id}');
});

test('dimension filters and media identities are deterministic', async () => {
  const { matchesDimension, mediaIdentity } = await import('../public/js/library.js');

  assert.equal(matchesDimension({ width: 1920, height: 1080 }, 'landscape'), true);
  assert.equal(matchesDimension({ width: 1080, height: 1920 }, 'portrait'), true);
  assert.equal(matchesDimension({ width: 1000, height: 1040 }, 'square'), true);
  assert.equal(matchesDimension({ width: 2560, height: 900 }, 'large'), true);
  assert.equal(matchesDimension({ width: 1920, height: 1080 }, 'large'), false);
  assert.equal(
    mediaIdentity({ file: 'https://CDN.EXAMPLE.com/media/a.jpg?token=1' }),
    'cdn.example.com/media/a.jpg'
  );
});

test('gallery view keys isolate scroll positions and preview panning stays bounded', async () => {
  const { clampPreviewPan, effectiveGalleryLayout, galleryViewKey } = await import('../public/js/library.js');
  const baseState = {
    view: 'popular',
    source: 'danbooru',
    mediaType: 'image',
    period: 'week',
    anchorDate: '2026-08-04',
    tags: 'landscape',
    ratings: ['safe'],
    dimensionFilter: 'all',
    settings: { galleryLayout: 'grid', compactGrid: false, blockedTags: '' }
  };

  assert.equal(galleryViewKey(baseState), galleryViewKey({ ...baseState }));
  assert.notEqual(galleryViewKey(baseState), galleryViewKey({ ...baseState, view: 'favorites' }));
  assert.notEqual(galleryViewKey(baseState), galleryViewKey({
    ...baseState,
    settings: { ...baseState.settings, galleryLayout: 'masonry' }
  }));
  assert.equal(effectiveGalleryLayout('image', 'masonry'), 'masonry');
  assert.equal(effectiveGalleryLayout('video', 'masonry'), 'grid');
  assert.equal(galleryViewKey({
    ...baseState,
    mediaType: 'video',
    settings: { ...baseState.settings, galleryLayout: 'masonry' }
  }), galleryViewKey({
    ...baseState,
    mediaType: 'video',
    settings: { ...baseState.settings, galleryLayout: 'grid' }
  }));
  assert.deepEqual(clampPreviewPan(900, -500, 2, 800, 600), { x: 400, y: -300 });
  assert.deepEqual(clampPreviewPan(120, -80, 1, 800, 600), { x: 0, y: 0 });
});

test('preview swipe detection only accepts deliberate horizontal gestures', async () => {
  const { previewSwipeStep } = await import('../public/js/library.js');

  assert.equal(previewSwipeStep(-120, 12, 260, 1), 1);
  assert.equal(previewSwipeStep(120, 12, 260, 1), -1);
  assert.equal(previewSwipeStep(-120, 90, 260, 1), 0);
  assert.equal(previewSwipeStep(-120, 12, 260, 2), 0);
  assert.equal(previewSwipeStep(-30, 4, 260, 1), 0);
});

test('nextVideoIndex skips images and finds the next playable video', async () => {
  const { nextVideoIndex } = await import('../public/js/library.js');
  const posts = [
    { type: 'video' },
    { type: 'image' },
    { type: 'video' },
    { type: 'image' }
  ];

  assert.equal(nextVideoIndex(posts, 0), 2);
  assert.equal(nextVideoIndex(posts, 2), -1);
  assert.equal(nextVideoIndex(null, 0), -1);
});

test('fallback library is authoritative until it is migrated to IndexedDB', async () => {
  const { DEFAULT_STATE, resolveLibrarySnapshot } = await import('../public/js/storage.js');
  assert.equal(DEFAULT_STATE.settings.hideDetails, true);
  assert.equal(DEFAULT_STATE.settings.autoplay, true);
  assert.equal(DEFAULT_STATE.settings.videoAutoNext, true);
  assert.equal(DEFAULT_STATE.settings.videoMuted, false);
  assert.equal(DEFAULT_STATE.settings.videoLoop, false);
  assert.equal(DEFAULT_STATE.settings.videoPlaybackRate, 1);
  assert.equal(DEFAULT_STATE.settings.videoPlaybackRateEnabled, true);
  assert.equal(DEFAULT_STATE.settings.showPreviewGallery, false);
  assert.equal(DEFAULT_STATE.settings.showPreviewFavorite, true);
  assert.equal(DEFAULT_STATE.settings.blurSensitive, false);
  assert.equal(DEFAULT_STATE.settings.compactGrid, false);
  assert.deepEqual(DEFAULT_STATE.ratings, ['safe', 'questionable', 'explicit']);
  assert.equal(Object.hasOwn(DEFAULT_STATE.settings, 'showPreviewWatchLater'), false);
  assert.equal(Object.hasOwn(DEFAULT_STATE.settings, 'reduceMotion'), false);
  assert.deepEqual(DEFAULT_STATE.favoriteFolders, []);
  const databaseLibrary = {
    favorites: { old: { id: 'old' } },
    history: { old: { id: 'old' } }
  };
  const fallbackLibrary = {
    favorites: {},
    history: { recent: { id: 'recent' } }
  };

  assert.deepEqual(
    resolveLibrarySnapshot(databaseLibrary, fallbackLibrary, databaseLibrary),
    fallbackLibrary
  );
  assert.deepEqual(
    resolveLibrarySnapshot({ favorites: {}, history: {} }, null, databaseLibrary),
    databaseLibrary
  );
});

test('library export and import preserve favorite folders', async () => {
  const { exportLibrary, importLibrary } = await import('../public/js/storage.js');
  const state = {
    favorites: {
      'danbooru:1': { source: 'danbooru', id: '1', favoriteFolder: '待整理' }
    },
    favoriteFolders: ['待整理'],
    history: {},
    savedSearches: [],
    smartCollections: [],
    watchLater: {}
  };
  const payload = JSON.parse(exportLibrary(state));
  assert.equal(payload.version, 5);
  const imported = importLibrary(JSON.stringify(payload), {
    ...state,
    favorites: {},
    favoriteFolders: []
  });
  assert.equal(imported.favorites['danbooru:1'].favoriteFolder, '待整理');
  assert.deepEqual(imported.favoriteFolders, ['待整理']);
});

test('request retry policy only retries transient failures', async () => {
  const { retryDelay, shouldRetryRequest } = await import('../public/js/library.js');

  assert.equal(shouldRetryRequest(undefined), true);
  assert.equal(shouldRetryRequest(429), true);
  assert.equal(shouldRetryRequest(503), true);
  assert.equal(shouldRetryRequest(400), false);
  assert.equal(shouldRetryRequest(403), false);
  assert.equal(retryDelay(1), 500);
  assert.equal(retryDelay(2), 1500);
});

test('Pixiv artwork parser accepts IDs and official artwork URLs only', async () => {
  const { parsePixivArtworkId } = await import('../public/js/library.js');

  assert.equal(parsePixivArtworkId('12345678'), '12345678');
  assert.equal(
    parsePixivArtworkId('https://www.pixiv.net/artworks/12345678'),
    '12345678'
  );
  assert.equal(
    parsePixivArtworkId('https://www.pixiv.net/en/artworks/987654321/'),
    '987654321'
  );
  assert.equal(parsePixivArtworkId('https://example.com/artworks/12345678'), '');
  assert.equal(parsePixivArtworkId('https://www.pixiv.net/users/12345678'), '');
  assert.equal(parsePixivArtworkId('not-an-artwork'), '');
});

test('media type filters sources and repairs incompatible selections', async () => {
  const {
    compatibleSourceId,
    sourceIdsForMedia,
    sourceSupportsMedia
  } = await import('../public/js/library.js');
  const sources = {
    imageOnly: { capabilities: { image: true, video: false } },
    mixed: { capabilities: { image: true, video: true } },
    videoOnly: { capabilities: { image: false, video: true } }
  };

  assert.equal(sourceSupportsMedia(sources.imageOnly, 'image'), true);
  assert.equal(sourceSupportsMedia(sources.imageOnly, 'video'), false);
  assert.deepEqual(sourceIdsForMedia(sources, 'image'), ['imageOnly', 'mixed']);
  assert.deepEqual(sourceIdsForMedia(sources, 'video'), ['mixed', 'videoOnly']);
  assert.equal(compatibleSourceId(sources, 'imageOnly', 'video'), 'mixed');
  assert.equal(compatibleSourceId(sources, 'videoOnly', 'video'), 'videoOnly');
});

test('download queue recovery pauses interrupted work and removes invalid entries', async () => {
  const { normalizeDownloadQueue } = await import('../public/js/storage.js');
  const post = { id: '1', source: 'danbooru', file: 'https://cdn.donmai.us/a.jpg' };
  const queue = normalizeDownloadQueue([
    { id: 1, post, filename: 'a.jpg', status: 'running' },
    { id: 2, post, filename: 'b.jpg', status: 'pending' },
    { id: 3, post, filename: 'c.jpg', status: 'error', error: 'HTTP 502' },
    { id: 4, post: {}, filename: 'invalid.jpg', status: 'pending' }
  ]);

  assert.equal(queue.length, 3);
  assert.equal(queue[0].status, 'paused');
  assert.equal(queue[1].status, 'paused');
  assert.equal(queue[2].status, 'error');
  assert.match(queue[0].error, /页面刷新/);
});
