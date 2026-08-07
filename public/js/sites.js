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
    return String(explicitExtension)
      .toLowerCase()
      .split(';', 1)[0]
      .split('/')
      .pop()
      .replace(/^\./, '');
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

function dateTag(query) {
  return query.startDate && query.endDate
    ? `date:${query.startDate}..${query.endDate}`
    : '';
}

function ratingTag(query, values = {}) {
  if (!Array.isArray(query.ratings) || query.ratings.length !== 1) {
    return '';
  }
  const rating = query.ratings[0];
  return `rating:${values[rating] || rating}`;
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

function buildMoebooruUrl(baseUrl, query) {
  const url = new URL(baseUrl);

  return addSearchParams(url, {
    limit: PAGE_SIZE,
    page: query.page,
    tags: joinTags(query, ['order:score', ratingTag(query), dateTag(query)])
  });
}

function buildGelbooruUrl(baseUrl, query, supportsDate = false) {
  const url = new URL(baseUrl);
  const filters = [ratingTag(query), supportsDate ? dateTag(query) : ''].filter(Boolean);
  if (filters.length < 2) {
    filters.push('sort:score:desc');
  }

  return addSearchParams(url, {
    page: 'dapi',
    s: 'post',
    q: 'index',
    json: 1,
    limit: PAGE_SIZE,
    pid: query.page - 1,
    tags: joinTags(query, filters)
  });
}

function buildDanbooruUrl(baseUrl, query) {
  const url = new URL(baseUrl);
  const mediaTag = query.mediaType === 'video'
    ? 'filetype:mp4'
    : '';
  const selectedRating = ratingTag(query, {
    safe: 'g',
    questionable: 'q',
    explicit: 'e'
  });

  return addSearchParams(url, {
    limit: PAGE_SIZE,
    page: query.page,
    tags: joinTags(query, [
      dateTag(query),
      mediaTag || selectedRating || 'order:score_desc'
    ])
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
      return buildMoebooruUrl('https://yande.re/post.json', query);
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
    capabilities: { image: true, date: true, video: false },
    buildUrl(query) {
      return buildMoebooruUrl('https://konachan.com/post.json', query);
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
    capabilities: { image: true, date: true, video: false },
    buildUrl(query) {
      return buildMoebooruUrl('https://konachan.net/post.json', query);
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
    capabilities: { image: true, date: true, video: false },
    buildUrl(query) {
      return buildMoebooruUrl('https://lolibooru.moe/post.json', query);
    },
    buildTagUrl(query) {
      return buildMoebooruTagUrl('https://lolibooru.moe/tag.json', query);
    },
    parseTags: parseTagRows,
    parse(payload) {
      return parseMoebooru('lolibooru', payload);
    }
  },
  danbooru: {
    name: 'Danbooru',
    shortName: 'Danbooru',
    home: 'https://danbooru.donmai.us/',
    description: '标签体系完整的动漫图库',
    capabilities: { image: true, date: true, video: true },
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
    capabilities: { image: true, date: true, video: true },
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
    capabilities: { image: true, date: true, video: true },
    buildUrl(query) {
      const url = new URL('https://capi-v2.sankakucomplex.com/posts');
      return addSearchParams(url, {
        limit: PAGE_SIZE,
        page: query.page,
        tags: joinTags(query, [
          'order:popular',
          query.mediaType === 'video' ? 'video' : '-video',
          ratingTag(query),
          dateTag(query)
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
    capabilities: { image: true, date: true, video: false },
    buildUrl(query) {
      return buildGelbooruUrl('https://safebooru.org/index.php', query, true);
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
    capabilities: { image: true, date: true, video: false },
    buildUrl(query) {
      return buildGelbooruUrl('https://api.rule34.xxx/index.php', query, true);
    },
    buildTagUrl(query) {
      return buildGelbooruTagUrl('https://api.rule34.xxx/index.php', query);
    },
    parseTags: parseTagRows,
    parse(payload) {
      return parseGelbooru('rule34', payload);
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
    ratings: Array.isArray(options.ratings)
      ? options.ratings.filter(rating => ['safe', 'questionable', 'explicit'].includes(rating))
      : [],
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
