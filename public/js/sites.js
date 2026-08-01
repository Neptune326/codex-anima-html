export const PAGE_SIZE = 40;

const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'm4v']);

function absoluteUrl(value, baseUrl) {
  if (!value) {
    return '';
  }

  try {
    const url = new URL(String(value).replace(/^http:/i, 'https:'), baseUrl);
    return url.href.replace(/^http:/i, 'https:');
  } catch {
    return '';
  }
}

function normalizeDate(value) {
  if (!value) {
    return '';
  }

  const numericValue = Number(value);
  const date = Number.isFinite(numericValue) && numericValue > 0
    ? new Date(numericValue < 100000000000 ? numericValue * 1000 : numericValue)
    : new Date(value);

  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function normalizeTags(value) {
  if (Array.isArray(value)) {
    return value
      .map(tag => typeof tag === 'string' ? tag : tag?.name_en || tag?.name)
      .filter(Boolean);
  }

  return String(value || '')
    .split(/\s+/)
    .filter(Boolean);
}

function normalizeRating(value, sourceId, forceSafe = false) {
  if (forceSafe) {
    return 'safe';
  }

  const rating = String(value || '').toLowerCase();

  if (sourceId === 'danbooru') {
    if (['s', 'sensitive', 'q', 'questionable'].includes(rating)) {
      return 'questionable';
    }

    if (['e', 'explicit'].includes(rating)) {
      return 'explicit';
    }

    return 'safe';
  }

  if (['q', 'questionable', 'sensitive'].includes(rating)) {
    return 'questionable';
  }

  if (['e', 'explicit'].includes(rating)) {
    return 'explicit';
  }

  return 'safe';
}

function fileExtension(url, explicitExtension = '') {
  if (explicitExtension) {
    return String(explicitExtension).toLowerCase().replace(/^\./, '');
  }

  try {
    const pathname = new URL(url).pathname;
    return pathname.split('.').pop().toLowerCase();
  } catch {
    return '';
  }
}

export function normalizePost(sourceId, rawPost) {
  const source = SOURCES[sourceId];
  const file = absoluteUrl(rawPost.file, source.home);
  const sample = absoluteUrl(rawPost.sample, source.home) || file;
  const preview = absoluteUrl(rawPost.preview, source.home) || sample;
  const extension = fileExtension(file, rawPost.extension);

  return {
    source: sourceId,
    id: String(rawPost.id),
    score: Number(rawPost.score) || 0,
    rating: normalizeRating(rawPost.rating, sourceId, rawPost.forceSafe),
    createdAt: normalizeDate(rawPost.createdAt),
    width: Number(rawPost.width) || 0,
    height: Number(rawPost.height) || 0,
    tags: normalizeTags(rawPost.tags),
    preview,
    sample,
    file,
    postUrl: absoluteUrl(rawPost.postUrl, source.home),
    type: VIDEO_EXTENSIONS.has(extension) ? 'video' : 'image',
    extension
  };
}

function addSearchParams(url, values) {
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });
  return url;
}

function joinTags(query, extraTags = []) {
  return [
    ...extraTags,
    ...query.includeTags,
    ...query.excludeTags.map(tag => `-${tag}`)
  ].filter(Boolean).join(' ');
}

function parseGelbooruPayload(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  return Array.isArray(payload?.post) ? payload.post : [];
}

function parseTagRows(payload) {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.tag) ? payload.tag : [];

  return rows
    .map(tag => typeof tag === 'string' ? tag : tag?.name)
    .filter(Boolean);
}

function buildMoebooruTagUrl(baseUrl, query) {
  return addSearchParams(new URL(baseUrl), {
    limit: 12,
    order: 'count',
    name: `${query}*`
  });
}

function buildGelbooruTagUrl(baseUrl, query) {
  return addSearchParams(new URL(baseUrl), {
    page: 'dapi',
    s: 'tag',
    q: 'index',
    json: 1,
    limit: 12,
    orderby: 'count',
    name_pattern: `%${query}%`
  });
}

function buildDanbooruTagUrl(baseUrl, query) {
  return addSearchParams(new URL(baseUrl), {
    limit: 12,
    'search[name_matches]': `${query}*`,
    'search[order]': 'count'
  });
}

