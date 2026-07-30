const assert = require('node:assert/strict');
const test = require('node:test');

test('site adapters build allowlisted API URLs', async () => {
  const { SOURCES, createQuery } = await import('../public/js/sites.js');
  const query = createQuery({
    page: 2,
    mediaType: 'image',
    tags: 'landscape -text',
    startDate: '2026-07-20',
    endDate: '2026-07-26'
  });

  assert.equal(Object.keys(SOURCES).length, 16);
  assert.equal(new URL(SOURCES.yandere.buildUrl(query)).hostname, 'yande.re');
  assert.equal(new URL(SOURCES.konachan.buildUrl(query)).pathname, '/post.json');
  assert.equal(new URL(SOURCES.konachanNet.buildUrl(query)).hostname, 'konachan.net');
  assert.equal(new URL(SOURCES.lolibooru.buildUrl(query)).hostname, 'lolibooru.moe');
  assert.equal(new URL(SOURCES.xbooru.buildUrl(query)).hostname, 'xbooru.com');
  assert.match(SOURCES.yandere.buildUrl(query).searchParams.get('tags'), /date:2026-07-20\.\.2026-07-26/);
  assert.match(SOURCES.gelbooru.buildUrl(query).searchParams.get('tags'), /-text/);
  assert.match(SOURCES.danbooru.buildUrl(query).searchParams.get('tags'), /filetype:jpg,jpeg,png,gif/);
  assert.equal(new URL(SOURCES.e621.buildUrl(query)).hostname, 'e621.net');
  assert.equal(new URL(SOURCES.e926.buildUrl(query)).hostname, 'e926.net');
  assert.equal(new URL(SOURCES.aibooru.buildUrl(query)).hostname, 'aibooru.online');
  assert.equal(new URL(SOURCES.sakugabooru.buildUrl(query)).hostname, 'sakugabooru.com');
  assert.equal(new URL(SOURCES.derpibooru.buildUrl(query)).pathname, '/api/v1/json/search/images');
  assert.equal(new URL(SOURCES.wallhaven.buildUrl(query)).hostname, 'wallhaven.cc');
  assert.equal(SOURCES.yandere.capabilities.image, true);
  assert.equal(SOURCES.yandere.capabilities.video, false);
  assert.equal(SOURCES.konachan.capabilities.video, false);
  assert.equal(SOURCES.xbooru.capabilities.video, true);
});

test('site adapters build and parse remote tag suggestions', async () => {
  const { SOURCES } = await import('../public/js/sites.js');

  assert.equal(new URL(SOURCES.yandere.buildTagUrl('blue')).pathname, '/tag.json');
  assert.equal(
    SOURCES.gelbooru.buildTagUrl('blue').searchParams.get('name_pattern'),
    '%blue%'
  );
  assert.equal(
    SOURCES.danbooru.buildTagUrl('blue').searchParams.get('search[name_matches]'),
    'blue*'
  );
  assert.equal(new URL(SOURCES.e621.buildTagUrl('blue')).hostname, 'e621.net');
  assert.equal(new URL(SOURCES.aibooru.buildTagUrl('blue')).hostname, 'aibooru.online');
  assert.equal(new URL(SOURCES.sakugabooru.buildTagUrl('blue')).hostname, 'sakugabooru.com');
  assert.equal(new URL(SOURCES.konachanNet.buildTagUrl('blue')).hostname, 'konachan.net');
  assert.equal(new URL(SOURCES.lolibooru.buildTagUrl('blue')).hostname, 'lolibooru.moe');
  assert.equal(new URL(SOURCES.xbooru.buildTagUrl('blue')).hostname, 'xbooru.com');
  assert.equal(SOURCES.sankaku.buildTagUrl, undefined);
  assert.deepEqual(
    SOURCES.danbooru.parseTags([{ name: 'blue_hair' }, { name: 'blue_eyes' }]),
    ['blue_hair', 'blue_eyes']
  );
  assert.deepEqual(
    SOURCES.gelbooru.parseTags({ tag: [{ name: 'blue_sky' }] }),
    ['blue_sky']
  );
});

