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

test('download filenames use normalized source, id and extension', async () => {
  const { downloadFilename } = await import('../public/js/library.js');

  assert.equal(downloadFilename({
    source: 'danbooru',
    id: '42',
    extension: 'PNG'
  }), 'danbooru-42.png');
  assert.equal(downloadFilename({
    source: 'e621',
    id: '7',
    type: 'video',
    file: 'https://static1.e621.net/data/sample.webm?x=1'
  }), 'e621-7.webm');
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

test('fallback library is authoritative until it is migrated to IndexedDB', async () => {
  const { resolveLibrarySnapshot } = await import('../public/js/storage.js');
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