function parseMoebooru(sourceId, payload) {
  return (Array.isArray(payload) ? payload : []).map(post => normalizePost(sourceId, {
    id: post.id,
    score: post.score,
    rating: post.rating,
    createdAt: post.created_at,
    width: post.width,
    height: post.height,
    tags: post.tags,
    preview: post.preview_url,
    sample: post.sample_url,
    file: post.file_url,
    postUrl: `${SOURCES[sourceId].home}post/show/${post.id}`,
    extension: post.file_ext
  }));
}

function parseGelbooru(sourceId, payload, forceSafe = false) {
  return parseGelbooruPayload(payload).map(post => normalizePost(sourceId, {
    id: post.id,
    score: post.score,
    rating: post.rating,
    createdAt: post.created_at || post.change,
    width: post.width,
    height: post.height,
    tags: post.tags,
    preview: post.preview_url,
    sample: post.sample_url || post.file_url,
    file: post.file_url,
    postUrl: `${SOURCES[sourceId].home}index.php?page=post&s=view&id=${post.id}`,
    forceSafe
  }));
}

function buildMoebooruUrl(baseUrl, query, supportsDate) {
  const url = new URL(baseUrl);
  const mediaTag = query.mediaType === 'video' ? 'video' : '-video';
  const dateTag = supportsDate ? `date:${query.startDate}..${query.endDate}` : '';

  return addSearchParams(url, {
    limit: PAGE_SIZE,
    page: query.page,
    tags: joinTags(query, ['order:score', mediaTag, dateTag])
  });
}

function buildGelbooruUrl(baseUrl, query, mediaFilter = true) {
  const url = new URL(baseUrl);
  const mediaTag = mediaFilter
    ? query.mediaType === 'video' ? 'video' : '-video'
    : '';

  return addSearchParams(url, {
    page: 'dapi',
    s: 'post',
    q: 'index',
    json: 1,
    limit: PAGE_SIZE,
    pid: query.page - 1,
    tags: joinTags(query, ['sort:score:desc', mediaTag])
  });
}

function parseE6Tags(tags) {
  if (!tags || typeof tags !== 'object') {
    return [];
  }

  return Object.values(tags)
    .filter(Array.isArray)
    .flat()
    .filter(Boolean);
}

function parseE6(sourceId, payload) {
  const posts = Array.isArray(payload?.posts) ? payload.posts : [];

  return posts.map(post => normalizePost(sourceId, {
    id: post.id,
    score: post.score?.total,
    rating: post.rating,
    createdAt: post.created_at,
    width: post.file?.width,
    height: post.file?.height,
    tags: parseE6Tags(post.tags),
    preview: post.preview?.url,
    sample: post.sample?.url,
    file: post.file?.url,
    postUrl: `${SOURCES[sourceId].home}posts/${post.id}`,
    extension: post.file?.ext,
    forceSafe: sourceId === 'e926'
  }));
}

function buildE6Url(baseUrl, query) {
  return addSearchParams(new URL(baseUrl), {
    limit: PAGE_SIZE,
    page: query.page,
    tags: joinTags(query, [
      'order:score',
      query.mediaType === 'video' ? 'type:webm' : '-type:webm'
    ])
  });
}

function tbibAssetUrl(post, folder, prefix = '') {
  if (!post?.directory || !post?.image) {
    return '';
  }

  return `https://tbib.org/${folder}/${post.directory}/${prefix}${post.image}`;
}

function parseTbib(payload) {
  return parseGelbooruPayload(payload).map(post => normalizePost('tbib', {
    id: post.id,
    score: post.score,
    rating: post.rating,
    createdAt: post.change,
    width: post.width,
    height: post.height,
    tags: post.tags,
    preview: tbibAssetUrl(post, 'thumbnails', 'thumbnail_'),
    sample: post.sample
      ? tbibAssetUrl(post, 'samples', 'sample_')
      : tbibAssetUrl(post, 'images'),
    file: tbibAssetUrl(post, 'images'),
    postUrl: `https://tbib.org/index.php?page=post&s=view&id=${post.id}`
  }));
}

function buildDanbooruUrl(baseUrl, query) {
  const url = new URL(baseUrl);
  const mediaTag = query.mediaType === 'video'
    ? 'filetype:mp4,webm'
    : 'filetype:jpg,jpeg,png,gif';

  return addSearchParams(url, {
    limit: PAGE_SIZE,
    page: query.page,
    tags: joinTags(query, ['order:score_desc', mediaTag])
  });
}

