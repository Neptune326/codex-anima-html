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

  assert.equal(Object.keys(SOURCES).length, 9);
  assert.equal(new URL(SOURCES.yandere.buildUrl(query)).hostname, 'yande.re');
  assert.equal(new URL(SOURCES.konachan.buildUrl(query)).pathname, '/post.json');
  assert.match(SOURCES.yandere.buildUrl(query).searchParams.get('tags'), /date:2026-07-20\.\.2026-07-26/);
  assert.match(SOURCES.gelbooru.buildUrl(query).searchParams.get('tags'), /-text/);
  assert.match(SOURCES.danbooru.buildUrl(query).searchParams.get('tags'), /filetype:jpg,jpeg,png,gif/);
  assert.equal(new URL(SOURCES.e621.buildUrl(query)).hostname, 'e621.net');
  assert.equal(new URL(SOURCES.e926.buildUrl(query)).hostname, 'e926.net');
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
