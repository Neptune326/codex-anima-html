const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const tls = require('node:tls');
const fs = require('node:fs');
const path = require('node:path');

const host = process.env.HOST || '0.0.0.0';
const port = Number(process.env.PORT) || 4173;
const indexPath = path.join(__dirname, 'index.html');
const allowedHosts = new Set([
  'yande.re',
  'gelbooru.com',
  'www.gelbooru.com',
  'danbooru.donmai.us',
  'capi-v2.sankakucomplex.com',
  'safebooru.org',
  'www.safebooru.org',
  'api.rule34.xxx',
  'rule34.xxx'
]);
const maxResponseBytes = 16 * 1024 * 1024;
const configuredProxy = process.env.UPSTREAM_PROXY || process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY || '';
const localProxyCandidates = process.platform === 'win32' && !configuredProxy
  ? ['http://127.0.0.1:7897', 'http://127.0.0.1:7890']
  : [];
let detectedProxy;

function sendJson(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
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
  if (target.protocol !== 'https:' || !allowedHosts.has(target.hostname.toLowerCase())) {
    throw new Error('目标站点不在代理白名单中');
  }
  if (target.username || target.password) throw new Error('目标地址不能包含凭据');
  return target;
}

function connectTcp(hostname, port, timeout = 1500) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, hostname);
    socket.setTimeout(timeout);
    socket.once('connect', () => {
      socket.setTimeout(0);
      resolve(socket);
    });
    socket.once('timeout', () => socket.destroy(new Error('连接代理超时')));
    socket.once('error', reject);
  });
}

async function resolveProxy() {
  if (detectedProxy !== undefined) return detectedProxy;
  const candidates = configuredProxy ? [configuredProxy] : localProxyCandidates;
  for (const value of candidates) {
    let candidate;
    try {
      candidate = new URL(value);
      if (!['http:', 'https:'].includes(candidate.protocol)) continue;
      const socket = await connectTcp(candidate.hostname, Number(candidate.port) || (candidate.protocol === 'https:' ? 443 : 80));
      socket.destroy();
      detectedProxy = candidate;
      return detectedProxy;
    } catch {}
  }
  detectedProxy = null;
  return detectedProxy;
}

function openProxyTunnel(proxy, target) {
  return new Promise((resolve, reject) => {
    const transport = proxy.protocol === 'https:' ? https : http;
    const headers = { Host: `${target.hostname}:443` };
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
    request.setTimeout(10000, () => request.destroy(new Error('连接上游代理超时')));
    request.once('connect', (response, socket, head) => {
      if (response.statusCode !== 200) {
        socket.destroy();
        reject(new Error(`上游代理 CONNECT 返回 HTTP ${response.statusCode}`));
        return;
      }
      if (head.length) socket.unshift(head);
      const secureSocket = tls.connect({ socket, servername: target.hostname });
      secureSocket.setTimeout(25000);
      secureSocket.once('secureConnect', () => {
        secureSocket.setTimeout(0);
        resolve(secureSocket);
      });
      secureSocket.once('timeout', () => secureSocket.destroy(new Error('目标站点请求超时')));
      secureSocket.once('error', reject);
    });
    request.once('error', reject);
    request.end();
  });
}

async function createUpstreamRequest(target, onResponse) {
  const proxy = await resolveProxy();
  const options = {
    hostname: target.hostname,
    port: Number(target.port) || 443,
    path: `${target.pathname}${target.search}`,
    method: 'GET',
    headers: {
      Accept: 'application/json,text/plain,*/*',
      'Accept-Language': 'en-US,en;q=0.8',
      'User-Agent': 'Mozilla/5.0 (compatible; AtlasGallery/1.0)'
    }
  };
  if (proxy) {
    const socket = await openProxyTunnel(proxy, target);
    options.agent = false;
    options.createConnection = () => socket;
  }
  return https.request(options, onResponse);
}

function fetchUpstream(target, redirects = 0) {
  return new Promise((resolve, reject) => {
    let upstreamRequest;
    createUpstreamRequest(target, upstream => {
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
        let redirected;
        try {
          redirected = validateTarget(new URL(location, target).href);
        } catch (error) {
          reject(error);
          return;
        }
        fetchUpstream(redirected, redirects + 1).then(resolve, reject);
        return;
      }

      const declaredLength = Number(upstream.headers['content-length']) || 0;
      if (declaredLength > maxResponseBytes) {
        upstream.destroy();
        reject(new Error('目标站点响应超过 16 MB'));
        return;
      }
      const chunks = [];
      let size = 0;
      upstream.on('data', chunk => {
        size += chunk.length;
        if (size > maxResponseBytes) {
          upstream.destroy(new Error('目标站点响应超过 16 MB'));
          return;
        }
        chunks.push(chunk);
      });
      upstream.on('end', () => resolve({
        status,
        contentType: upstream.headers['content-type'],
        bytes: Buffer.concat(chunks)
      }));
      upstream.on('error', reject);
    }).then(request => {
      upstreamRequest = request;
      upstreamRequest.setTimeout(25000, () => upstreamRequest.destroy(new Error('目标站点请求超时')));
      upstreamRequest.on('error', reject);
      upstreamRequest.end();
    }, reject);
  });
}

async function proxy(requestUrl, response) {
  let target;
  try {
    target = validateTarget(requestUrl.searchParams.get('url') || '');
  } catch (error) {
    sendJson(response, 400, { error: error.message });
    return;
  }

  try {
    const upstream = await fetchUpstream(target);
    response.writeHead(upstream.status, {
      'Content-Type': upstream.contentType || 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=60',
      'X-Content-Type-Options': 'nosniff'
    });
    response.end(upstream.bytes);
  } catch (error) {
    sendJson(response, 502, { error: error.message });
  }
}

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host || 'localhost'}`);

  if (request.method === 'GET' && requestUrl.pathname === '/api/proxy') {
    await proxy(requestUrl, response);
    return;
  }
  if (request.method === 'GET' && requestUrl.pathname === '/api/health') {
    sendJson(response, 200, { ok: true });
    return;
  }
  if (request.method === 'GET' && (requestUrl.pathname === '/' || requestUrl.pathname === '/index.html')) {
    fs.createReadStream(indexPath)
      .on('error', () => sendJson(response, 500, { error: '无法读取 index.html' }))
      .pipe(response.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff'
      }));
    return;
  }
  if (request.method === 'GET' && requestUrl.pathname === '/favicon.ico') {
    response.writeHead(204).end();
    return;
  }
  sendJson(response, 404, { error: '未找到资源' });
});

server.listen(port, host, () => {
  console.log(`Atlas Gallery: http://localhost:${port}`);
  if (configuredProxy) console.log(`Upstream proxy: ${new URL(configuredProxy).origin}`);
  else if (localProxyCandidates.length) console.log('Upstream proxy: auto-detecting local Clash ports');
});
