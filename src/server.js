const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const tls = require('node:tls');
const fs = require('node:fs');
const path = require('node:path');
const { version: APP_VERSION } = require('../package.json');

const DEFAULT_PORT = 4173;
const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;
const MAX_DOWNLOAD_BYTES = 256 * 1024 * 1024;
const MAX_PROXY_REQUESTS = 12;
const REQUEST_TIMEOUT_MS = 25000;

const SITE_HEALTH_TARGETS = Object.freeze({
  yandere: 'https://yande.re/post.json?limit=1',
  konachan: 'https://konachan.com/post.json?limit=1',
  konachanNet: 'https://konachan.net/post.json?limit=1',
  lolibooru: 'https://lolibooru.moe/post.json?limit=1',
  danbooru: 'https://danbooru.donmai.us/posts.json?limit=1',
  sankaku: 'https://capi-v2.sankakucomplex.com/posts?limit=1',
  safebooru: 'https://safebooru.org/index.php?page=dapi&s=post&q=index&json=1&limit=1',
  rule34: 'https://api.rule34.xxx/index.php?page=dapi&s=post&q=index&json=1&limit=1',
  aibooru: 'https://aibooru.online/posts.json?limit=1',
  wallhaven: 'https://wallhaven.cc/api/v1/search?purity=100&page=1'
});

const ALLOWED_HOSTS = new Set([
  'yande.re',
  'konachan.com',
  'www.konachan.com',
  'konachan.net',
  'www.konachan.net',
  'lolibooru.moe',
  'danbooru.donmai.us',
  'capi-v2.sankakucomplex.com',
  'safebooru.org',
  'www.safebooru.org',
  'api.rule34.xxx',
  'rule34.xxx',
  'aibooru.online',
  'wallhaven.cc'
]);

const MEDIA_HOST_SUFFIXES = [
  'yande.re',
  'konachan.com',
  'konachan.net',
  'lolibooru.moe',
  'donmai.us',
  'sankakucomplex.com',
  'safebooru.org',
  'rule34.xxx',
  'aibooru.online',
  'aibooru.download',
  'wallhaven.cc'
];

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

const MEDIA_REFERERS = Object.freeze([
  ['aibooru.download', 'https://aibooru.online/'],
  ['donmai.us', 'https://danbooru.donmai.us/'],
  ['sankakucomplex.com', 'https://chan.sankakucomplex.com/'],
  ['rule34.xxx', 'https://rule34.xxx/']
]);

function sendJson(response, status, body, extraHeaders = {}) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders
  });
  response.end(JSON.stringify(body));
}

function validateTarget(value) {
  let target;

  try {
    target = new URL(value);
  } catch {
    throw new Error('目标地址无效');
  }

  if (target.protocol !== 'https:' || !ALLOWED_HOSTS.has(target.hostname.toLowerCase())) {
    throw new Error('目标站点不在代理白名单中');
  }

  if (target.username || target.password) {
    throw new Error('目标地址不能包含凭据');
  }

  return target;
}

function validateDownloadTarget(value) {
  let target;

  try {
    target = new URL(value);
  } catch {
    throw new Error('下载地址无效');
  }

  const hostname = target.hostname.toLowerCase();
  const allowed = MEDIA_HOST_SUFFIXES.some(suffix => {
    return hostname === suffix || hostname.endsWith(`.${suffix}`);
  });

  if (target.protocol !== 'https:' || !allowed) {
    throw new Error('下载地址不在媒体白名单中');
  }

  if (target.username || target.password) {
    throw new Error('下载地址不能包含凭据');
  }

  return target;
}

function sanitizeFilename(value) {
  const cleaned = String(value || 'media')
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .slice(0, 180);
  return cleaned || 'media';
}

