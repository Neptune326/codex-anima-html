const assert = require('node:assert/strict');
const test = require('node:test');

test('remaining site adapters build allowlisted URLs with period and rating filters', async () => {
  const { SOURCES, createQuery } = await import('../public/js/sites.js');
  const query = createQuery({
    page: 2,
    mediaType: 'image',
    tags: 'landscape -text',
    ratings: ['safe'],
    startDate: '2026-07-20',
    endDate: '2026-07-26'
  });

  assert.deepEqual(Object.keys(SOURCES), [
    'yandere',
    'konachan',
    'konachanNet',
    'lolibooru',
    'danbooru',
    'aibooru',
    'sankaku',
    'safebooru',
    'rule34',
    'wallhaven'
  ]);

  for (const sourceId of ['yandere', 'konachan', 'konachanNet', 'lolibooru', 'danbooru', 'aibooru', 'sankaku', 'safebooru', 'rule34']) {
    assert.equal(SOURCES[sourceId].capabilities.date, true, `${sourceId} should support date filters`);
    assert.match(
      SOURCES[sourceId].buildUrl(query).searchParams.get('tags'),
      /date:2026-07-20\.\.2026-07-26/
    );
  }

  assert.equal(SOURCES.wallhaven.capabilities.date, false);
  assert.deepEqual(SOURCES.sankaku.capabilities.dateMediaTypes, ['image']);
  assert.equal(new URL(SOURCES.sankaku.buildUrl(query)).hostname, 'capi-v2.sankakucomplex.com');
  assert.equal(new URL(SOURCES.sankaku.buildUrl(query)).pathname, '/posts');
  assert.match(SOURCES.sankaku.buildUrl(query).searchParams.get('tags'), /rating:safe/);
  assert.match(SOURCES.danbooru.buildUrl(query).searchParams.get('tags'), /rating:g/);
  assert.doesNotMatch(SOURCES.danbooru.buildUrl(query).searchParams.get('tags'), /filetype:/);
  assert.match(SOURCES.rule34.buildUrl(query).searchParams.get('tags'), /rating:safe/);
  assert.doesNotMatch(SOURCES.rule34.buildUrl(query).searchParams.get('tags'), /-video/);
  assert.doesNotMatch(SOURCES.lolibooru.buildUrl(query).searchParams.get('tags'), /-video/);
});

test('remaining adapters build remote tag suggestions', async () => {
  const { SOURCES } = await import('../public/js/sites.js');

  assert.equal(new URL(SOURCES.yandere.buildTagUrl('blue')).pathname, '/tag.json');
  assert.equal(new URL(SOURCES.konachanNet.buildTagUrl('blue')).hostname, 'konachan.net');
  assert.equal(new URL(SOURCES.lolibooru.buildTagUrl('blue')).hostname, 'lolibooru.moe');
  assert.equal(
    SOURCES.danbooru.buildTagUrl('blue').searchParams.get('search[name_matches]'),
    'blue*'
  );
  assert.equal(new URL(SOURCES.aibooru.buildTagUrl('blue')).hostname, 'aibooru.online');
  assert.equal(
    SOURCES.rule34.buildTagUrl('blue').searchParams.get('name_pattern'),
    '%blue%'
  );
  assert.equal(SOURCES.sankaku.buildTagUrl, undefined);
  assert.deepEqual(
    SOURCES.danbooru.parseTags([{ name: 'blue_hair' }, { name: 'blue_eyes' }]),
    ['blue_hair', 'blue_eyes']
  );
});

