const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  contentDisposition,
  createAppServer,
  createTunnelAgent,
  mediaReferer,
  parseProxy,
  resolveStaticPath,
  safeRange,
  sanitizeFilename,
  upstreamHeaders,
  validateDownloadTarget,
  validateTarget
} = require('../src/server.js');

function request(server, pathname, method = 'GET') {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const request = http.request({
      hostname: '127.0.0.1',
      port: address.port,
      path: pathname,
      method,
      agent: false,
      headers: {
        Connection: 'close'
      }
    }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        resolve({
          status: response.statusCode,
          headers: response.headers,
          body: Buffer.concat(chunks).toString('utf8')
        });
      });
    });
    request.on('error', reject);
    request.end();
  });
}

async function listen(app) {
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  return app.server;
}

function closeServer(server) {
  server.closeIdleConnections?.();
  server.closeAllConnections?.();
  return new Promise(resolve => server.close(resolve));
}

test('validateTarget only accepts HTTPS allowlisted hosts', () => {
  assert.equal(validateTarget('https://e621.net/posts.json').hostname, 'e621.net');
  assert.throws(() => validateTarget('http://e621.net/posts.json'), /白名单/);
  assert.throws(() => validateTarget('https://example.com/posts.json'), /白名单/);
  assert.throws(() => validateTarget('https://user:pass@e621.net/posts.json'), /凭据/);
});

test('parseProxy validates HTTP proxy addresses', () => {
  assert.equal(parseProxy(''), null);
  assert.equal(parseProxy('http://127.0.0.1:7897').port, '7897');
  assert.throws(() => parseProxy('socks5://127.0.0.1:1080'), /HTTP/);
  assert.throws(() => parseProxy('not-a-url'), /有效/);
});

test('HTTPS proxy tunnel agent returns the established socket', () => {
  const socket = new net.Socket();
  const agent = createTunnelAgent(socket);

  assert.equal(agent.createConnection(), socket);
  assert.throws(() => agent.createConnection(), /代理隧道已被使用/);
  socket.destroy();
});

test('media requests use safe ranges and source-aware referers', () => {
  assert.equal(safeRange('bytes=0-1023'), 'bytes=0-1023');
  assert.equal(safeRange('bytes=1024-'), 'bytes=1024-');
  assert.equal(safeRange('bytes=-1024'), 'bytes=-1024');
  assert.equal(safeRange('bytes=0-1,4-5'), '');
  assert.equal(safeRange('items=0-10'), '');

  assert.equal(
    mediaReferer(new URL('https://cdn.aibooru.download/original/sample.mp4')),
    'https://aibooru.online/'
  );
  assert.equal(
    mediaReferer(new URL('https://cdn.twibooru.org/img/sample.webm')),
    'https://twibooru.org/'
  );
  assert.equal(
    mediaReferer(new URL('https://v.sankakucomplex.com/data/sample.mp4')),
    'https://chan.sankakucomplex.com/'
  );
});

test('Sankaku API requests use browser-compatible headers', () => {
  const headers = upstreamHeaders(new URL('https://sankakuapi.com/v2/posts'));
  assert.equal(headers.Accept, 'application/json,text/plain,*/*');
  assert.equal(headers.Origin, 'https://www.sankakucomplex.com');
  assert.equal(headers.Referer, 'https://www.sankakucomplex.com/');
  assert.equal(
    upstreamHeaders(new URL('https://capi-v2.sankakucomplex.com/posts')).Origin,
    'https://www.sankakucomplex.com'
  );
  assert.match(headers['User-Agent'], /^Mozilla\/5\.0/);
  assert.deepEqual(upstreamHeaders(new URL('https://danbooru.donmai.us/posts.json')), {});
});

test('download targets and filenames are constrained', () => {
  assert.equal(
    validateDownloadTarget('https://cdn.donmai.us/original/sample.jpg').hostname,
    'cdn.donmai.us'
  );
  assert.equal(
    validateDownloadTarget('https://static1.e621.net/data/sample.webm').hostname,
    'static1.e621.net'
  );
  assert.throws(
    () => validateDownloadTarget('https://evil-donmai.us/sample.jpg'),
    /白名单/
  );
  assert.equal(sanitizeFilename('../测试\r\n.jpg'), '..-测试--.jpg');
  assert.match(contentDisposition('插画 01.jpg'), /filename\*=UTF-8''/);
  assert.doesNotMatch(contentDisposition('bad\r\nname.jpg'), /[\r\n]/);
});