function parseDanbooru(sourceId, payload) {
  return (Array.isArray(payload) ? payload : []).map(post => normalizePost(sourceId, {
    id: post.id,
    score: post.score,
    rating: post.rating,
    createdAt: post.created_at,
    width: post.image_width,
    height: post.image_height,
    tags: post.tag_string,
    preview: post.preview_file_url,
    sample: post.large_file_url || post.file_url,
    file: post.file_url,
    postUrl: `${SOURCES[sourceId].home}posts/${post.id}`,
    extension: post.file_ext
  }));
}

function buildDerpibooruUrl(query) {
  const mediaFilter = query.mediaType === 'video' ? 'format:webm' : '-format:webm';
  const search = joinTags(query, [mediaFilter]).replace(/\s+/g, ',');

  return addSearchParams(new URL('https://derpibooru.org/api/v1/json/search/images'), {
    q: search,
    page: query.page,
    per_page: PAGE_SIZE,
    sf: 'score',
    sd: 'desc'
  });
}

function parseDerpibooru(payload) {
  const images = Array.isArray(payload?.images) ? payload.images : [];

  return images.map(post => normalizePost('derpibooru', {
    id: post.id,
    score: post.score,
    rating: Array.isArray(post.tags) && post.tags.includes('explicit')
      ? 'explicit'
      : Array.isArray(post.tags) && post.tags.some(tag => ['suggestive', 'questionable'].includes(tag))
        ? 'questionable'
        : 'safe',
    createdAt: post.created_at,
    width: post.width,
    height: post.height,
    tags: post.tags,
    preview: post.representations?.thumb || post.representations?.small,
    sample: post.representations?.large || post.representations?.medium,
    file: post.representations?.full || post.view_url,
    postUrl: `https://derpibooru.org/images/${post.id}`,
    extension: post.format
  }));
}

function buildPhilomenaUrl(baseUrl, query, apiPath = '/api/v1/json/search/images') {
  const mediaFilter = query.mediaType === 'video' ? 'format:webm' : '-format:webm';
  const search = joinTags(query, [mediaFilter]).replace(/\s+/g, ',');

  return addSearchParams(new URL(apiPath, baseUrl), {
    q: search,
    page: query.page,
    per_page: PAGE_SIZE,
    sf: 'score',
    sd: 'desc'
  });
}

function parsePhilomena(sourceId, payload, collectionKey = 'images', postPath = 'images') {
  const posts = Array.isArray(payload?.[collectionKey]) ? payload[collectionKey] : [];

  return posts.map(post => normalizePost(sourceId, {
    id: post.id,
    score: post.score,
    rating: Array.isArray(post.tags) && post.tags.includes('explicit')
      ? 'explicit'
      : Array.isArray(post.tags) && post.tags.some(tag => ['suggestive', 'questionable'].includes(tag))
        ? 'questionable'
        : 'safe',
    createdAt: post.created_at,
    width: post.width,
    height: post.height,
    tags: post.tags,
    preview: post.representations?.thumb || post.representations?.small,
    sample: post.representations?.large || post.representations?.medium,
    file: post.representations?.full || post.view_url,
    postUrl: `${SOURCES[sourceId].home}${postPath}/${post.id}`,
    extension: post.format
  }));
}

function buildTwibooruUrl(query) {
  const mediaFilter = query.mediaType === 'video' ? 'webm' : '-webm';
  const search = joinTags(query, [mediaFilter]).replace(/\s+/g, ',');

  return addSearchParams(new URL('https://twibooru.org/api/v3/search/posts'), {
    q: search,
    page: query.page,
    per_page: PAGE_SIZE,
    sf: 'score',
    sd: 'desc'
  });
}

function buildWallhavenUrl(query) {
  return addSearchParams(new URL('https://wallhaven.cc/api/v1/search'), {
    q: joinTags(query),
    page: query.page,
    sorting: 'toplist',
    order: 'desc',
    purity: '100'
  });
}

function parseWallhaven(payload) {
  const images = Array.isArray(payload?.data) ? payload.data : [];

  return images.map(post => normalizePost('wallhaven', {
    id: post.id,
    score: post.favorites,
    rating: 'safe',
    createdAt: post.created_at,
    width: post.dimension_x,
    height: post.dimension_y,
    tags: post.tags,
    preview: post.thumbs?.small,
    sample: post.thumbs?.large || post.thumbs?.original,
    file: post.path,
    postUrl: post.url || post.short_url,
    extension: String(post.file_type || '').split('/').pop(),
    forceSafe: true
  }));
}

