const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  contentDisposition,
  createAppServer,
  parseProxy,
  resolveStaticPath,
  sanitizeFilename,
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
      version: '2.2.0',
      proxyMode: app.proxyMode
    });

    const page = await request(server, '/');
    assert.equal(page.status, 200);
    assert.match(page.headers['content-type'], /text\/html/);
    assert.match(page.body, /Atlas Gallery/);

    const module = await request(server, '/js/app.js', 'HEAD');
    assert.equal(module.status, 200);
    assert.equal(module.body, '');

    const styles = await request(server, '/css/styles.css');
    assert.equal(styles.status, 200);
    assert.match(styles.body, /\[hidden\]\s*\{\s*display:\s*none\s*!important;/);

    const missing = await request(server, '/missing-resource');
    assert.equal(missing.status, 404);
    assert.match(missing.body, /未找到资源/);
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