test('resolveStaticPath prevents traversal and decodes safe paths', () => {
  const publicDirectory = path.join(os.tmpdir(), 'atlas-gallery-test-public');
  assert.equal(
    resolveStaticPath(publicDirectory, '/css/styles.css'),
    path.join(publicDirectory, 'css', 'styles.css')
  );
  assert.equal(resolveStaticPath(publicDirectory, '/../package.json'), null);
  assert.equal(resolveStaticPath(publicDirectory, '/%2e%2e/package.json'), null);
  assert.equal(resolveStaticPath(publicDirectory, '/%00file'), null);
});

test('server serves health and static resources without hanging sockets', async () => {
  const app = createAppServer({
    publicDirectory: path.join(__dirname, '..', 'public'),
    upstreamProxy: ''
  });
  const server = await listen(app);

  try {
    const health = await request(server, '/api/health');
    assert.equal(health.status, 200);
    assert.deepEqual(JSON.parse(health.body), {
      ok: true,
      version: '2.10.0',
      proxyMode: app.proxyMode
    });

    const page = await request(server, '/');
    assert.equal(page.status, 200);
    assert.match(page.headers['content-type'], /text\/html/);
    assert.match(
      page.headers['content-security-policy'],
      /style-src 'self' 'unsafe-inline'/
    );
    assert.match(page.headers['content-security-policy'], /script-src 'self'/);
    assert.doesNotMatch(
      page.headers['content-security-policy'],
      /script-src[^;]*'unsafe-inline'/
    );
    assert.match(page.body, /Atlas Gallery/);
    assert.match(page.body, /放大后拖拽平移/);
    assert.match(page.body, /class="mobile-bottom-nav"/);
    assert.match(page.body, /id="mobileFilterButton"/);
    assert.match(page.body, /id="mobileFilterClose"/);
    assert.match(page.body, /data-setting="videoAutoNext"/);
    assert.match(page.body, /class="search-guidance"/);
    assert.match(page.body, /class="friend-links"/);
    assert.match(page.body, /data-view="links"/);
    assert.match(page.body, /id="friendLinks"[^>]*hidden/);
    assert.match(page.body, /styles\.css\?v=2\.10\.0/);
    assert.match(page.body, /data-view="playlist"/);
    assert.doesNotMatch(page.body, /id="aggregateSearchButton"/);
    assert.match(page.body, /href="https:\/\/realbooru\.com\/"/);
    assert.doesNotMatch(page.body, /href="https:\/\/aibooru\.online\/"[^>]*class="friend-link"/);
    assert.match(page.body, /href="https:\/\/hanime1\.me\/"/);
    assert.match(page.body, /href="https:\/\/nhentai\.net\/"/);
    assert.match(page.body, /friendMangaTitle/);
    assert.match(page.body, /target="_blank" rel="noopener noreferrer"/);

    const module = await request(server, '/js/app.js', 'HEAD');
    assert.equal(module.status, 200);
    assert.equal(module.body, '');

    const appScript = await request(server, '/js/app.js');
    assert.equal(appScript.status, 200);
    assert.match(appScript.body, /copyOriginalLink/);
    assert.match(appScript.body, /pointermove/);
    assert.match(appScript.body, /galleryViewKey/);
    assert.match(appScript.body, /openMobileFilters/);
    assert.match(appScript.body, /closeMobileFilters/);
    assert.match(appScript.body, /playNextVideo/);
    assert.match(appScript.body, /video\.videoWidth > video\.videoHeight/);
    assert.match(appScript.body, /state\.view === 'links'/);
    assert.match(appScript.body, /friendLinks\.hidden = !linksView/);
    assert.doesNotMatch(appScript.body, /state\.aggregateSearch/);
    assert.match(appScript.body, /previewSwipeStep/);
    assert.match(appScript.body, /renderGallery\(\{ append: !reset \}\)/);
    assert.match(appScript.body, /toggleWatchLater/);
    assert.match(appScript.headers['cache-control'], /no-store/);

    const styles = await request(server, '/css/styles.css');
    assert.equal(styles.status, 200);
    assert.match(styles.body, /\[hidden\]\s*\{\s*display:\s*none\s*!important;/);
    assert.match(styles.body, /\.source-scroller\s*\{[^}]*flex-wrap:\s*wrap;/s);
    assert.match(styles.body, /\.source-scroller\s*\{[^}]*overflow:\s*visible;/s);
    assert.match(styles.body, /@media \(max-width:\s*640px\)[\s\S]*\.mobile-bottom-nav\s*\{[^}]*position:\s*fixed;/s);
    assert.match(styles.body, /@media \(max-width:\s*640px\)[\s\S]*\.source-scroller\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);/s);
    assert.match(styles.body, /\.control-surface\.is-mobile-open\s*\{[^}]*transform:\s*translateY\(0\)/s);
    assert.match(styles.body, /content-visibility:\s*auto/);
    assert.match(styles.body, /cursor:\s*grab/);
    assert.match(styles.body, /\.preview-media video\.is-landscape[\s\S]*width:\s*100%;[\s\S]*height:\s*auto;/);
    assert.match(styles.body, /\.preview-media video\.is-portrait\s*\{[^}]*height:\s*100%;/s);
    assert.match(styles.body, /\.friend-links-grid\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fit,/s);
    assert.match(styles.body, /\.friend-link-groups\s*\{/);
    assert.match(styles.body, /@media \(max-width:\s*640px\)[\s\S]*\.friend-links-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);/s);
    assert.match(styles.body, /grid-template-columns:\s*repeat\(6,\s*minmax\(0,\s*1fr\)\)/);
    assert.match(styles.body, /\.source-actions\s*\{/);
    assert.match(styles.body, /\.watch-button\s*\{/);
    assert.match(styles.body, /touch-action:\s*pan-y/);

    const missing = await request(server, '/missing-resource');
    assert.equal(missing.status, 404);
    assert.match(missing.body, /未找到资源/);
  } finally {
    await closeServer(server);
  }
});

test('Linux deployment script auto-detects install or forced update with Chinese progress', () => {
  const script = fs.readFileSync(
    path.join(__dirname, '..', 'deploy', 'atlas-gallery.sh'),
    'utf8'
  );

  assert.match(script, /set -Eeuo pipefail/);
  assert.match(script, /case "\$\{1:-auto\}"/);
  assert.match(script, /RUN_MODE="install"/);
  assert.match(script, /RUN_MODE="update"/);
  assert.match(script, /fetch --all --force --prune --tags/);
  assert.match(script, /reset --hard "origin\/\$\{BRANCH\}"/);
  assert.match(script, /clean -fd/);
  assert.match(script, /remove_conflicting_nginx_defaults/);
  assert.match(script, /nginx-default-migration-/);
  assert.match(script, /已移除旧默认主机冲突/);
  assert.match(script, /开始：%s/);
  assert.match(script, /完成：%s/);
  assert.match(script, /最终结果：执行成功/);
  assert.match(script, /最终结果：执行失败/);
  assert.match(script, /127\.0\.0\.1:59886\/api\/health/);
  assert.match(script, /版本对比：仓库=/);
  assert.match(script, /Node 服务版本与仓库版本不一致/);
  assert.match(script, /Nginx 59886 命中了其他旧配置/);
  assert.match(script, /页面资源版本与仓库版本不一致/);
});

test('production Nginx config revalidates interface assets without dropping security headers', () => {
  const config = fs.readFileSync(
    path.join(__dirname, '..', 'deploy', 'nginx-atlas-gallery.conf'),
    'utf8'
  );

  assert.match(config, /location \/css\/\s*\{\s*expires -1;/);
  assert.match(config, /location \/js\/\s*\{\s*expires -1;/);
  assert.match(config, /listen 59886 default_server;/);
  assert.match(config, /listen \[::\]:59886 default_server;/);
  assert.match(config, /server_name _;/);
  assert.doesNotMatch(config, /expires 5m/);
  assert.doesNotMatch(config, /location \/(?:css|js)\/[\s\S]*?add_header/);
});

test('new source APIs and media CDN hosts are allowlisted explicitly', () => {
  assert.equal(
    validateTarget('https://konachan.net/post.json').hostname,
    'konachan.net'
  );
  assert.equal(
    validateTarget('https://lolibooru.moe/post.json').hostname,
    'lolibooru.moe'
  );
  assert.equal(
    validateTarget('https://xbooru.com/index.php?page=dapi').hostname,
    'xbooru.com'
  );
  assert.equal(
    validateTarget('https://hypnohub.net/index.php?page=dapi').hostname,
    'hypnohub.net'
  );
  assert.equal(
    validateTarget('https://tbib.org/index.php?page=dapi').hostname,
    'tbib.org'
  );
  assert.equal(
    validateTarget('https://realbooru.com/index.php?page=dapi').hostname,
    'realbooru.com'
  );
  assert.equal(
    validateTarget('https://aibooru.online/posts.json').hostname,
    'aibooru.online'
  );
  assert.equal(
    validateTarget('https://e6ai.net/posts.json').hostname,
    'e6ai.net'
  );
  assert.equal(
    validateTarget('https://derpibooru.org/api/v1/json/search/images').hostname,
    'derpibooru.org'
  );
  assert.equal(
    validateTarget('https://wallhaven.cc/api/v1/search').hostname,
    'wallhaven.cc'
  );
  assert.equal(
    validateTarget('https://furbooru.org/api/v1/json/search/images').hostname,
    'furbooru.org'
  );
  assert.equal(
    validateTarget('https://manebooru.art/api/v1/json/search/images').hostname,
    'manebooru.art'
  );
  assert.equal(
    validateTarget('https://twibooru.org/api/v3/search/posts').hostname,
    'twibooru.org'
  );
  assert.equal(
    validateTarget('https://sankakuapi.com/v2/posts').hostname,
    'sankakuapi.com'
  );
  assert.equal(
    validateTarget('https://capi-v2.sankakucomplex.com/posts').hostname,
    'capi-v2.sankakucomplex.com'
  );
  assert.equal(
    validateTarget('https://www.sakugabooru.com/post.json').hostname,
    'www.sakugabooru.com'
  );
  assert.equal(
    validateDownloadTarget('https://cdn.aibooru.download/file/sample.webp').hostname,
    'cdn.aibooru.download'
  );
  assert.equal(
    validateDownloadTarget('https://derpicdn.net/img/view/sample.webm').hostname,
    'derpicdn.net'
  );
  assert.equal(
    validateDownloadTarget('https://w.wallhaven.cc/full/ab/sample.jpg').hostname,
    'w.wallhaven.cc'
  );
  assert.equal(
    validateDownloadTarget('https://img.xbooru.com/images/sample.webm').hostname,
    'img.xbooru.com'
  );
  assert.equal(
    validateDownloadTarget('https://static1.e6ai.net/data/sample.webm').hostname,
    'static1.e6ai.net'
  );
  assert.equal(
    validateDownloadTarget('https://tbib.org/images/1/sample.jpg').hostname,
    'tbib.org'
  );
  assert.equal(
    validateDownloadTarget('https://realbooru.com/images/1/sample.jpg').hostname,
    'realbooru.com'
  );
  assert.equal(
    validateDownloadTarget('https://furrycdn.org/img/view/sample.webp').hostname,
    'furrycdn.org'
  );
  assert.equal(
    validateDownloadTarget('https://static.manebooru.art/img/view/sample.jpg').hostname,
    'static.manebooru.art'
  );
  assert.equal(
    validateDownloadTarget('https://cdn.twibooru.org/img/sample.webm').hostname,
    'cdn.twibooru.org'
  );
});

test('site health only probes mapped sources and never accepts arbitrary URLs', async () => {
  const probes = [];
  const app = createAppServer({
    publicDirectory: path.join(__dirname, '..', 'public'),
    upstreamProxy: '',
    probeSite: async (target, source) => {
      probes.push({ target: target.href, source });
      return { ok: true, status: 200, latencyMs: 18 };
    }
  });
  const server = await listen(app);

  try {
    const healthy = await request(server, '/api/site-health?source=danbooru');
    assert.equal(healthy.status, 200);
    assert.deepEqual(JSON.parse(healthy.body), {
      source: 'danbooru',
      ok: true,
      status: 200,
      latencyMs: 18
    });
    assert.equal(probes[0].target, 'https://danbooru.donmai.us/posts.json?limit=1');

    const newSource = await request(server, '/api/site-health?source=sakugabooru');
    assert.equal(newSource.status, 200);
    assert.equal(probes[1].source, 'sakugabooru');
    assert.equal(probes[1].target, 'https://www.sakugabooru.com/post.json?limit=1');

    const arbitrary = await request(
      server,
      '/api/site-health?source=https%3A%2F%2Fexample.com%2F'
    );
    assert.equal(arbitrary.status, 400);
    assert.match(arbitrary.body, /未知站点来源/);
    assert.equal(probes.length, 2);
  } finally {
    await closeServer(server);
  }
});

test('server returns validation errors instead of crashing on malformed proxy targets', async () => {
  const app = createAppServer({
    publicDirectory: path.join(__dirname, '..', 'public'),
    upstreamProxy: ''
  });
  const server = await listen(app);

  try {
    const invalid = await request(server, '/api/proxy?url=https%3A%2F%2Fexample.com%2F');
    assert.equal(invalid.status, 400);
    assert.match(invalid.body, /白名单/);

    const malformed = await request(server, '/api/proxy?url=%25');
    assert.equal(malformed.status, 400);
    assert.match(malformed.body, /目标地址无效/);

    const invalidDownload = await request(
      server,
      '/api/download?url=https%3A%2F%2Fexample.com%2Fsample.jpg&filename=sample.jpg'
    );
    assert.equal(invalidDownload.status, 400);
    assert.match(invalidDownload.body, /媒体白名单/);

    const health = await request(server, '/api/health');
    assert.equal(health.status, 200);
  } finally {
    await closeServer(server);
  }
});

test('invalid configured proxy is rejected before server starts', () => {
  assert.throws(() => createAppServer({ upstreamProxy: 'socks5://127.0.0.1:1080' }), /HTTP/);
});