export const SOURCES = {
  yandere: {
    name: 'yande.re',
    shortName: 'Yande',
    home: 'https://yande.re/',
    description: '插画与动漫图片站',
    capabilities: { image: true, date: true, video: false },
    buildUrl(query) {
      return buildMoebooruUrl('https://yande.re/post.json', query, true);
    },
    buildTagUrl(query) {
      return buildMoebooruTagUrl('https://yande.re/tag.json', query);
    },
    parseTags: parseTagRows,
    parse(payload) {
      return parseMoebooru('yandere', payload);
    }
  },
  konachan: {
    name: 'Konachan',
    shortName: 'Konachan',
    home: 'https://konachan.com/',
    description: '壁纸与高分辨率插画',
    capabilities: { image: true, date: false, video: false },
    buildUrl(query) {
      return buildMoebooruUrl('https://konachan.com/post.json', query, false);
    },
    buildTagUrl(query) {
      return buildMoebooruTagUrl('https://konachan.com/tag.json', query);
    },
    parseTags: parseTagRows,
    parse(payload) {
      return parseMoebooru('konachan', payload);
    }
  },
  konachanNet: {
    name: 'Konachan.net',
    shortName: 'Konachan.net',
    home: 'https://konachan.net/',
    description: 'Konachan 全年龄插画与壁纸站',
    capabilities: { image: true, date: false, video: false },
    buildUrl(query) {
      return buildMoebooruUrl('https://konachan.net/post.json', query, false);
    },
    buildTagUrl(query) {
      return buildMoebooruTagUrl('https://konachan.net/tag.json', query);
    },
    parseTags: parseTagRows,
    parse(payload) {
      return parseMoebooru('konachanNet', payload);
    }
  },
  lolibooru: {
    name: 'Lolibooru',
    shortName: 'Lolibooru',
    home: 'https://lolibooru.moe/',
    description: 'Moebooru 协议动漫插画图库',
    capabilities: { image: true, date: false, video: false },
    buildUrl(query) {
      return buildMoebooruUrl('https://lolibooru.moe/post.json', query, false);
    },
    buildTagUrl(query) {
      return buildMoebooruTagUrl('https://lolibooru.moe/tag.json', query);
    },
    parseTags: parseTagRows,
    parse(payload) {
      return parseMoebooru('lolibooru', payload);
    }
  },
  gelbooru: {
    name: 'Gelbooru',
    shortName: 'Gelbooru',
    home: 'https://gelbooru.com/',
    description: '大型标签化媒体图库',
    capabilities: { image: true, date: false, video: true },
    buildUrl(query) {
      return buildGelbooruUrl('https://gelbooru.com/index.php', query);
    },
    buildTagUrl(query) {
      return buildGelbooruTagUrl('https://gelbooru.com/index.php', query);
    },
    parseTags: parseTagRows,
    parse(payload) {
      return parseGelbooru('gelbooru', payload);
    }
  },
  xbooru: {
    name: 'Xbooru',
    shortName: 'Xbooru',
    home: 'https://xbooru.com/',
    description: 'Gelbooru 协议图片与视频图库',
    capabilities: { image: true, date: false, video: true },
    buildUrl(query) {
      return buildGelbooruUrl('https://xbooru.com/index.php', query);
    },
    buildTagUrl(query) {
      return buildGelbooruTagUrl('https://xbooru.com/index.php', query);
    },
    parseTags: parseTagRows,
    parse(payload) {
      return parseGelbooru('xbooru', payload);
    }
  },
  hypnohub: {
    name: 'Hypnohub',
    shortName: 'Hypnohub',
    home: 'https://hypnohub.net/',
    description: 'Gelbooru 协议标签化图片与视频图库',
    capabilities: { image: true, date: false, video: true },
    buildUrl(query) {
      return buildGelbooruUrl('https://hypnohub.net/index.php', query);
    },
    buildTagUrl(query) {
      return buildGelbooruTagUrl('https://hypnohub.net/index.php', query);
    },
    parseTags: parseTagRows,
    parse(payload) {
      return parseGelbooru('hypnohub', payload);
    }
  },
  tbib: {
    name: 'The Big ImageBoard',
    shortName: 'TBIB',
    home: 'https://tbib.org/',
    description: '大型动漫标签图片索引站',
    capabilities: { image: true, date: false, video: false },
    buildUrl(query) {
      return buildGelbooruUrl('https://tbib.org/index.php', query, false);
    },
    buildTagUrl(query) {
      return buildGelbooruTagUrl('https://tbib.org/index.php', query);
    },
    parseTags: parseTagRows,
    parse: parseTbib
  },
  danbooru: {
    name: 'Danbooru',
    shortName: 'Danbooru',
    home: 'https://danbooru.donmai.us/',
    description: '标签体系完整的动漫图库',
    capabilities: { image: true, date: false, video: true },
    buildUrl(query) {
      return buildDanbooruUrl('https://danbooru.donmai.us/posts.json', query);
    },
    buildTagUrl(query) {
      return buildDanbooruTagUrl('https://danbooru.donmai.us/tags.json', query);
    },
    parseTags: parseTagRows,
    parse(payload) {
      return parseDanbooru('danbooru', payload);
    }
  },
  aibooru: {
    name: 'AIBooru',
    shortName: 'AIBooru',
    home: 'https://aibooru.online/',
    description: 'AI 生成作品标签图库',
    capabilities: { image: true, date: false, video: true },
    buildUrl(query) {
      return buildDanbooruUrl('https://aibooru.online/posts.json', query);
    },
    buildTagUrl(query) {
      return buildDanbooruTagUrl('https://aibooru.online/tags.json', query);
    },
    parseTags: parseTagRows,
    parse(payload) {
      return parseDanbooru('aibooru', payload);
    }
  },
  sankaku: {
    name: 'Sankaku Channel',
    shortName: 'Sankaku',
    home: 'https://chan.sankakucomplex.com/',
    description: 'Sankaku Complex 媒体频道',
    capabilities: { image: true, date: false, video: true },
    buildUrl(query) {
      const url = new URL('https://capi-v2.sankakucomplex.com/posts');
      return addSearchParams(url, {
        limit: PAGE_SIZE,
        page: query.page,
        tags: joinTags(query, [
          'order:popular',
          query.mediaType === 'video' ? 'video' : ''
        ])
      });
    },
    parse(payload) {
      const posts = Array.isArray(payload) ? payload : payload?.data || [];

      return posts.map(post => normalizePost('sankaku', {
        id: post.id,
        score: post.total_score ?? post.score,
        rating: post.rating,
        createdAt: post.created_at,
        width: post.width,
        height: post.height,
        tags: post.tags,
        preview: post.preview_url || post.preview?.url,
        sample: post.sample_url || post.sample?.url,
        file: post.file_url || post.file?.url,
        postUrl: `https://chan.sankakucomplex.com/post/show/${post.id}`,
        extension: post.file_type || post.file?.type
      }));
    }
  },
  safebooru: {
    name: 'Safebooru',
    shortName: 'Safebooru',
    home: 'https://safebooru.org/',
    description: '全年龄标签化图库',
    capabilities: { image: true, date: false, video: false },
    buildUrl(query) {
      return buildGelbooruUrl('https://safebooru.org/index.php', query, false);
    },
    buildTagUrl(query) {
      return buildGelbooruTagUrl('https://safebooru.org/index.php', query);
    },
    parseTags: parseTagRows,
    parse(payload) {
      return parseGelbooru('safebooru', payload, true);
    }
  },
  rule34: {
    name: 'Rule34',
    shortName: 'Rule34',
    home: 'https://rule34.xxx/',
    description: '标签化图片与视频图库',
    capabilities: { image: true, date: false, video: true },
    buildUrl(query) {
      return buildGelbooruUrl('https://api.rule34.xxx/index.php', query);
    },
    buildTagUrl(query) {
      return buildGelbooruTagUrl('https://api.rule34.xxx/index.php', query);
    },
    parseTags: parseTagRows,
    parse(payload) {
      return parseGelbooru('rule34', payload);
    }
  },
  e621: {
    name: 'e621',
    shortName: 'e621',
    home: 'https://e621.net/',
    description: '细分标签媒体图库',
    capabilities: { image: true, date: false, video: true },
    buildUrl(query) {
      return buildE6Url('https://e621.net/posts.json', query);
    },
    buildTagUrl(query) {
      return buildDanbooruTagUrl('https://e621.net/tags.json', query);
    },
    parseTags: parseTagRows,
    parse(payload) {
      return parseE6('e621', payload);
    }
  },
  e926: {
    name: 'e926',
    shortName: 'e926',
    home: 'https://e926.net/',
    description: 'e621 的全年龄内容镜像',
    capabilities: { image: true, date: false, video: true },
    buildUrl(query) {
      return buildE6Url('https://e926.net/posts.json', query);
    },
    buildTagUrl(query) {
      return buildDanbooruTagUrl('https://e926.net/tags.json', query);
    },
    parseTags: parseTagRows,
    parse(payload) {
      return parseE6('e926', payload);
    }
  },
  e6ai: {
    name: 'e6AI',
    shortName: 'e6AI',
    home: 'https://e6ai.net/',
    description: 'AI 生成作品的细分标签媒体图库',
    capabilities: { image: true, date: false, video: true },
    buildUrl(query) {
      return buildE6Url('https://e6ai.net/posts.json', query);
    },
    buildTagUrl(query) {
      return buildDanbooruTagUrl('https://e6ai.net/tags.json', query);
    },
    parseTags: parseTagRows,
    parse(payload) {
      return parseE6('e6ai', payload);
    }
  },
  sakugabooru: {
    name: 'Sakugabooru',
    shortName: 'Sakuga',
    home: 'https://sakugabooru.com/',
    description: '动画作画片段与原画媒体库',
    capabilities: { image: true, date: false, video: true },
    buildUrl(query) {
      return buildMoebooruUrl('https://sakugabooru.com/post.json', query, false);
    },
    buildTagUrl(query) {
      return buildMoebooruTagUrl('https://sakugabooru.com/tag.json', query);
    },
    parseTags: parseTagRows,
    parse(payload) {
      return parseMoebooru('sakugabooru', payload);
    }
  },
  derpibooru: {
    name: 'Derpibooru',
    shortName: 'Derpibooru',
    home: 'https://derpibooru.org/',
    description: '插画、GIF 与 WebM 标签图库',
    capabilities: { image: true, date: false, video: true },
    buildUrl: buildDerpibooruUrl,
    parse: parseDerpibooru
  },
  furbooru: {
    name: 'Furbooru',
    shortName: 'Furbooru',
    home: 'https://furbooru.org/',
    description: '公开插画、GIF 与 WebM 标签图库',
    capabilities: { image: true, date: false, video: true },
    buildUrl(query) {
      return buildPhilomenaUrl('https://furbooru.org/', query);
    },
    parse(payload) {
      return parsePhilomena('furbooru', payload);
    }
  },
  manebooru: {
    name: 'Manebooru',
    shortName: 'Manebooru',
    home: 'https://manebooru.art/',
    description: '公开插画、动画与标签媒体图库',
    capabilities: { image: true, date: false, video: true },
    buildUrl(query) {
      return buildPhilomenaUrl('https://manebooru.art/', query);
    },
    parse(payload) {
      return parsePhilomena('manebooru', payload);
    }
  },
  twibooru: {
    name: 'Twibooru',
    shortName: 'Twibooru',
    home: 'https://twibooru.org/',
    description: '公开图片与 WebM 动画标签图库',
    capabilities: { image: true, date: false, video: true },
    buildUrl: buildTwibooruUrl,
    parse(payload) {
      return parsePhilomena('twibooru', payload, 'posts', 'posts');
    }
  },
  wallhaven: {
    name: 'Wallhaven',
    shortName: 'Wallhaven',
    home: 'https://wallhaven.cc/',
    description: '公开高分辨率壁纸图库',
    capabilities: { image: true, date: false, video: false },
    buildUrl: buildWallhavenUrl,
    parse: parseWallhaven
  }
};

export function getSource(sourceId) {
  return SOURCES[sourceId] || SOURCES.konachan;
}

export function createQuery(options) {
  const rawTags = String(options.tags || '')
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean);

  return {
    page: Math.max(1, Number(options.page) || 1),
    mediaType: options.mediaType === 'video' ? 'video' : 'image',
    includeTags: rawTags.filter(tag => !tag.startsWith('-')),
    excludeTags: rawTags
      .filter(tag => tag.startsWith('-') && tag.length > 1)
      .map(tag => tag.slice(1)),
    startDate: options.startDate,
    endDate: options.endDate
  };
}

export function ratingName(rating) {
  return {
    safe: '安全',
    questionable: '敏感',
    explicit: '成人'
  }[rating] || '未知';
}
