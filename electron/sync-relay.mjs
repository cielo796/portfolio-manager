import { createServer, request } from 'node:http';

const MAX_BODY_BYTES = 20 * 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 30000;
const PEER_PREFIX = '/api/sync/peer/';

const isAllowedAddress = (address) => {
  if (address === '::1') return true;
  const parts = address.split('.');
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255)) {
    return false;
  }
  const [first, second] = parts.map(Number);
  return first === 127 || first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168);
};

const isPeerPath = (rawUrl) => {
  if (!rawUrl?.startsWith(PEER_PREFIX)) return false;
  try {
    const pathname = rawUrl.split('?')[0];
    // 転送先のURL正規化で同期用パスの外へ抜ける経路も拒否する。
    return !rawUrl.includes('#') && pathname.split('/').every((part) => {
      const decoded = decodeURIComponent(part);
      return decoded !== '.' && decoded !== '..' && !/[\\/]/.test(decoded);
    });
  } catch {
    return false;
  }
};

export const startSyncRelay = ({ listenPort, targetOrigin, log = () => {} }) =>
  new Promise((resolve, reject) => {
    const target = new URL(targetOrigin);
    if (target.protocol !== 'http:') {
      reject(new Error('Sync relay target must use http:'));
      return;
    }

    const sockets = new Set();
    const upstreamRequests = new Set();
    const server = createServer((req, res) => {
      const address = (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
      const reply = (status) => {
        res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`${status}\n`);
      };

      req.on('error', () => res.destroy());
      if (!isAllowedAddress(address)) {
        req.resume();
        reply(403);
        return;
      }
      if (!isPeerPath(req.url)) {
        req.resume();
        reply(404);
        return;
      }
      if (Number(req.headers['content-length']) > MAX_BODY_BYTES) {
        req.resume();
        reply(413);
        return;
      }

      const chunks = [];
      let bodyBytes = 0;
      req.on('data', (chunk) => {
        bodyBytes += chunk.length;
        if (bodyBytes > MAX_BODY_BYTES) {
          if (!res.writableEnded) reply(413);
          chunks.length = 0;
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => {
        if (res.destroyed || res.writableEnded) return;
        const headers = { 'x-forwarded-for': address };
        for (const [name, value] of Object.entries(req.headers)) {
          if (name === 'content-type' || (name.startsWith('x-pm-') && name !== 'x-pm-discovery-token')) headers[name] = value;
        }
        headers['content-length'] = String(bodyBytes);

        const upstream = request({
          hostname: target.hostname,
          port: target.port || 80,
          method: req.method,
          path: req.url,
          headers,
        });
        upstreamRequests.add(upstream);
        const fail = (status) => {
          if (!res.destroyed && !res.writableEnded) {
            if (res.headersSent) res.destroy();
            else reply(status);
          }
          upstream.destroy();
        };
        const timeout = setTimeout(() => fail(504), UPSTREAM_TIMEOUT_MS);
        upstream.on('error', () => fail(502));
        upstream.on('close', () => {
          clearTimeout(timeout);
          upstreamRequests.delete(upstream);
        });
        res.on('close', () => upstream.destroy());
        upstream.on('response', (response) => {
          const responseHeaders = { ...response.headers };
          const hopHeaders = ['connection', 'keep-alive', 'transfer-encoding', 'te', 'trailer', 'upgrade',
            ...(response.headers.connection || '').split(',').map((name) => name.trim().toLowerCase())];
          for (const name of hopHeaders) delete responseHeaders[name];
          res.writeHead(response.statusCode || 502, responseHeaders);
          response.on('error', () => fail(502));
          response.pipe(res);
        });
        upstream.end(Buffer.concat(chunks, bodyBytes));
      });
    });

    server.on('connection', (socket) => {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
    });
    server.once('error', reject);
    server.listen(listenPort, '0.0.0.0', () => {
      server.removeListener('error', reject);
      server.on('error', (error) => log(`[sync-relay] ${error.message}`));
      const port = server.address().port;
      log(`[sync-relay] Listening on 0.0.0.0:${port}`);
      let closing;
      resolve({
        port,
        close: () => closing ||= new Promise((resolveClose, rejectClose) => {
          server.close((error) => error ? rejectClose(error) : resolveClose());
          for (const upstream of upstreamRequests) upstream.destroy();
          for (const socket of sockets) socket.destroy();
        }),
      });
    });
  });
