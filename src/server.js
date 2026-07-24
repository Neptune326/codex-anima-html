const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const tls = require('node:tls');
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_PORT = 4173;
const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;
const MAX_PROXY_REQUESTS = 12;
const REQUEST_TIMEOUT_MS = 25000;

const ALLOWED_HOSTS = new Set([
  'yande.re',
  'konachan.com',
  'www.konachan.com',
  'gelbooru.com',
  'www.gelbooru.com',
  'danbooru.donmai.us',
  'capi-v2.sankakucomplex.com',
  'safebooru.org',
  'www.safebooru.org',
  'api.rule34.xxx',
  'rule34.xxx',
  'e621.net',
  'e926.net'
]);

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

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

async function createUpstreamRequest(target, proxyResolver, onResponse) {
  const proxy = await proxyResolver.resolve();
  const options = {
    hostname: target.hostname,
    port: Number(target.port) || 443,
    path: `${target.pathname}${target.search}`,
    method: 'GET',
    headers: {
      Accept: 'application/json,text/plain,*/*',
      'Accept-Encoding': 'identity',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.7',
      'User-Agent': 'AtlasGallery/2.0 (local and self-hosted media browser)'
    }
  };

  if (proxy) {
    const socket = await openProxyTunnel(proxy, target);
    options.agent = false;
    options.createConnection = () => socket;
  }

  return https.request(options, onResponse);
}

function fetchUpstream(target, proxyResolver, redirects = 0) {
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
          const redirectedTarget = validateTarget(new URL(location, target).href);
          fetchUpstream(redirectedTarget, proxyResolver, redirects + 1).then(resolve, reject);
        } catch (error) {
          reject(error);
        }
        return;
      }

      const declaredLength = Number(upstream.headers['content-length']) || 0;
      if (declaredLength > MAX_RESPONSE_BYTES) {
        upstream.destroy();
        reject(new Error('目标站点响应超过 16 MB'));
        return;
      }

      const chunks = [];
      let size = 0;

      upstream.on('data', chunk => {
        size += chunk.length;

        if (size > MAX_RESPONSE_BYTES) {
          upstream.destroy(new Error('目标站点响应超过 16 MB'));
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

  response.writeHead(200, {
    'Content-Type': contentType,
    'Cache-Control': extension === '.html' ? 'no-cache' : 'public, max-age=300',
    'Content-Security-Policy': [
      "default-src 'self'",
      "img-src 'self' https: data: blob:",
      "media-src 'self' https: blob:",
      "connect-src 'self'",
      "script-src 'self'",
      "style-src 'self'",
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

    if (request.method === 'GET' && requestUrl.pathname === '/api/health') {
      sendJson(response, 200, {
        ok: true,
        version: 2,
        proxyMode: proxyResolver.mode
      });
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
  createAppServer,
  parseProxy,
  resolveStaticPath,
  validateTarget
};