test('image and video adapters normalize retained source payloads', async () => {
  const { SOURCES, createQuery } = await import('../public/js/sites.js');
  const videoQuery = createQuery({
    page: 3,
    mediaType: 'video',
    tags: 'animated',
    ratings: ['safe'],
    startDate: '2026-07-20',
    endDate: '2026-07-26'
  });

  assert.match(SOURCES.aibooru.buildUrl(videoQuery).searchParams.get('tags'), /filetype:mp4/);
  assert.match(SOURCES.danbooru.buildUrl(videoQuery).searchParams.get('tags'), /filetype:mp4/);
  assert.match(SOURCES.sankaku.buildUrl(videoQuery).searchParams.get('tags'), /video/);
  assert.equal(new URL(SOURCES.sankaku.buildUrl(videoQuery)).hostname, 'sankakuapi.com');
  assert.equal(SOURCES.sankaku.buildUrl(videoQuery).searchParams.get('lang'), 'en');
  assert.doesNotMatch(SOURCES.sankaku.buildUrl(videoQuery).searchParams.get('tags'), /date:/);
  assert.doesNotMatch(SOURCES.sankaku.buildUrl(videoQuery).searchParams.get('tags'), /rating:/);

  const [rule34Post] = SOURCES.rule34.parse({
    post: [{
      id: 40,
      score: 18,
      rating: 'safe',
      tags: 'landscape sky',
      preview_url: 'https://wimg.rule34.xxx/preview.jpg',
      sample_url: 'https://wimg.rule34.xxx/sample.jpg',
      file_url: 'https://wimg.rule34.xxx/file.jpg'
    }]
  });
  assert.equal(rule34Post.type, 'image');
  assert.equal(rule34Post.rating, 'safe');

  const [sankakuPost] = SOURCES.sankaku.parse([{
    id: 46,
    total_score: 72,
    rating: 'q',
    width: 1280,
    height: 720,
    tags: [{ name_en: 'animated' }],
    preview_url: 'https://v.sankakucomplex.com/preview.jpg',
    sample_url: 'https://v.sankakucomplex.com/sample.mp4',
    file_url: 'https://v.sankakucomplex.com/file.mp4',
    file_type: 'video/mp4; charset=binary'
  }]);
  assert.equal(sankakuPost.type, 'video');
  assert.equal(sankakuPost.extension, 'mp4');
  assert.deepEqual(sankakuPost.tags, ['animated']);

  const [wallhavenPost] = SOURCES.wallhaven.parse({
    data: [{
      id: 'abc123',
      favorites: 91,
      created_at: '2026-07-28T00:00:00Z',
      dimension_x: 3840,
      dimension_y: 2160,
      file_type: 'image/jpeg',
      path: 'https://w.wallhaven.cc/full/ab/wallhaven-abc123.jpg',
      url: 'https://wallhaven.cc/w/abc123',
      thumbs: {
        small: 'https://th.wallhaven.cc/small/ab/abc123.jpg',
        large: 'https://th.wallhaven.cc/lg/ab/abc123.jpg'
      },
      tags: [{ name: 'Anime' }, { name: 'Landscape' }]
    }]
  });
  assert.equal(wallhavenPost.type, 'image');
  assert.deepEqual(wallhavenPost.tags, ['Anime', 'Landscape']);
});

test('Danbooru sensitive content is not treated as safe', async () => {
  const { SOURCES } = await import('../public/js/sites.js');
  const [sensitive, explicit, general] = SOURCES.danbooru.parse([
    {
      id: 1,
      rating: 's',
      file_url: 'https://danbooru.donmai.us/data/one.jpg',
      preview_file_url: 'https://danbooru.donmai.us/data/one-preview.jpg',
      image_width: 100,
      image_height: 100,
      file_ext: 'jpg'
    },
    {
      id: 2,
      rating: 'e',
      file_url: 'https://danbooru.donmai.us/data/two.mp4',
      preview_file_url: 'https://danbooru.donmai.us/data/two-preview.jpg',
      image_width: 100,
      image_height: 100,
      file_ext: 'mp4'
    },
    {
      id: 3,
      rating: 'g',
      file_url: 'https://danbooru.donmai.us/data/three.png',
      preview_file_url: 'https://danbooru.donmai.us/data/three-preview.jpg',
      image_width: 100,
      image_height: 100,
      file_ext: 'png'
    }
  ]);

  assert.equal(sensitive.rating, 'questionable');
  assert.equal(explicit.rating, 'explicit');
  assert.equal(general.rating, 'safe');
  assert.equal(explicit.type, 'video');
});