test('new adapters normalize image and video payloads', async () => {
  const { SOURCES, createQuery } = await import('../public/js/sites.js');
  const videoQuery = createQuery({ page: 3, mediaType: 'video', tags: 'animated' });
  const imageQuery = createQuery({ page: 1, mediaType: 'image', tags: 'landscape -text' });

  assert.match(SOURCES.aibooru.buildUrl(videoQuery).searchParams.get('tags'), /filetype:mp4,webm/);
  assert.match(SOURCES.derpibooru.buildUrl(videoQuery).searchParams.get('q'), /format:webm/);
  assert.equal(SOURCES.wallhaven.buildUrl(imageQuery).searchParams.get('purity'), '100');

  const [aibooruPost] = SOURCES.aibooru.parse([{
    id: 41,
    score: 88,
    rating: 'g',
    image_width: 1280,
    image_height: 720,
    tag_string: 'animated original',
    preview_file_url: 'https://cdn.aibooru.download/preview.jpg',
    large_file_url: 'https://cdn.aibooru.download/sample.jpg',
    file_url: 'https://cdn.aibooru.download/file.webm',
    file_ext: 'webm'
  }]);
  assert.equal(aibooruPost.type, 'video');
  assert.equal(aibooruPost.postUrl, 'https://aibooru.online/posts/41');

  const [derpibooruPost] = SOURCES.derpibooru.parse({
    images: [{
      id: 42,
      score: 55,
      created_at: '2026-07-29T00:00:00Z',
      width: 1920,
      height: 1080,
      tags: ['safe', 'animated'],
      format: 'webm',
      representations: {
        thumb: 'https://derpicdn.net/img/thumb.jpg',
        large: 'https://derpicdn.net/img/large.webm',
        full: 'https://derpicdn.net/img/full.webm'
      }
    }]
  });
  assert.equal(derpibooruPost.type, 'video');
  assert.equal(derpibooruPost.rating, 'safe');

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
  assert.equal(wallhavenPost.rating, 'safe');
  assert.deepEqual(wallhavenPost.tags, ['Anime', 'Landscape']);

  const [xbooruPost] = SOURCES.xbooru.parse({
    post: [{
      id: 43,
      score: 21,
      rating: 'explicit',
      tags: 'animated video',
      preview_url: 'https://img.xbooru.com/preview.jpg',
      sample_url: 'https://img.xbooru.com/sample.jpg',
      file_url: 'https://img.xbooru.com/file.webm'
    }]
  });
  assert.equal(xbooruPost.type, 'video');
  assert.equal(xbooruPost.postUrl, 'https://xbooru.com/index.php?page=post&s=view&id=43');
});

test('e621 and e926 adapters flatten tags and normalize media metadata', async () => {
  const { SOURCES } = await import('../public/js/sites.js');
  const payload = {
    posts: [{
      id: 123,
      created_at: '2026-07-23T00:00:00.000Z',
      rating: 's',
      score: { total: 42 },
      tags: {
        general: ['blue_sky'],
        species: ['canine'],
        character: ['sample_character']
      },
      preview: { url: 'https://static.e621.net/preview.jpg' },
      sample: { url: 'https://static.e621.net/sample.jpg' },
      file: {
        url: 'https://static.e621.net/file.webm',
        ext: 'webm',
        width: 640,
        height: 360
      }
    }]
  };

  const e621Post = SOURCES.e621.parse(payload)[0];
  const e926Post = SOURCES.e926.parse(payload)[0];
  assert.deepEqual(e621Post.tags, ['blue_sky', 'canine', 'sample_character']);
  assert.equal(e621Post.type, 'video');
  assert.equal(e621Post.rating, 'safe');
  assert.equal(e926Post.rating, 'safe');
  assert.equal(e621Post.width, 640);
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