function contentDisposition(filename) {
  const safeFilename = sanitizeFilename(filename);
  const asciiFilename = safeFilename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodeURIComponent(safeFilename)}`;
}

function parseProxy(value) {
  if (!value) {
    return null;
  }

  let proxy;

  try {
    proxy = new URL(value);
  } catch {
    throw new Error('UPSTREAM_PROXY 必须是有效的 http:// 或 https:// 地址');
  }

  if (!['http:', 'https:'].includes(proxy.protocol)) {
    throw new Error('UPSTREAM_PROXY 仅支持 HTTP 或 HTTPS 代理');
  }

  return proxy;
}

function connectTcp(hostname, port, timeout = 1500) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, hostname);
    socket.setTimeout(timeout);

    socket.once('connect', () => {
      socket.setTimeout(0);
      resolve(socket);
    });
    socket.once('timeout', () => {
      socket.destroy(new Error('连接代理超时'));
    });
    socket.once('error', reject);
  });
}

function createProxyResolver(configuredProxy) {
  const localCandidates = process.platform === 'win32' && !configuredProxy
    ? ['http://127.0.0.1:7897', 'http://127.0.0.1:7890'].map(parseProxy)
    : [];

  let detectedProxy;

  return {
    mode: configuredProxy ? 'configured' : localCandidates.length ? 'auto' : 'direct',

    async resolve() {
      if (detectedProxy !== undefined) {
        return detectedProxy;
      }

      const candidates = configuredProxy ? [configuredProxy] : localCandidates;

      for (const candidate of candidates) {
        try {
          const fallbackPort = candidate.protocol === 'https:' ? 443 : 80;
          const socket = await connectTcp(
            candidate.hostname,
            Number(candidate.port) || fallbackPort
          );
          socket.destroy();
          detectedProxy = candidate;
          return detectedProxy;
        } catch {
          // Try the next local proxy candidate.
        }
      }

      detectedProxy = null;
      return detectedProxy;
    }
  };
}

function openProxyTunnel(proxy, target) {
  return new Promise((resolve, reject) => {
    const transport = proxy.protocol === 'https:' ? https : http;
    const headers = {
      Host: `${target.hostname}:443`
    };

    if (proxy.username || proxy.password) {
      const credentials = `${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`;
      headers['Proxy-Authorization'] = `Basic ${Buffer.from(credentials).toString('base64')}`;
    }

    const request = transport.request({
      hostname: proxy.hostname,
      port: Number(proxy.port) || (proxy.protocol === 'https:' ? 443 : 80),
      method: 'CONNECT',
      path: `${target.hostname}:443`,
      headers
    });

    request.setTimeout(10000, () => {
      request.destroy(new Error('连接上游代理超时'));
    });

    request.once('connect', (response, socket, head) => {
      if (response.statusCode !== 200) {
        socket.destroy();
        reject(new Error(`上游代理 CONNECT 返回 HTTP ${response.statusCode}`));
        return;
      }

      if (head.length) {
        socket.unshift(head);
      }

      const secureSocket = tls.connect({
        socket,
        servername: target.hostname
      });

      secureSocket.setTimeout(REQUEST_TIMEOUT_MS);
      secureSocket.once('secureConnect', () => {
        secureSocket.setTimeout(0);
        resolve(secureSocket);
      });
      secureSocket.once('timeout', () => {
        secureSocket.destroy(new Error('目标站点请求超时'));
      });
      secureSocket.once('error', reject);
    });

    request.once('error', reject);
    request.end();
  });
}

function createTunnelAgent(socket) {
  const agent = new https.Agent({ keepAlive: false, maxSockets: 1 });
  let claimed = false;

  agent.createConnection = () => {
    if (claimed) {
      throw new Error('代理隧道已被使用');
    }

    claimed = true;
    return socket;
  };

  return agent;
}

function mediaReferer(target) {
  const hostname = target.hostname.toLowerCase();
  const match = MEDIA_REFERERS.find(([suffix]) => {
    return hostname === suffix || hostname.endsWith(`.${suffix}`);
  });
  return match?.[1] || `${target.origin}/`;
}

function safeRange(value) {
  return /^bytes=\d*-\d*$/.test(String(value || '')) ? String(value) : '';
}

function upstreamHeaders(target) {
  const hostname = target.hostname.toLowerCase();
  if (hostname === 'capi-v2.sankakucomplex.com') {
    return {
      Accept: 'application/vnd.sankaku.api+json;v=2',
      Referer: 'https://chan.sankakucomplex.com/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138.0.0.0 Safari/537.36'
    };
  }

  if (['api.rule34.xxx', 'lolibooru.moe'].includes(hostname)) {
    return {
      Referer: hostname === 'api.rule34.xxx' ? 'https://rule34.xxx/' : 'https://lolibooru.moe/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138.0.0.0 Safari/537.36'
    };
  }

  return {};
}

async function createUpstreamRequest(target, proxyResolver, onResponse, requestOptions = {}) {
  const proxy = await proxyResolver.resolve();
  const options = {
    hostname: target.hostname,
    port: Number(target.port) || 443,
    path: `${target.pathname}${target.search}`,
    method: requestOptions.method || 'GET',
    headers: {
      Accept: 'application/json,text/plain,*/*',
      'Accept-Encoding': 'identity',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.7',
      'User-Agent': 'AtlasGallery/2.8 (+https://github.com/Neptune326/codex-anima-html)',
      ...upstreamHeaders(target),
      ...requestOptions.headers
    }
  };

  if (proxy) {
    const socket = await openProxyTunnel(proxy, target);
    options.agent = createTunnelAgent(socket);
  }

  return https.request(options, onResponse);
}

function streamMedia(target, proxyResolver, clientRequest, clientResponse, redirects = 0) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = error => {
      if (settled) {
        return;
      }

      settled = true;
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };
    const range = safeRange(clientRequest.headers.range);
    const headers = {
      Accept: clientRequest.headers.accept || '*/*',
      Referer: mediaReferer(target)
    };

    if (range) {
      headers.Range = range;
    }

    createUpstreamRequest(target, proxyResolver, upstream => {
      const status = upstream.statusCode || 502;

      if ([301, 302, 303, 307, 308].includes(status)) {
        upstream.resume();

        if (redirects >= 5 || !upstream.headers.location) {
          finish(new Error('媒体地址重定向无效'));
          return;
        }

        try {
          const redirectedTarget = validateDownloadTarget(
            new URL(upstream.headers.location, target).href
          );
          streamMedia(
            redirectedTarget,
            proxyResolver,
            clientRequest,
            clientResponse,
            redirects + 1
          ).then(() => finish(), finish);
        } catch (error) {
          finish(error);
        }
        return;
      }

      const responseHeaders = {
        'Content-Type': upstream.headers['content-type'] || 'application/octet-stream',
        'Cache-Control': 'public, max-age=86400',
        'Accept-Ranges': upstream.headers['accept-ranges'] || 'bytes',
        'Referrer-Policy': 'no-referrer',
        'X-Content-Type-Options': 'nosniff'
      };

      ['content-length', 'content-range', 'etag', 'last-modified'].forEach(name => {
        if (upstream.headers[name]) {
          responseHeaders[name] = upstream.headers[name];
        }
      });

      clientResponse.writeHead(status, responseHeaders);
      upstream.once('error', error => {
        clientResponse.destroy(error);
        finish(error);
      });
      upstream.once('end', () => finish());
      clientResponse.once('close', () => {
        if (!upstream.complete) {
          upstream.destroy();
        }
        finish();
      });
      upstream.pipe(clientResponse);
    }, { headers }).then(request => {
      request.setTimeout(REQUEST_TIMEOUT_MS, () => {
        request.destroy(new Error('媒体请求超时'));
      });
      request.once('error', finish);
      request.end();
    }, finish);
  });
}

function fetchUpstream(
  target,
  proxyResolver,
  redirects = 0,
  maxBytes = MAX_RESPONSE_BYTES,
  validator = validateTarget
) {
  return new Promise((resolve, reject) => {
    createUpstreamRequest(target, proxyResolver, upstream => {
      const status = upstream.statusCode || 502;

      if ([301, 302, 303, 307, 308].includes(status)) {
        upstream.resume();

        if (redirects >= 3) {
          reject(new Error('目标站点重定向次数过多'));
          return;
        }

        const location = upstream.headers.location;
        if (!location) {
          reject(new Error('目标站点返回了无效重定向'));
          return;
        }

        try {
          const redirectedTarget = validator(new URL(location, target).href);
          fetchUpstream(
            redirectedTarget,
            proxyResolver,
            redirects + 1,
            maxBytes,
            validator
          ).then(resolve, reject);
        } catch (error) {
          reject(error);
        }
        return;
      }

      const declaredLength = Number(upstream.headers['content-length']) || 0;
      if (declaredLength > maxBytes) {
        upstream.destroy();
        reject(new Error(`目标站点响应超过 ${Math.round(maxBytes / 1024 / 1024)} MB`));
        return;
      }

      const chunks = [];
      let size = 0;

      upstream.on('data', chunk => {
        size += chunk.length;

        if (size > maxBytes) {
          upstream.destroy(new Error(`目标站点响应超过 ${Math.round(maxBytes / 1024 / 1024)} MB`));
          return;
        }

        chunks.push(chunk);
      });

      upstream.on('end', () => {
        resolve({
          status,
          contentType: upstream.headers['content-type'],
          bytes: Buffer.concat(chunks)
        });
      });
      upstream.on('error', reject);
    }).then(request => {
      request.setTimeout(REQUEST_TIMEOUT_MS, () => {
        request.destroy(new Error('目标站点请求超时'));
      });
      request.once('error', reject);
      request.end();
    }, reject);
  });
}

function resolveStaticPath(publicDirectory, pathname) {
  let decodedPath;

  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  if (decodedPath.includes('\0')) {
    return null;
  }

  const relativePath = decodedPath === '/' ? 'index.html' : decodedPath.replace(/^\/+/, '');
  const publicRoot = path.resolve(publicDirectory);
  const resolvedPath = path.resolve(publicRoot, relativePath);
  const pathFromRoot = path.relative(publicRoot, resolvedPath);

  if (pathFromRoot.startsWith('..') || path.isAbsolute(pathFromRoot)) {
    return null;
  }

  return resolvedPath;
}

function serveStatic(publicDirectory, pathname, response, method) {
  const staticPath = resolveStaticPath(publicDirectory, pathname);

  if (!staticPath || !fs.existsSync(staticPath) || !fs.statSync(staticPath).isFile()) {
    return false;
  }

  const extension = path.extname(staticPath).toLowerCase();
  const contentType = MIME_TYPES[extension] || 'application/octet-stream';

  const noStore = ['.html', '.css', '.js'].includes(extension);
  response.writeHead(200, {
    'Content-Type': contentType,
    'Cache-Control': noStore ? 'no-store, no-cache, must-revalidate' : 'public, max-age=300',
    'Content-Security-Policy': [
      "default-src 'self'",
      "img-src 'self' https: data: blob:",
      "media-src 'self' https: blob:",
      "connect-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'"
    ].join('; '),
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY'
  });

  if (method === 'HEAD') {
    response.end();
    return true;
  }

  const stream = fs.createReadStream(staticPath);
  stream.once('error', () => response.destroy());
  stream.pipe(response);
  return true;
}

function createAppServer(options = {}) {
  const publicDirectory = options.publicDirectory || path.join(__dirname, '..', 'public');
  const proxyValue = options.upstreamProxy
    ?? process.env.UPSTREAM_PROXY
    ?? process.env.HTTPS_PROXY
    ?? process.env.HTTP_PROXY
    ?? process.env.ALL_PROXY
    ?? '';
  const configuredProxy = parseProxy(proxyValue);
  const proxyResolver = createProxyResolver(configuredProxy);
  const probeSite = options.probeSite || (async target => {
    const startedAt = Date.now();
    const upstream = await fetchUpstream(target, proxyResolver, 0, 512 * 1024);
    return {
      ok: upstream.status >= 200 && upstream.status < 500,
      status: upstream.status,
      latencyMs: Date.now() - startedAt
    };
  });
  let activeProxyRequests = 0;

  const server = http.createServer(async (request, response) => {
    let requestUrl;

    try {
      requestUrl = new URL(request.url || '/', 'http://localhost');
    } catch {
      sendJson(response, 400, { error: '请求地址无效' });
      return;
    }

    if (request.method === 'GET' && requestUrl.pathname === '/api/proxy') {
      if (activeProxyRequests >= MAX_PROXY_REQUESTS) {
        sendJson(
          response,
          429,
          { error: '代理请求过多，请稍后重试' },
          { 'Retry-After': '2' }
        );
        return;
      }

      let target;
      try {
        target = validateTarget(requestUrl.searchParams.get('url') || '');
      } catch (error) {
        sendJson(response, 400, { error: error.message });
        return;
      }

      activeProxyRequests += 1;

      try {
        const upstream = await fetchUpstream(target, proxyResolver);
        response.writeHead(upstream.status, {
          'Content-Type': upstream.contentType || 'application/json; charset=utf-8',
          'Cache-Control': 'public, max-age=60',
          'Referrer-Policy': 'no-referrer',
          'X-Content-Type-Options': 'nosniff'
        });
        response.end(upstream.bytes);
      } catch (error) {
        sendJson(response, 502, { error: error.message });
      } finally {
        activeProxyRequests -= 1;
      }
      return;
    }

    if (request.method === 'GET' && requestUrl.pathname === '/api/download') {
      let target;

      try {
        target = validateDownloadTarget(requestUrl.searchParams.get('url') || '');
      } catch (error) {
        sendJson(response, 400, { error: error.message });
        return;
      }

      try {
        const upstream = await fetchUpstream(
          target,
          proxyResolver,
          0,
          MAX_DOWNLOAD_BYTES,
          validateDownloadTarget
        );
        const filename = sanitizeFilename(requestUrl.searchParams.get('filename') || 'media');
        response.writeHead(upstream.status, {
          'Content-Type': upstream.contentType || 'application/octet-stream',
          'Content-Disposition': contentDisposition(filename),
          'Content-Length': upstream.bytes.length,
          'Cache-Control': 'no-store',
          'Referrer-Policy': 'no-referrer',
          'X-Content-Type-Options': 'nosniff'
        });
        response.end(upstream.bytes);
      } catch (error) {
        sendJson(response, 502, { error: error.message });
      }
      return;
    }

    if (request.method === 'GET' && requestUrl.pathname === '/api/media') {
      let target;

      try {
        target = validateDownloadTarget(requestUrl.searchParams.get('url') || '');
      } catch (error) {
        sendJson(response, 400, { error: error.message });
        return;
      }

      try {
        await streamMedia(target, proxyResolver, request, response);
      } catch (error) {
        if (!response.headersSent) {
          sendJson(response, 502, { error: error.message });
        }
      }
      return;
    }

    if (request.method === 'GET' && requestUrl.pathname === '/api/health') {
      sendJson(response, 200, {
        ok: true,
        version: APP_VERSION,
        proxyMode: proxyResolver.mode
      });
      return;
    }

    if (request.method === 'GET' && requestUrl.pathname === '/api/site-health') {
      const source = requestUrl.searchParams.get('source') || '';
      const targetValue = SITE_HEALTH_TARGETS[source];

      if (!targetValue) {
        sendJson(response, 400, { error: '未知站点来源' });
        return;
      }

      try {
        const result = await probeSite(validateTarget(targetValue), source);
        sendJson(response, result.ok ? 200 : 502, {
          source,
          ok: Boolean(result.ok),
          status: Number(result.status) || 0,
          latencyMs: Math.max(0, Number(result.latencyMs) || 0)
        });
      } catch (error) {
        sendJson(response, 502, {
          source,
          ok: false,
          error: error.message
        });
      }
      return;
    }

    if (request.method === 'GET' && requestUrl.pathname === '/favicon.ico') {
      response.writeHead(204).end();
      return;
    }

    if (
      ['GET', 'HEAD'].includes(request.method)
      && serveStatic(publicDirectory, requestUrl.pathname, response, request.method)
    ) {
      return;
    }

    sendJson(response, 404, { error: '未找到资源' });
  });

  return {
    server,
    proxyMode: proxyResolver.mode
  };
}

function start() {
  const host = process.env.HOST || '127.0.0.1';
  const port = Number(process.env.PORT) || DEFAULT_PORT;
  let app;

  try {
    app = createAppServer();
  } catch (error) {
    console.error(`启动失败：${error.message}`);
    process.exitCode = 1;
    return;
  }

  app.server.listen(port, host, () => {
    const displayHost = host === '0.0.0.0' ? 'localhost' : host;
    console.log(`Atlas Gallery: http://${displayHost}:${port}`);
    console.log(`Upstream proxy mode: ${app.proxyMode}`);
  });
}

if (require.main === module) {
  start();
}

module.exports = {
  ALLOWED_HOSTS,
  SITE_HEALTH_TARGETS,
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
};
